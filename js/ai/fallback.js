/**
 * ai/fallback.js — Nouvelles tentatives (backoff exponentiel + jitter, Retry-After) et règles de bascule.
 *
 * Règles (voir errors.js pour les natures d'erreur) :
 *  - Retry sur le MÊME fournisseur : rate_limit, unavailable, network uniquement.
 *  - Bascule vers le fournisseur de secours : rate_limit, quota, unavailable, network, timeout (après épuisement des retries).
 *  - JAMAIS de retry ni de bascule pour : auth, validation, refusal, invalid_response, config, busy, canceled.
 *  - Pas de retry/bascule automatique si des jetons ont déjà été diffusés à l'utilisateur
 *    (évite un second appel facturé et un texte dupliqué) : l'utilisateur relance manuellement.
 */
import { isRetryable } from './errors.js';

/** Backoff « full jitter » : délai aléatoire dans [0, min(cap, base·2^(n-1))]. */
export function computeBackoff(attempt, { baseMs = 500, capMs = 8000, random = Math.random } = {}) {
  const ceiling = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  return Math.round(random() * ceiling);
}

/**
 * Exécute `fn(attempt)` avec nouvelles tentatives.
 * @returns {Promise<{value:any, attempts:number}>}
 * Si Retry-After est présent, il est respecté ; s'il dépasse `retryAfterCapMs`, on n'attend pas :
 * l'erreur est relancée (ce qui permet à l'appelant de basculer vers le secours).
 */
export async function withRetry(fn, {
  maxAttempts = 3, baseMs = 500, capMs = 8000, retryAfterCapMs = 30000,
  sleep, random = Math.random, signal, shouldRetry = isRetryable, onRetry,
} = {}) {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return { value: await fn(attempt), attempts: attempt };
    } catch (e) {
      e.attempts = attempt;
      if (attempt >= maxAttempts || !shouldRetry(e)) throw e;
      let delay;
      if (e.retryAfterMs != null) {
        if (e.retryAfterMs > retryAfterCapMs) throw e;
        delay = e.retryAfterMs;
      } else {
        delay = computeBackoff(attempt, { baseMs, capMs, random });
      }
      onRetry?.({ attempt, delay, error: e });
      await sleep(delay, signal);
    }
  }
}
