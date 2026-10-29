import test from 'node:test';
import assert from 'node:assert/strict';
import { AIManager } from '../js/ai/ai-manager.js';
import { computeBackoff, withRetry } from '../js/ai/fallback.js';
import { parseRetryAfter, AIError } from '../js/ai/errors.js';
import { json, sse, brokenSse, fakeFetch, hang, geminiOk, openaiOk, anthropicOk, noSleep, KEY_A, KEY_B, KEY_C } from './helpers.mjs';

const REQ = { system: 'S', messages: [{ role: 'user', content: 'My question' }] };
const cfg = (primary, fallback) => () => ({
  primary: primary ?? { provider: '', model: '', baseUrl: '', apiKey: '' },
  fallback: fallback ?? { enabled: false, provider: '', model: '', baseUrl: '', apiKey: '' },
});
const P = { provider: 'openai', model: 'gpt-x', apiKey: KEY_B };
const G = { enabled: true, provider: 'gemini', model: 'gem-x', apiKey: KEY_A };
const A = { enabled: true, provider: 'anthropic', model: 'cl-x', apiKey: KEY_C };
/** Aiguille les requêtes par hôte. */
const router = (routes) => (url, init, n) => {
  for (const [host, fn] of Object.entries(routes)) if (url.includes(host)) return fn(url, init, n);
  throw new Error('route inconnue ' + url);
};
const mk = (getConfig, fetchImpl, extra = {}) => new AIManager({ getConfig, fetchImpl, sleep: noSleep(), random: () => 0.5, timeoutMs: 500, idleMs: 500, ...extra });

/* 1. Aucun fournisseur configuré */
test('Aucun fournisseur configuré → erreur « config », aucun appel réseau', async () => {
  const f = fakeFetch(() => { throw new Error('ne doit pas être appelé'); });
  const m = mk(cfg(), f);
  assert.equal(m.isConfigured(), false);
  await assert.rejects(m.ask(REQ), (e) => e.kind === 'config' && e.code === 'not_configured');
  assert.equal(f.calls.length, 0);
  // fournisseur choisi mais clé/modèle manquants
  const m2 = mk(cfg({ provider: 'openai', model: 'x', baseUrl: '', apiKey: '' }), f);
  assert.equal(m2.isConfigured(), false);
  await assert.rejects(m2.ask(REQ), (e) => e.kind === 'config');
  // personnalisé : l'URL est obligatoire, la clé non
  assert.equal(mk(cfg({ provider: 'custom', model: 'x', baseUrl: '', apiKey: '' }), f).isConfigured(), false);
  assert.equal(mk(cfg({ provider: 'custom', model: 'x', baseUrl: 'http://localhost:1/v1', apiKey: '' }), f).isConfigured(), true);
});

/* 2-4. Chaque fournisseur, via le gestionnaire (fetch simulé : contrats de protocole, pas l'API réelle) */
for (const [name, primary, host, ok] of [
  ['Gemini', { provider: 'gemini', model: 'g', apiKey: KEY_A }, 'googleapis', geminiOk],
  ['OpenAI', { provider: 'openai', model: 'o', apiKey: KEY_B }, 'openai.com', openaiOk],
  ['Anthropic', { provider: 'anthropic', model: 'c', apiKey: KEY_C }, 'anthropic.com', anthropicOk],
]) {
  test(`${name} fonctionnel via le gestionnaire (non diffusé)`, async () => {
    const f = fakeFetch(router({ [host]: () => ok('Réponse') }));
    const r = await mk(cfg(primary), f).ask(REQ);
    assert.deepEqual([r.text, r.provider, r.usedFallback, r.attempts], ['Réponse', primary.provider, false, 1]);
  });
}

