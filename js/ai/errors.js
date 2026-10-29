/**
 * ai/errors.js — Erreurs normalisées des fournisseurs IA.
 *
 * kind :
 *  config            fournisseur/modèle/clé manquants (rien n'a été envoyé)
 *  busy              une requête est déjà en cours (anti double soumission)
 *  auth              clé invalide / accès refusé                → ni retry ni bascule
 *  validation        requête rejetée (modèle inconnu, format…)  → ni retry ni bascule
 *  refusal           contenu refusé / filtré par le modèle      → ni retry ni bascule
 *  invalid_response  réponse vide ou illisible                  → ni retry ni bascule
 *  rate_limit        429                                        → retry (Retry-After) puis bascule
 *  quota             quota/crédit épuisé                        → pas de retry, bascule possible
 *  unavailable       5xx / surcharge                            → retry puis bascule
 *  network           échec réseau / CORS / DNS                  → retry puis bascule
 *  timeout           délai dépassé                              → pas de retry (évite un double coût), bascule possible
 *  canceled          annulé par l'utilisateur                   → rien
 */
import { redactSecrets } from '../utils.js';

export class AIError extends Error {
  /**
   * @param {string} kind
   * @param {string} message  message lisible (déjà rédigé pour l'utilisateur)
   * @param {{status?:number, provider?:string, retryAfterMs?:number, code?:string, secrets?:string[]}} [extra]
   */
  constructor(kind, message, extra = {}) {
    super(redactSecrets(message, extra.secrets));
    this.name = 'AIError';
    this.kind = kind;
    this.status = extra.status;
    this.provider = extra.provider;
    this.retryAfterMs = extra.retryAfterMs;
    this.code = extra.code;
  }
}

export const RETRYABLE_KINDS = new Set(['rate_limit', 'unavailable', 'network']);
export const FALLBACK_KINDS = new Set(['rate_limit', 'quota', 'unavailable', 'network', 'timeout']);

export const isRetryable = (e) => e instanceof AIError && RETRYABLE_KINDS.has(e.kind);
export const isFallbackable = (e) => e instanceof AIError && FALLBACK_KINDS.has(e.kind);

/** Statut HTTP → nature de l'erreur (valeurs par défaut ; les adaptateurs peuvent affiner). */
export function classifyStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return status === 504 ? 'unavailable' : 'timeout';
  if (status === 402) return 'quota';
  if (status >= 500) return 'unavailable'; // inclut 529 « overloaded » d'Anthropic
  if (status >= 400) return 'validation';
  return 'unavailable';
}

/** Retry-After : nombre de secondes OU date HTTP. Renvoie des ms, ou undefined. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return undefined;
  const s = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000);
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : Math.max(0, t - now);
}

/** Message utilisateur (français) par nature d'erreur. */
export function friendlyMessage(kind, providerLabel = 'le fournisseur') {
  const m = {
    config: 'Aucun fournisseur IA n\'est configuré. Ouvrez Réglages › IA pour renseigner un fournisseur, un modèle et une clé.',
    busy: 'Une requête est déjà en cours.',
    auth: `Clé API refusée par ${providerLabel}. Vérifiez la clé et ses autorisations.`,
    validation: `Requête rejetée par ${providerLabel} (modèle inconnu ou paramètres refusés). Vérifiez le nom du modèle.`,
    refusal: `${providerLabel} a refusé de répondre à ce contenu. Reformulez votre message.`,
    invalid_response: `Réponse vide ou illisible de ${providerLabel}.`,
    rate_limit: `Trop de requêtes pour ${providerLabel}. Réessayez dans un instant.`,
    quota: `Quota ou crédit épuisé chez ${providerLabel}.`,
    unavailable: `${providerLabel} est momentanément indisponible.`,
    network: `Connexion impossible à ${providerLabel} (réseau coupé, blocage CORS ou URL incorrecte).`,
    timeout: `${providerLabel} n'a pas répondu à temps.`,
    canceled: 'Requête annulée.',
  };
  return m[kind] ?? `Erreur inattendue (${providerLabel}).`;
}
