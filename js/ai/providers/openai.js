/**
 * Adaptateur OpenAI — API « Chat Completions » (/v1/chat/completions), flux SSE (`stream: true`).
 *
 * Cette implémentation est aussi la base du fournisseur « personnalisé » (serveurs compatibles :
 * Ollama, LM Studio, vLLM, OpenRouter, etc.) via `createOpenAICompatible`.
 *
 *  Auth      : Authorization: Bearer <clé>
 *  Messages  : [{role:'system'|'user'|'assistant', content}]
 *  JSON      : response_format: { type: 'json_object' } (OpenAI officiel uniquement)
 *  Flux      : lignes `data: {...choices[0].delta.content}` puis `data: [DONE]`
 *  Liste     : GET /models → data[].id
 *  Audio     : non pris en charge ici (les modèles audio d'OpenAI utilisent un autre format de requête).
 */
import { AIError, friendlyMessage } from '../errors.js';
import { request, readJson, readSSE, createGuard, toIOError } from '../http.js';

function refine(status, json) {
  const code = json?.error?.code ?? json?.error?.type;
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') return { kind: 'quota' };
  if (code === 'invalid_api_key' || code === 'invalid_authentication') return { kind: 'auth' };
  if (code === 'model_not_found') return { kind: 'validation', detail: 'modèle introuvable ou non accessible avec cette clé' };
  if (code === 'content_policy_violation' || code === 'content_filter') return { kind: 'refusal' };
  return {};
}

export function buildBody(req, cfg, { tokenParam, supportsJsonMode, stream }) {
  const messages = [...(req.system ? [{ role: 'system', content: req.system }] : []), ...req.messages.map((m) => ({ role: m.role, content: m.content }))];
  return {
    model: cfg.model,
    messages,
    ...(stream ? { stream: true } : {}),
    ...(req.json && supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(req.maxTokens ? { [tokenParam]: req.maxTokens } : {}),
    ...(req.temperature != null ? { temperature: req.temperature } : {}),
  };
}

export function createOpenAICompatible({ id, label, defaultBaseUrl, requiresKey, requiresBaseUrl, tokenParam, supportsJsonMode }) {
  return {
    id, label, defaultBaseUrl, requiresKey, requiresBaseUrl,
    capabilities: { streaming: true, audioInput: false, jsonMode: supportsJsonMode, listModels: true },

    async complete(cfg, req, ctx) {
      const secrets = [cfg.apiKey];
      const idErr = { provider: id, label, secrets };
      const guard = createGuard({ signal: ctx.signal, timeoutMs: ctx.timeoutMs });
      try {
        const stream = typeof ctx.onToken === 'function';
        const headers = { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) };
        const res = await request({
          url: `${(cfg.baseUrl || defaultBaseUrl).replace(/\/+$/, '')}/chat/completions`, guard, fetchImpl: ctx.fetch, ...idErr, refine, headers,
          body: buildBody(req, cfg, { tokenParam, supportsJsonMode, stream }),
        });

        let text = '', refusal = '', finishReason = null;
        if (stream) {
          await readSSE(res, ({ data }) => {
            if (data.trim() === '[DONE]') return;
            let j;
            try { j = JSON.parse(data); } catch { return; }
            if (j.error) {
              const k = refine(0, j).kind ?? 'unavailable';
              throw new AIError(k, friendlyMessage(k, label) + ` (${j.error.message ?? ''})`.slice(0, 300), { provider: id, secrets });
            }
            const ch = j.choices?.[0];
            const piece = ch?.delta?.content;
            if (typeof piece === 'string' && piece) { text += piece; ctx.onToken(piece); }
            if (ch?.delta?.refusal) refusal += ch.delta.refusal;
            finishReason = ch?.finish_reason ?? finishReason;
          }, guard, { idleMs: ctx.idleMs, ...idErr });
        } else {
          const j = await readJson(res, guard, idErr);
          const ch = j.choices?.[0];
          text = typeof ch?.message?.content === 'string' ? ch.message.content : '';
          refusal = ch?.message?.refusal ?? '';
          finishReason = ch?.finish_reason ?? null;
        }
        if (!text) {
          if (refusal || finishReason === 'content_filter') throw new AIError('refusal', friendlyMessage('refusal', label), { provider: id });
          throw new AIError('invalid_response', friendlyMessage('invalid_response', label), { provider: id });
        }
        return { text, finishReason, provider: id, model: cfg.model };
      } catch (e) {
        throw toIOError(e, guard, idErr);
      } finally {
        guard.dispose();
      }
    },

    async listModels(cfg, ctx) {
      const idErr = { provider: id, label, secrets: [cfg.apiKey] };
      const guard = createGuard({ signal: ctx.signal, timeoutMs: ctx.timeoutMs ?? 15000 });
      try {
        const res = await request({
          url: `${(cfg.baseUrl || defaultBaseUrl).replace(/\/+$/, '')}/models`, method: 'GET', guard, fetchImpl: ctx.fetch, ...idErr, refine,
          headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
        });
        const j = await readJson(res, guard, idErr);
        return (j.data ?? []).map((m) => m.id).filter(Boolean).sort();
      } catch (e) {
        throw toIOError(e, guard, idErr);
      } finally {
        guard.dispose();
      }
    },
  };
}

export const openai = createOpenAICompatible({
  id: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1',
  requiresKey: true, requiresBaseUrl: false, tokenParam: 'max_completion_tokens', supportsJsonMode: true,
});