/* 5. Principal indisponible */
test('Principal 503 persistant : 3 tentatives (backoff + jitter) puis bascule vers le secours, contexte conservé', async () => {
  const sleep = noSleep();
  const f = fakeFetch(router({ 'openai.com': () => json({ error: { message: 'down' } }, 503), googleapis: () => geminiOk('Secours OK') }));
  const notices = [];
  const m = new AIManager({ getConfig: cfg(P, G), fetchImpl: f, sleep, random: () => 0.5, timeoutMs: 500 });
  const r = await m.ask(REQ, { onNotice: (n) => notices.push(n) });
  assert.equal(r.text, 'Secours OK'); assert.equal(r.usedFallback, true); assert.equal(r.provider, 'gemini');
  assert.equal(f.calls.filter((c) => c.url.includes('openai.com')).length, 3);
  assert.deepEqual(sleep.delays, [250, 500], 'full jitter : random()=0.5 × min(cap, 500·2^(n-1))');
  const gem = f.calls.find((c) => c.url.includes('googleapis'));
  assert.equal(gem.body.contents[0].parts[0].text, 'My question', 'la question est conservée');
  assert.equal(gem.body.systemInstruction.parts[0].text, 'S', 'les consignes sont conservées');
  assert.deepEqual(notices.map((n) => n.type), ['retry', 'retry', 'fallback']);
  assert.match(notices.at(-1).message, /bascule/i);
});

test('429 avec Retry-After : le délai demandé est respecté (et non le backoff)', async () => {
  const sleep = noSleep();
  const f = fakeFetch(router({ 'openai.com': (u, i, n) => (n === 0 ? json({ error: { message: 'x' } }, 429, { 'retry-after': '2' }) : openaiOk('ok')) }));
  const r = await new AIManager({ getConfig: cfg(P), fetchImpl: f, sleep, random: () => 0.99 }).ask(REQ);
  assert.equal(r.text, 'ok'); assert.equal(r.attempts, 2); assert.deepEqual(sleep.delays, [2000]);
});

test('Retry-After supérieur au plafond : pas d\'attente, bascule immédiate', async () => {
  const sleep = noSleep();
  const f = fakeFetch(router({ 'openai.com': () => json({ error: {} }, 429, { 'retry-after': '3600' }), googleapis: () => geminiOk('G') }));
  const r = await new AIManager({ getConfig: cfg(P, G), fetchImpl: f, sleep }).ask(REQ);
  assert.equal(r.usedFallback, true); assert.deepEqual(sleep.delays, []);
});

/* 6. Secondaire indisponible */
test('Principal ET secours indisponibles → erreur finale du secours, erreur d\'origine jointe', async () => {
  const f = fakeFetch(router({ 'openai.com': () => json({ error: {} }, 500), googleapis: () => json({ error: { status: 'UNAVAILABLE' } }, 503) }));
  await assert.rejects(mk(cfg(P, G), f).ask(REQ), (e) => e.kind === 'unavailable' && e.primaryError?.kind === 'unavailable' && e.provider === 'gemini');
  assert.equal(f.calls.filter((c) => c.url.includes('googleapis')).length, 2, 'secours : 2 tentatives max');
});

test('Principal indisponible mais aucun secours configuré (ou désactivé) → erreur, pas de bascule', async () => {
  const f = fakeFetch(router({ 'openai.com': () => json({ error: {} }, 503) }));
  await assert.rejects(mk(cfg(P), f).ask(REQ), (e) => e.kind === 'unavailable');
  const f2 = fakeFetch(router({ 'openai.com': () => json({ error: {} }, 503), googleapis: () => geminiOk('NON') }));
  await assert.rejects(mk(cfg(P, { ...G, enabled: false }), f2).ask(REQ), (e) => e.kind === 'unavailable');
  assert.equal(f2.calls.filter((c) => c.url.includes('googleapis')).length, 0);
  // secours incomplet (sans clé)
  await assert.rejects(mk(cfg(P, { ...G, apiKey: '' }), f2).ask(REQ), (e) => e.kind === 'unavailable');
  // secours identique au principal
  await assert.rejects(mk(cfg(P, { ...P, enabled: true }), f2).ask(REQ), (e) => e.kind === 'unavailable');
});

/* 7. Clé invalide et autres erreurs à ne PAS basculer */
for (const [label, status, body, kind] of [
  ['clé invalide (401)', 401, { error: { code: 'invalid_api_key', message: 'bad' } }, 'auth'],
  ['requête invalide (400)', 400, { error: { message: 'bad request' } }, 'validation'],
  ['modèle introuvable (404)', 404, { error: { code: 'model_not_found', message: 'nope' } }, 'validation'],
]) {
  test(`${label} : ni nouvelle tentative ni bascule`, async () => {
    const f = fakeFetch(router({ 'openai.com': () => json(body, status), googleapis: () => geminiOk('NON') }));
    await assert.rejects(mk(cfg(P, G), f).ask(REQ), (e) => e.kind === kind && !e.message.includes(KEY_B));
    assert.equal(f.calls.length, 1);
  });
}

