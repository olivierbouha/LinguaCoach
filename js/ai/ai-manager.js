/**
 * ai/ai-manager.js — Gestionnaire IA, indépendant des modules pédagogiques.
 *
 * Les modules (écriture, écoute, oral) appellent `manager.ask(request, opts)` sans connaître le fournisseur.
 *
 * request : { system, messages:[{role:'user'|'assistant', content}], json?, maxTokens?, temperature?, audio?:{mimeType, base64} }
 * opts    : { signal, onToken(text), onReset(), onNotice({type:'retry'|'fallback', ...}) }
 * result  : { text, provider, model, usedFallback, attempts, finishReason }
 *
 * Garanties :
 *  - Une seule requête à la fois (anti double soumission) : un second appel est rejeté (kind 'busy').
 *  - Retries (backoff exponentiel + jitter, Retry-After respecté) uniquement pour rate_limit/unavailable/network.
 *  - Bascule vers le secours : uniquement s'il est activé, complet, compatible avec la requête (ex. audio),
 *    différent du principal, et si l'erreur est de nature « indisponibilité » (voir fallback.js).
 *  - Aucune bascule ni retry après le début du flux (jetons déjà affichés) : l'erreur porte `partialText`.
 *  - Le contexte et la question sont conservés tels quels lors d'une bascule (même objet `request`).
 *  - Les clés ne sont jamais incluses dans les messages d'erreur (masquage dans errors.js / http.js).
 */
import { AIError, isFallbackable, friendlyMessage } from './errors.js';
import { withRetry } from './fallback.js';
import { PROVIDERS } from './providers/index.js';
import { sleep as realSleep } from '../utils.js';

export class AIManager {
  #busy = false;
  #ctl = null;

  /**
   * @param {object} deps
   * @param {() => {primary:object, fallback:object}} deps.getConfig  renvoie
   *   { primary:{provider,model,baseUrl,apiKey}, fallback:{enabled,provider,model,baseUrl,apiKey} }
   */
  constructor({ getConfig, providers = PROVIDERS, fetchImpl, sleep = realSleep, random = Math.random,
    timeoutMs = 45000, idleMs = 30000, maxAttempts = 3 }) {
    this.getConfig = getConfig;
    this.providers = providers;
    this.fetch = fetchImpl ?? ((...a) => globalThis.fetch(...a));
    this.sleep = sleep;
    this.random = random;
    this.timeoutMs = timeoutMs;
    this.idleMs = idleMs;
    this.maxAttempts = maxAttempts;
  }

  /** Résout un emplacement (primary|fallback) en { provider, cfg } ou null. */
  resolve(slot) {
    const c = this.getConfig()?.[slot];
    if (!c || !c.provider) return null;
    if (slot === 'fallback' && !c.enabled) return null;
    const provider = this.providers[c.provider];
    if (!provider) return null;
    return { slot, provider, cfg: { apiKey: c.apiKey || '', model: (c.model || '').trim(), baseUrl: (c.baseUrl || '').trim() } };
  }

  /** Un emplacement est utilisable s'il a un modèle, la clé requise et l'URL requise. */
  isUsable(r) {
    if (!r) return false;
    if (!r.cfg.model) return false;
    if (r.provider.requiresKey && !r.cfg.apiKey) return false;
    if (r.provider.requiresBaseUrl && !r.cfg.baseUrl) return false;
    return true;
  }

