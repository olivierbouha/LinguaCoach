import test from 'node:test';
import assert from 'node:assert/strict';
import { gemini } from '../js/ai/providers/gemini.js';
import { openai } from '../js/ai/providers/openai.js';
import { anthropic, normalizeMessages } from '../js/ai/providers/anthropic.js';
import { custom } from '../js/ai/providers/custom.js';
import { json, sse, brokenSse, fakeFetch, hang, geminiOk, openaiOk, anthropicOk, KEY_A, KEY_B, KEY_C } from './helpers.mjs';

const REQ = { system: 'SYS', messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }, { role: 'user', content: 'again' }] };
const ctx = (fetch, extra = {}) => ({ fetch, timeoutMs: 2000, idleMs: 2000, ...extra });

/* ---------------- Gemini ---------------- */
test('Gemini : requête non diffusée (URL, en-tête de clé, rôles, systemInstruction)', async () => {
  const f = fakeFetch(() => geminiOk('Bonjour'));
  const r = await gemini.complete({ apiKey: KEY_A, model: 'models/gemini-x' }, REQ, ctx(f));
  assert.equal(r.text, 'Bonjour');
  const c = f.calls[0];
  assert.match(c.url, /\/v1beta\/models\/gemini-x:generateContent$/);
  assert.ok(!c.url.includes(KEY_A), 'la clé ne doit pas être dans l\'URL');
  assert.equal(c.headers['x-goog-api-key'], KEY_A);
  assert.equal(c.body.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(c.body.contents.map((x) => x.role), ['user', 'model', 'user']);
  assert.equal(c.init.credentials, 'omit');
});

test('Gemini : mode JSON et audio inline sur le dernier message utilisateur', async () => {
  const f = fakeFetch(() => geminiOk('{}'));
  await gemini.complete({ apiKey: KEY_A, model: 'm' }, { ...REQ, json: true, audio: { mimeType: 'audio/wav', base64: 'AAAA' } }, ctx(f));
  const b = f.calls[0].body;
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(b.contents.at(-1).parts[1], { inlineData: { mimeType: 'audio/wav', data: 'AAAA' } });
  assert.equal(b.contents[0].parts.length, 1);
});

test('Gemini : flux SSE (alt=sse), jetons transmis dans l\'ordre', async () => {
  const f = fakeFetch(() => sse([
    'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\r\n\r\ndata: {"candidates":[{"content":{"parts":[{"te',
    'xt":"lo"}]},"finishReason":"STOP"}]}\n\n']));
  const toks = [];
  const r = await gemini.complete({ apiKey: KEY_A, model: 'm' }, REQ, ctx(f, { onToken: (t) => toks.push(t) }));
  assert.deepEqual(toks, ['Hel', 'lo']);
  assert.equal(r.text, 'Hello');
  assert.match(f.calls[0].url, /:streamGenerateContent\?alt=sse$/);
});

test('Gemini : clé invalide (HTTP 400 API_KEY_INVALID) → auth, et la clé n\'apparaît pas dans le message', async () => {
  const f = fakeFetch(() => json({ error: { code: 400, message: `API key not valid ${KEY_A}`, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }, 400));
  await assert.rejects(gemini.complete({ apiKey: KEY_A, model: 'm' }, REQ, ctx(f)), (e) => {
    assert.equal(e.kind, 'auth');
    assert.ok(!e.message.includes(KEY_A), e.message);
    return true;
  });
});

test('Gemini : 429 avec Retry-After, 503, et refus de contenu', async () => {
  let f = fakeFetch(() => json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'slow down' } }, 429, { 'retry-after': '7' }));
  await assert.rejects(gemini.complete({ apiKey: KEY_A, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'rate_limit' && e.retryAfterMs === 7000);
  f = fakeFetch(() => json({ error: { status: 'UNAVAILABLE', message: 'overloaded' } }, 503));
  await assert.rejects(gemini.complete({ apiKey: KEY_A, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'unavailable');
  f = fakeFetch(() => json({ promptFeedback: { blockReason: 'SAFETY' } }));
  await assert.rejects(gemini.complete({ apiKey: KEY_A, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'refusal');
  f = fakeFetch(() => json({ candidates: [] }));
  await assert.rejects(gemini.complete({ apiKey: KEY_A, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'invalid_response');
});

test('Gemini : nom de modèle invalide refusé avant tout envoi', async () => {
  const f = fakeFetch(() => geminiOk('x'));
  await assert.rejects(gemini.complete({ apiKey: KEY_A, model: 'a?b=../x' }, REQ, ctx(f)), (e) => e.kind === 'validation');
  assert.equal(f.calls.length, 0);
});

test('Gemini : liste des modèles filtrée sur generateContent', async () => {
  const f = fakeFetch(() => json({ models: [{ name: 'models/b', supportedGenerationMethods: ['generateContent'] }, { name: 'models/emb', supportedGenerationMethods: ['embedContent'] }, { name: 'models/a', supportedGenerationMethods: ['generateContent'] }] }));
  assert.deepEqual(await gemini.listModels({ apiKey: KEY_A }, { fetch: f }), ['a', 'b']);
});

/* ---------------- OpenAI ---------------- */
test('OpenAI : requête (Bearer, messages, response_format JSON, max_completion_tokens)', async () => {
  const f = fakeFetch(() => openaiOk('Hi'));
  const r = await openai.complete({ apiKey: KEY_B, model: 'm1' }, { ...REQ, json: true, maxTokens: 300 }, ctx(f));
  assert.equal(r.text, 'Hi');
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(c.headers.authorization, `Bearer ${KEY_B}`);
  assert.equal(c.body.messages[0].role, 'system');
  assert.deepEqual(c.body.response_format, { type: 'json_object' });
  assert.equal(c.body.max_completion_tokens, 300);
  assert.equal(c.body.stream, undefined);
  assert.equal(c.body.temperature, undefined, 'pas de température imposée');
});

test('OpenAI : flux SSE avec [DONE]', async () => {
  const f = fakeFetch(() => sse(['data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choices":[{"delta":{"content":"B"},"finish_reason":"stop"}]}\n\n', 'data: [DONE]\n\n']));
  const toks = [];
  const r = await openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f, { onToken: (t) => toks.push(t) }));
  assert.equal(r.text, 'AB'); assert.deepEqual(toks, ['A', 'B']);
  assert.equal(f.calls[0].body.stream, true);
});

test('OpenAI : 401, quota épuisé (429 insufficient_quota), 500, refus', async () => {
  let f = fakeFetch(() => json({ error: { message: `Incorrect API key ${KEY_B}`, code: 'invalid_api_key' } }, 401));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'auth' && !e.message.includes(KEY_B));
  f = fakeFetch(() => json({ error: { message: 'You exceeded your quota', code: 'insufficient_quota' } }, 429));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'quota');
  f = fakeFetch(() => json({ error: { message: 'oops' } }, 500));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'unavailable');
  f = fakeFetch(() => json({ choices: [{ message: { content: null, refusal: 'no' }, finish_reason: 'stop' }] }));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'refusal');
});

test('OpenAI : erreur dans le flux SSE → erreur normalisée', async () => {
  const f = fakeFetch(() => sse(['data: {"error":{"message":"server busy","code":"server_error"}}\n\n']));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f, { onToken() {} })), (e) => e.kind === 'unavailable');
});

