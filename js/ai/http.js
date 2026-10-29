/**
 * ai/http.js — Couche HTTP commune : délais d'attente, annulation, erreurs normalisées, lecture SSE.
 * `fetchImpl` est injectable (tests).
 */
import { AIError, classifyStatus, parseRetryAfter, friendlyMessage } from './errors.js';
import { redactSecrets } from '../utils.js';

/**
 * Garde de requête : fusionne l'annulation utilisateur et le délai d'attente.
 * `arm(ms)` (ré)arme le délai ; on l'utilise pour le délai de réponse puis comme délai d'inactivité du flux.
 */
export function createGuard({ signal, timeoutMs = 30000 } = {}) {
  const ctl = new AbortController();
  let timer = null;
  let timedOut = false;
  let userAborted = false;
  const onAbort = () => { userAborted = true; ctl.abort(); };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    arm(ms = timeoutMs) {
      clearTimeout(timer);
      if (ms > 0) timer = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
    },
    clear() { clearTimeout(timer); },
    dispose() { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
    get timedOut() { return timedOut; },
    get userAborted() { return userAborted; },
  };
}

/** Convertit une exception d'E/S en AIError normalisée. */
export function toIOError(e, guard, { provider, label, secrets }) {
  if (e instanceof AIError) return e;
  if (guard.userAborted) return new AIError('canceled', friendlyMessage('canceled'), { provider, secrets });
  if (guard.timedOut) return new AIError('timeout', friendlyMessage('timeout', label), { provider, secrets });
  return new AIError('network', friendlyMessage('network', label), { provider, secrets });
}

/** Construit une AIError à partir d'une réponse HTTP non-OK. `refine(status, json)` peut préciser la nature. */
export async function errorFromResponse(res, { provider, label, secrets, refine }) {
  let text = '';
  try { text = (await res.text()).slice(0, 4000); } catch { /* ignore */ }
  let json = null;
  try { json = JSON.parse(text); } catch { /* corps non JSON */ }
  const refined = refine?.(res.status, json) ?? {};
  const kind = refined.kind ?? classifyStatus(res.status);
  const retryAfterMs = parseRetryAfter(res.headers?.get?.('retry-after'));
  // Message affiché : texte convivial + détail technique du fournisseur, avec secrets masqués.
  const detail = refined.detail ?? json?.error?.message ?? json?.message ?? '';
  const base = friendlyMessage(kind, label);
  const msg = detail ? `${base} (${String(detail).slice(0, 300)})` : base;
  return new AIError(kind, msg, { status: res.status, provider, retryAfterMs, secrets });
}

/**
 * Envoie une requête JSON. Lève une AIError normalisée en cas d'échec.
 * @returns {Promise<Response>} réponse OK (corps non consommé)
 */
export async function request({ url, method = 'POST', headers = {}, body, guard, fetchImpl, provider, label, secrets = [], refine }) {
  guard.arm();
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: guard.signal,
      credentials: 'omit', // jamais de cookies vers les API tierces
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    throw toIOError(e, guard, { provider, label, secrets });
  }
  if (!res.ok) {
    guard.clear();
    throw await errorFromResponse(res, { provider, label, secrets, refine });
  }
  return res;
}

/** Lit un corps JSON sous la surveillance du délai d'attente. */
export async function readJson(res, guard, ctxErr) {
  guard.arm();
  try {
    return await res.json();
  } catch (e) {
    if (guard.userAborted || guard.timedOut) throw toIOError(e, guard, ctxErr);
    throw new AIError('invalid_response', friendlyMessage('invalid_response', ctxErr.label), { provider: ctxErr.provider });
  } finally {
    guard.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Server-Sent Events                                                   */
/* ------------------------------------------------------------------ */

/** Analyseur SSE incrémental (pur, testable). */
export class SSEParser {
  #buf = '';
  /** @returns {{event:string, data:string}[]} événements complets */
  feed(chunk) {
    this.#buf += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const out = [];
    let idx;
    while ((idx = this.#buf.indexOf('\n\n')) !== -1) {
      const block = this.#buf.slice(0, idx);
      this.#buf = this.#buf.slice(idx + 2);
      const ev = parseBlock(block);
      if (ev) out.push(ev);
    }
    return out;
  }
  flush() {
    const rest = this.#buf.trim();
    this.#buf = '';
    const ev = rest ? parseBlock(rest) : null;
    return ev ? [ev] : [];
  }
}
function parseBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    let val = i === -1 ? '' : line.slice(i + 1);
    if (val.startsWith(' ')) val = val.slice(1);
    if (field === 'event') event = val;
    else if (field === 'data') data.push(val);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

/**
 * Lit un flux SSE ; `onEvent({event,data})` est appelé pour chaque événement.
 * Le délai d'inactivité (`idleMs`) est réarmé à chaque fragment reçu.
 */
export async function readSSE(res, onEvent, guard, { idleMs = 30000, provider, label, secrets } = {}) {
  const parser = new SSEParser();
  const dec = new TextDecoder();
  try {
    if (!res.body?.getReader) {
      for (const ev of [...parser.feed(await res.text() + '\n\n'), ...parser.flush()]) onEvent(ev);
      return;
    }
    const reader = res.body.getReader();
    // L'annulation / le délai d'inactivité doivent interrompre la lecture même si le flux reste muet.
    const aborted = new Promise((_, reject) => {
      const fire = () => reject(new DOMException('Aborted', 'AbortError'));
      if (guard.signal.aborted) fire(); else guard.signal.addEventListener('abort', fire, { once: true });
    });
    aborted.catch(() => {});
    for (;;) {
      guard.arm(idleMs);
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      for (const ev of parser.feed(dec.decode(value, { stream: true }))) onEvent(ev);
    }
    for (const ev of [...parser.feed(dec.decode() + '\n\n'), ...parser.flush()]) onEvent(ev);
  } catch (e) {
    res.body?.cancel?.().catch?.(() => {});
    throw toIOError(e, guard, { provider, label, secrets });
  } finally {
    guard.clear();
  }
}

/** Masque d'éventuels secrets dans un texte destiné à l'affichage/aux logs. */
export const safe = (text, secrets) => redactSecrets(text, secrets);