test('Refus de contenu et réponse vide : ni nouvelle tentative ni bascule', async () => {
  let f = fakeFetch(router({ 'openai.com': () => json({ choices: [{ message: { content: null, refusal: 'r' }, finish_reason: 'stop' }] }), googleapis: () => geminiOk('NON') }));
  await assert.rejects(mk(cfg(P, G), f).ask(REQ), (e) => e.kind === 'refusal'); assert.equal(f.calls.length, 1);
  f = fakeFetch(router({ 'openai.com': () => json({ choices: [{ message: { content: '' } }] }), googleapis: () => geminiOk('NON') }));
  await assert.rejects(mk(cfg(P, G), f).ask(REQ), (e) => e.kind === 'invalid_response'); assert.equal(f.calls.length, 1);
});

test('Quota épuisé : pas de retry mais bascule possible', async () => {
  const f = fakeFetch(router({ 'openai.com': () => json({ error: { code: 'insufficient_quota', message: 'q' } }, 429), googleapis: () => geminiOk('G') }));
  const r = await mk(cfg(P, G), f).ask(REQ);
  assert.equal(r.usedFallback, true); assert.equal(f.calls.filter((c) => c.url.includes('openai')).length, 1);
});

test('Erreur réseau : nouvelles tentatives puis bascule ; timeout : pas de retry (coût) mais bascule', async () => {
  let f = fakeFetch(router({ 'openai.com': () => new TypeError('Failed to fetch'), googleapis: () => geminiOk('G') }));
  let r = await mk(cfg(P, G), f).ask(REQ);
  assert.equal(r.usedFallback, true); assert.equal(f.calls.filter((c) => c.url.includes('openai')).length, 3);
  f = fakeFetch(router({ 'openai.com': (u, init) => hang(init), googleapis: () => geminiOk('G') }));
  r = await mk(cfg(P, G), f, { timeoutMs: 30 }).ask(REQ);
  assert.equal(r.usedFallback, true); assert.equal(f.calls.filter((c) => c.url.includes('openai')).length, 1);
});

test('Bascule : le secours peut être Anthropic (protocole différent)', async () => {
  const f = fakeFetch(router({ 'openai.com': () => json({}, 503), 'anthropic.com': () => anthropicOk('Claude') }));
  const r = await mk(cfg(P, A), f).ask(REQ);
  assert.equal(r.text, 'Claude'); assert.equal(f.calls.at(-1).headers['x-api-key'], KEY_C);
});

/* Streaming et doublons */
test('Flux interrompu après des jetons : AUCUNE relance ni bascule automatique (évite doublon/facturation), texte partiel conservé', async () => {
  const f = fakeFetch(router({ 'openai.com': () => brokenSse(['data: {"choices":[{"delta":{"content":"Bon"}}]}\n\n']), googleapis: () => geminiOk('NON') }));
  const toks = [];
  await assert.rejects(mk(cfg(P, G), f).ask(REQ, { onToken: (t) => toks.push(t) }), (e) => e.kind === 'network' && e.partialText === 'Bon');
  assert.equal(f.calls.length, 1); assert.deepEqual(toks, ['Bon']);
});

test('Flux nominal : jetons transmis, résultat complet', async () => {
  const f = fakeFetch(router({ 'openai.com': () => sse(['data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DONE]\n\n']) }));
  const toks = [];
  const r = await mk(cfg(P), f).ask(REQ, { onToken: (t) => toks.push(t) });
  assert.equal(r.text, 'AB'); assert.deepEqual(toks, ['A', 'B']);
});

test('Double soumission : une 2e requête pendant la 1re est rejetée (« busy ») sans appel réseau', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const f = fakeFetch(router({ 'openai.com': async () => { await gate; return openaiOk('ok'); } }));
  const m = mk(cfg(P), f);
  const first = m.ask(REQ);
  await assert.rejects(m.ask(REQ), (e) => e.kind === 'busy');
  assert.equal(f.calls.length, 1);
  release();
  assert.equal((await first).text, 'ok');
  assert.equal((await m.ask(REQ)).text, 'ok', 'le verrou est relâché après la fin');
});