/* ---------------- Anthropic ---------------- */
test('Anthropic : en-têtes, max_tokens obligatoire, system à part, flux text_delta', async () => {
  let f = fakeFetch(() => anthropicOk('Salut'));
  const r = await anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f));
  assert.equal(r.text, 'Salut');
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.headers['x-api-key'], KEY_C);
  assert.equal(c.headers['anthropic-version'], '2023-06-01');
  assert.equal(c.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(c.headers.authorization, undefined);
  assert.equal(c.body.system, 'SYS');
  assert.ok(c.body.max_tokens > 0);
  assert.ok(c.body.messages.every((m) => m.role !== 'system'));

  f = fakeFetch(() => sse([
    'event: message_start\ndata: {"type":"message_start"}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bon"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"jour"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n']));
  const toks = [];
  const r2 = await anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f, { onToken: (t) => toks.push(t) }));
  assert.equal(r2.text, 'Bonjour'); assert.deepEqual(toks, ['Bon', 'jour']); assert.equal(f.calls[0].body.stream, true);
});

test('Anthropic : normalisation des messages (alternance, début « user »)', () => {
  assert.deepEqual(normalizeMessages([{ role: 'assistant', content: 'x' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }]),
    [{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }]);
});

test('Anthropic : 401, 429 + Retry-After (date HTTP ou secondes), 529 surchargé, refus, erreur en flux', async () => {
  let f = fakeFetch(() => json({ type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${KEY_C}` } }, 401));
  await assert.rejects(anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'auth' && !e.message.includes(KEY_C));
  f = fakeFetch(() => json({ type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 429, { 'retry-after': '3' }));
  await assert.rejects(anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'rate_limit' && e.retryAfterMs === 3000);
  f = fakeFetch(() => json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529));
  await assert.rejects(anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'unavailable');
  f = fakeFetch(() => json({ content: [], stop_reason: 'refusal' }));
  await assert.rejects(anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'refusal');
  f = fakeFetch(() => sse(['event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n']));
  await assert.rejects(anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f, { onToken() {} })), (e) => e.kind === 'unavailable');
});

/* ---------------- Personnalisé ---------------- */
test('Personnalisé : URL de base utilisateur, clé facultative, pas de mode JSON natif, max_tokens', async () => {
  const f = fakeFetch(() => openaiOk('ok'));
  await custom.complete({ apiKey: '', model: 'llama', baseUrl: 'http://localhost:11434/v1/' }, { ...REQ, json: true, maxTokens: 50 }, ctx(f));
  const c = f.calls[0];
  assert.equal(c.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(c.headers.authorization, undefined);
  assert.equal(c.body.response_format, undefined);
  assert.equal(c.body.max_tokens, 50);
  assert.equal(custom.requiresKey, false); assert.equal(custom.requiresBaseUrl, true);
});

/* ---------------- Erreurs réseau communes ---------------- */
test('Réseau coupé (TypeError) → network ; délai dépassé → timeout ; annulation → canceled', async () => {
  let f = fakeFetch(() => new TypeError('Failed to fetch'));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f)), (e) => e.kind === 'network');
  f = fakeFetch((u, init) => hang(init));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f, { timeoutMs: 30 })), (e) => e.kind === 'timeout');
  const ac = new AbortController();
  f = fakeFetch((u, init) => hang(init));
  const p = anthropic.complete({ apiKey: KEY_C, model: 'm' }, REQ, ctx(f, { signal: ac.signal }));
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(p, (e) => e.kind === 'canceled');
});

test('Flux interrompu en cours de route → network (les jetons reçus ont déjà été transmis)', async () => {
  const f = fakeFetch(() => brokenSse(['data: {"choices":[{"delta":{"content":"par"}}]}\n\n']));
  const toks = [];
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f, { onToken: (t) => toks.push(t) })), (e) => e.kind === 'network');
  assert.deepEqual(toks, ['par']);
});

test('Délai d\'inactivité du flux (idleMs) → timeout', async () => {
  const f = fakeFetch(() => new Response(new ReadableStream({ start() { /* ne ferme jamais */ } }), { status: 200 }));
  await assert.rejects(openai.complete({ apiKey: KEY_B, model: 'm' }, REQ, ctx(f, { onToken() {}, idleMs: 30 })), (e) => e.kind === 'timeout');
});

test('Capacités déclarées', () => {
  assert.equal(gemini.capabilities.audioInput, true);
  assert.equal(openai.capabilities.audioInput, false);
  assert.equal(anthropic.capabilities.audioInput, false);
});
