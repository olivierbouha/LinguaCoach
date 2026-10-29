/**
 * Adaptateur Google Gemini (API REST « Generative Language », v1beta).
 *
 *  Texte : POST {base}/models/{model}:generateContent
 *  Flux  : POST {base}/models/{model}:streamGenerateContent?alt=sse
 *  Auth  : en-tête `x-goog-api-key` (la clé n'est jamais placée dans l'URL).
 *  Rôles : « user » / « model » ; consigne système dans `systemInstruction`.
 *  JSON  : generationConfig.responseMimeType = 'application/json'.
 *  Audio : partie `inlineData` { mimeType, data(base64) } — WAV accepté.
 *  Liste : GET {base}/models (méthodes supportant generateContent).
 */
import { AIError, friendlyMessage } from '../errors.js';
import { request, readJson, readSSE, createGuard, toIOError } from '../http.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const BLOCK_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

function refine(status, json) {
  const err = json?.error;
  const reason = err?.details?.find?.((d) => d?.reason)?.reason;
  // Gemini répond 400 (et non 401) pour une clé invalide.
  if (reason === 'API_KEY_INVALID' || /api key not valid/i.test(err?.message ?? '')) return { kind: 'auth' };
  if (err?.status === 'PERMISSION_DENIED' || err?.status === 'UNAUTHENTICATED') return { kind: 'auth' };
  if (err?.status === 'RESOURCE_EXHAUSTED') {
    return /quota|billing/i.test(err.message ?? '') && /per day|daily|billing/i.test(err.message ?? '') ? { kind: 'quota' } : { kind: 'rate_limit' };
  }
  if (err?.status === 'UNAVAILABLE' || err?.status === 'DEADLINE_EXCEEDED' || err?.status === 'INTERNAL') return { kind: 'unavailable' };
  if (err?.status === 'NOT_FOUND') return { kind: 'validation', detail: 'modèle introuvable ou non pris en charge' };
  return {};
}

const cleanModel = (m) => String(m).replace(/^models\//, '');

export function buildBody(req) {
  const contents = req.messages.map((m, i) => {
    const parts = [{ text: m.content }];
    // L'audio est joint au DERNIER message utilisateur.
    if (req.audio && i === req.messages.length - 1 && m.role === 'user') {
      parts.push({ inlineData: { mimeType: req.audio.mimeType, data: req.audio.base64 } });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const generationConfig = {};
  if (req.json) generationConfig.responseMimeType = 'application/json';
  if (req.maxTokens) generationConfig.maxOutputTokens = req.maxTokens;
  if (req.temperature != null) generationConfig.temperature = req.temperature;
  return {
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents,
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

/** Extrait texte + motif d'arrêt d'une réponse (ou d'un fragment de flux). */
export function extract(json) {
  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
  return { text, finishReason: cand?.finishReason ?? null, blockReason: json?.promptFeedback?.blockReason ?? null };
}

export const gemini = {
  id: 'gemini',
  label: 'Google Gemini',
  defaultBaseUrl: BASE,
  requiresKey: true,
  requiresBaseUrl: false,
  capabilities: { streaming: true, audioInput: true, jsonMode: true, listModels: true },

  async complete(cfg, req, ctx) {
    const label = this.label;
    const secrets = [cfg.apiKey];
    const guard = createGuard({ signal: ctx.signal, timeoutMs: ctx.timeoutMs });
    const idErr = { provider: this.id, label, secrets };
    try {
      if (!/^[\w.\-/]+$/.test(cleanModel(cfg.model))) throw new AIError('validation', 'Nom de modèle invalide.', { provider: this.id });
      const stream = typeof ctx.onToken === 'function';
      const url = `${(cfg.baseUrl || BASE).replace(/\/+$/, '')}/models/${encodeURIComponent(cleanModel(cfg.model))}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
      const res = await request({
        url, guard, fetchImpl: ctx.fetch, ...idErr, refine,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: buildBody(req),
      });

      let text = '', finishReason = null, blockReason = null;
      if (stream) {
        await readSSE(res, ({ data }) => {
          let j;
          try { j = JSON.parse(data); } catch { return; }
          if (j.error) throw new AIError(refine(0, j).kind ?? 'unavailable', friendlyMessage(refine(0, j).kind ?? 'unavailable', label) + ` (${j.error.message ?? ''})`.slice(0, 300), { provider: this.id, secrets });
          const x = extract(j);
          if (x.text) { text += x.text; ctx.onToken(x.text); }
          finishReason = x.finishReason ?? finishReason;
          blockReason = x.blockReason ?? blockReason;
        }, guard, { idleMs: ctx.idleMs, ...idErr });
      } else {
        const x = extract(await readJson(res, guard, idErr));
        ({ text, finishReason, blockReason } = x);
      }
      if (!text) {
        if (blockReason || BLOCK_FINISH.has(finishReason)) throw new AIError('refusal', friendlyMessage('refusal', label), { provider: this.id });
        throw new AIError('invalid_response', friendlyMessage('invalid_response', label), { provider: this.id });
      }
      return { text, finishReason, provider: this.id, model: cfg.model };
    } catch (e) {
      throw toIOError(e, guard, idErr);
    } finally {
      guard.dispose();
    }
  },

  async listModels(cfg, ctx) {
    const guard = createGuard({ signal: ctx.signal, timeoutMs: ctx.timeoutMs ?? 15000 });
    const idErr = { provider: this.id, label: this.label, secrets: [cfg.apiKey] };
    try {
      const res = await request({
        url: `${(cfg.baseUrl || BASE).replace(/\/+$/, '')}/models?pageSize=200`, method: 'GET', guard, fetchImpl: ctx.fetch, ...idErr, refine,
        headers: { 'x-goog-api-key': cfg.apiKey },
      });
      const j = await readJson(res, guard, idErr);
      return (j.models ?? [])
        .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => cleanModel(m.name)).sort();
    } catch (e) {
      throw toIOError(e, guard, idErr);
    } finally {
      guard.dispose();
    }
  },
};