test('Annulation par l\'utilisateur : « canceled », pas de bascule, verrou relâché', async () => {
  const f = fakeFetch(router({ 'openai.com': (u, init) => hang(init), googleapis: () => geminiOk('NON') }));
  const m = mk(cfg(P, G), f, { timeoutMs: 5000 });
  const p = m.ask(REQ);
  setTimeout(() => m.cancel(), 10);
  await assert.rejects(p, (e) => e.kind === 'canceled');
  assert.equal(f.calls.length, 1); assert.equal(m.busy, false);
});

test('Audio : refusé si le principal ne le gère pas ; le secours incompatible n\'est pas utilisé', async () => {
  const audio = { mimeType: 'audio/wav', base64: 'AAAA' };
  const f = fakeFetch(router({ 'openai.com': () => openaiOk('x') }));
  await assert.rejects(mk(cfg(P), f).ask({ ...REQ, audio }), (e) => e.kind === 'validation'); assert.equal(f.calls.length, 0);
  // principal Gemini (audio) indisponible, secours OpenAI (pas d'audio) → pas de bascule
  const f2 = fakeFetch(router({ googleapis: () => json({ error: { status: 'UNAVAILABLE' } }, 503), 'openai.com': () => openaiOk('NON') }));
  await assert.rejects(mk(cfg({ provider: 'gemini', model: 'g', apiKey: KEY_A }, { enabled: true, provider: 'openai', model: 'o', apiKey: KEY_B }), f2).ask({ ...REQ, audio }), (e) => e.kind === 'unavailable');
  assert.equal(f2.calls.filter((c) => c.url.includes('openai')).length, 0);
});

test('Les clés n\'apparaissent dans aucun message d\'erreur, même si le serveur les renvoie', async () => {
  const f = fakeFetch(router({ 'openai.com': () => json({ error: { message: `bad key ${KEY_B} / Bearer ${KEY_B}` } }, 401) }));
  await assert.rejects(mk(cfg(P), f).ask(REQ), (e) => { assert.ok(!e.message.includes(KEY_B)); assert.ok(!JSON.stringify(e).includes(KEY_B)); return true; });
});

test('Test de connexion : succès, et clé invalide → erreur « auth »', async () => {
  const ok = await mk(cfg(P), fakeFetch(router({ 'openai.com': () => openaiOk('OK') }))).test('primary');
  assert.equal(ok.ok, true); assert.equal(ok.provider, 'openai');
  await assert.rejects(mk(cfg(P), fakeFetch(router({ 'openai.com': () => json({ error: { code: 'invalid_api_key' } }, 401) }))).test('primary'), (e) => e.kind === 'auth');
  await assert.rejects(mk(cfg(), fakeFetch(() => null)).test('primary'), (e) => e.kind === 'config');
});

test('Liste des modèles via le gestionnaire (aucun modèle codé en dur)', async () => {
  const m = mk(cfg(P), fakeFetch(router({ 'openai.com': () => json({ data: [{ id: 'z' }, { id: 'a' }] }) })));
  assert.deepEqual(await m.listModels('primary'), ['a', 'z']);
});

/* Unités fallback.js / errors.js */
test('computeBackoff : exponentiel, plafonné, jitter dans [0, plafond]', () => {
  assert.equal(computeBackoff(1, { baseMs: 500, random: () => 1 }), 500);
  assert.equal(computeBackoff(3, { baseMs: 500, random: () => 1 }), 2000);
  assert.equal(computeBackoff(10, { baseMs: 500, capMs: 8000, random: () => 1 }), 8000);
  assert.equal(computeBackoff(2, { random: () => 0 }), 0);
  for (let i = 0; i < 50; i++) { const d = computeBackoff(4, { baseMs: 100, capMs: 5000 }); assert.ok(d >= 0 && d <= 800); }
});
test('parseRetryAfter : secondes, date HTTP, valeurs invalides', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter('1.5'), 1500);
  assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 4000), 6000);
  assert.equal(parseRetryAfter('n\'importe quoi'), undefined);
  assert.equal(parseRetryAfter(null), undefined);
});
test('withRetry : s\'arrête dès qu\'une erreur n\'est pas réessayable', async () => {
  let n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new AIError('auth', 'x'); }, { sleep: noSleep() }), (e) => e.attempts === 1);
  assert.equal(n, 1);
});
