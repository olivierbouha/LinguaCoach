/**
 * Adaptateur Anthropic — API Messages (POST /v1/messages), flux SSE.
 *
 *  Auth    : en-têtes `x-api-key` + `anthropic-version: 2023-06-01`
 *  Navigateur : l'en-tête `anthropic-dangerous-direct-browser-access: true` est requis pour les appels CORS directs.
 *               (Il signifie que la clé est exposée au navigateur : voir README, « Sécurité ».)
 *  Corps   : { model, max_tokens (obligatoire), system, messages[{role,content}], stream }
 *            Les messages doivent alterner user/assistant et commencer par « user » → normalisation ci-dessous.
 *  Flux    : événements content_block_delta (delta.type = 'text_delta'), message_delta (stop_reason), error.
 *  JSON    : pas de mode JSON natif universel → la consigne et l'analyse tolérante s'en chargent.
 *  Audio   : non pris en charge par l'API Messages.
 *  Liste   : GET /v1/models
 */
import { AIError, friendlyMessage } from '../errors.js';
import { request, readJson, readSSE, createGuard, toIOError } from '../http.js';

const BASE = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 2048;

function refine(status, json) {
  const t = json?.error?.type;
  if (t === 'authentication_error' || t === 'permission_error') return { kind: 'auth' };
  if (t === 'rate_limit_error') return { kind: 'rate_limit' };
  if (t === 'overloaded_error' || t === 'api_error') return { kind: 'unavailable' };
  if (t === 'not_found_error') return { kind: 'validation', detail: 'modèle introuvable' };
  if (t === 'billing_error') return { kind: 'quota' };
  return {};
}

/** Garantit : premier message « user », rôles alternés (fusion des messages consécutifs de même rôle). */
export function normalizeMessages(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n\n' + m.content;
    else out.push({ role, content: m.content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export function buildBody(req, cfg, stream) {
  return {
    model: cfg.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(req.system ? { system: req.system } : {}),
    messages: normalizeMessages(req.messages),
    ...(stream ? { stream: true } : {}),
    ...(req.temperature != null ? { temperature: req.temperature } : {}),
  };
}

const headers = (key) => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': VERSION,
  'anthropic-dangerous-direct-browser-access': 'true',
});

export const anthropic = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  defaultBaseUrl: BASE,
  requiresKey: true,
  requiresBaseUrl: false,
  capabilities: { streaming: true, audioInput: false, jsonMode: false, listModels: true },

  async complete(cfg, req, ctx) {
    const label = this.label;
    const secrets = [cfg.apiKey];
    const idErr = { provider: this.id, label, secrets };
    const guard = createGuard({ signal: ctx.signal, timeoutMs: ctx.timeoutMs });
    try {
      const stream = typeof ctx.onToken === 'function';
      const res = await request({
        url: `${(cfg.baseUrl || BASE).replace(/\/+$/, '')}/messages`, guard, fetchImpl: ctx.fetch, ...idErr, refine,
        headers: headers(cfg.apiKey), body: buildBody(req, cfg, stream),
      });
      let text = '', stopReason = null;
      if (stream) {
        await readSSE(res, ({ event, data }) => {
          let j;
          try { j = JSON.parse(data); } catch { return; }
          if (event === 'error' || j.type === 'error') {
            const k = refine(0, j).kind ?? 'unavailable';
            throw new AIError(k, friendlyMessage(k, label) + ` (${j.error?.message ?? ''})`.slice(0, 300), { provider: this.id, secrets });
          }
          if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
            text += j.delta.text;
            ctx.onToken(j.delta.text);
          } else if (j.type === 'message_delta' && j.delta?.stop_reason) {
            stopReason = j.delta.stop_reason;
          }
        }, guard, { idleMs: ctx.idleMs, ...idErr });
      } else {
        const j = await readJson(res, guard, idErr);
        text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        stopReason = j.stop_reason ?? null;
      }
      if (!text) {
        if (stopReason === 'refusal') throw new AIError('refusal', friendlyMessage('refusal', label), { provider: this.id });
        throw new AIError('invalid_response', friendlyMessage('invalid_response', label), { provider: this.id });
      }
      return { text, finishReason: stopReason, provider: this.id, model: cfg.model };
    } catch (e) {
      throw toIOError(e, guard, idErr);
    } finally {
      guard.dispose();
    }
  },

  async listModels(cfg, ctx) {
    const idErr = { provider: this.id, label: this.label, secrets: [cfg.apiKey] };
    const guard = createGuard({ signal: ctx.signal, timeoutMs: ctx.timeoutMs ?? 15000 });
    try {
      const res = await request({
        url: `${(cfg.baseUrl || BASE).replace(/\/+$/, '')}/models?limit=100`, method: 'GET', guard, fetchImpl: ctx.fetch, ...idErr, refine,
        headers: headers(cfg.apiKey),
      });
      const j = await readJson(res, guard, idErr);
      return (j.data ?? []).map((m) => m.id).filter(Boolean);
    } catch (e) {
      throw toIOError(e, guard, idErr);
    } finally {
      guard.dispose();
    }
  },
};