  isConfigured() { return this.isUsable(this.resolve('primary')); }
  hasFallback() { return this.isUsable(this.resolve('fallback')); }
  get busy() { return this.#busy; }
  providerLabel(id) { return this.providers[id]?.label ?? id; }

  /** Annule la requête en cours (si l'adaptateur la supporte : tous via AbortController). */
  cancel() { this.#ctl?.abort(); }

  /** Le secours est-il compatible avec cette requête ? (ex. envoi audio → capacité audioInput) */
  #fallbackFor(primary, req) {
    const fb = this.resolve('fallback');
    if (!this.isUsable(fb)) return null;
    if (fb.provider.id === primary.provider.id && fb.cfg.model === primary.cfg.model && fb.cfg.baseUrl === primary.cfg.baseUrl) return null;
    if (req.audio && !fb.provider.capabilities.audioInput) return null;
    return fb;
  }

  async ask(req, { signal, onToken, onReset, onNotice } = {}) {
    if (this.#busy) throw new AIError('busy', friendlyMessage('busy'));
    const primary = this.resolve('primary');
    if (!this.isUsable(primary)) throw new AIError('config', friendlyMessage('config'), { code: 'not_configured' });
    if (req.audio && !primary.provider.capabilities.audioInput) {
      throw new AIError('validation', `${primary.provider.label} ne prend pas en charge l'audio en entrée.`, { provider: primary.provider.id });
    }

    this.#busy = true;
    const ctl = new AbortController();
    this.#ctl = ctl;
    const onAbort = () => ctl.abort();
    if (signal) signal.aborted ? ctl.abort() : signal.addEventListener('abort', onAbort, { once: true });

    let acc = '';
    const tokenCb = onToken ? (tok) => { acc += tok; onToken(tok); } : undefined;
    const run = (target, maxAttempts) => this.#run(target, req, { ctl, tokenCb, onNotice, getAcc: () => acc, maxAttempts });

    try {
      try {
        return await run(primary, this.maxAttempts);
      } catch (e) {
        e.provider ??= primary.provider.id;
        if (acc) e.partialText = acc; // flux commencé : pas de relance automatique
        if (acc || !isFallbackable(e)) throw e;
        const fb = this.#fallbackFor(primary, req);
        if (!fb) throw e;
        onNotice?.({
          type: 'fallback', from: primary.provider.id, to: fb.provider.id, reason: e.kind,
          message: `${primary.provider.label} indisponible (${e.kind}) : bascule vers ${fb.provider.label}.`,
        });
        try {
          const r = await run(fb, 2);
          return { ...r, usedFallback: true, primaryError: { kind: e.kind } };
        } catch (e2) {
          e2.primaryError = e;
          if (acc) e2.partialText = acc;
          throw e2;
        }
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      this.#busy = false;
      this.#ctl = null;
    }
  }

  async #run(target, req, { ctl, tokenCb, onNotice, getAcc, maxAttempts }) {
    const { value, attempts } = await withRetry(
      () => target.provider.complete(target.cfg, req, {
        fetch: this.fetch, signal: ctl.signal, onToken: tokenCb, timeoutMs: this.timeoutMs, idleMs: this.idleMs,
      }),
      {
        maxAttempts, sleep: this.sleep, random: this.random, signal: ctl.signal,
        shouldRetry: (e) => !getAcc() && ['rate_limit', 'unavailable', 'network'].includes(e.kind),
        onRetry: ({ attempt, delay, error }) => onNotice?.({
          type: 'retry', provider: target.provider.id, attempt, delayMs: delay, reason: error.kind,
          message: `${target.provider.label} : nouvelle tentative dans ${Math.max(1, Math.round(delay / 1000))} s…`,
        }),
      }
    );
    return { ...value, usedFallback: false, attempts };
  }

  /** Test de connexion : requête minimale, hors flux. Renvoie { ok, provider, model, ms } ou lève une AIError. */
  async test(slot = 'primary', { signal } = {}) {
    const target = this.resolve(slot);
    if (!this.isUsable(target)) throw new AIError('config', friendlyMessage('config'), { code: 'not_configured' });
    if (this.#busy) throw new AIError('busy', friendlyMessage('busy'));
    this.#busy = true;
    const t0 = Date.now();
    try {
      await target.provider.complete(target.cfg,
        { system: 'You are a connectivity test. Reply with the single word: OK', messages: [{ role: 'user', content: 'ping' }] },
        { fetch: this.fetch, signal, timeoutMs: Math.min(this.timeoutMs, 20000) });
      return { ok: true, provider: target.provider.id, model: target.cfg.model, ms: Date.now() - t0 };
    } finally {
      this.#busy = false;
    }
  }

  /** Liste les modèles disponibles via l'API du fournisseur (aucun modèle n'est codé en dur). */
  async listModels(slot = 'primary', { signal } = {}) {
    const target = this.resolve(slot);
    if (!target) throw new AIError('config', friendlyMessage('config'), { code: 'not_configured' });
    if (target.provider.requiresKey && !target.cfg.apiKey) throw new AIError('config', 'Saisissez d\'abord la clé API.', { code: 'no_key' });
    if (target.provider.requiresBaseUrl && !target.cfg.baseUrl) throw new AIError('config', 'Saisissez d\'abord l\'URL de base.', { code: 'no_url' });
    return target.provider.listModels(target.cfg, { fetch: this.fetch, signal });
  }
}
