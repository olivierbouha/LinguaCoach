// Utilitaires de test : fausses réponses HTTP et faux fetch (aucun appel réseau réel).
const enc = new TextEncoder();
export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
export const sse = (chunks, status = 200) =>
  new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } }),
    { status, headers: { 'content-type': 'text/event-stream' } });
/** Flux qui émet des fragments puis échoue (coupure réseau en plein milieu). */
export const brokenSse = (chunks) => {
  let i = 0;
  return new Response(new ReadableStream({
    pull(c) { if (i < chunks.length) c.enqueue(enc.encode(chunks[i++])); else c.error(new TypeError('network down')); },
  }), { status: 200 });
};

/** Faux fetch : `script` est une fonction (url, init, n) → Response | Error | Promise. Enregistre les appels. */
export function fakeFetch(script) {
  const calls = [];
  const f = async (url, init = {}) => {
    const n = calls.length;
    calls.push({ url: String(url), init, headers: Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])), body: init.body ? JSON.parse(init.body) : undefined });
    const r = await script(String(url), init, n);
    if (r instanceof Error) throw r;
    return r;
  };
  f.calls = calls;
  return f;
}
/** Réponse qui ne vient jamais, mais respecte l'annulation (pour tester délais / annulation). */
export const hang = (init) => new Promise((_, reject) => {
  init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});

export const geminiOk = (text) => json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
export const openaiOk = (text) => json({ choices: [{ message: { content: text }, finish_reason: 'stop' }] });
export const anthropicOk = (text) => json({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

export const KEY_A = 'AIzaSyTESTKEY-aaaaaaaaaaaaaaaaaaaaaaaa';
export const KEY_B = 'sk-proj-TESTKEYbbbbbbbbbbbbbbbbbbbb';
export const KEY_C = 'sk-ant-api03-TESTKEYcccccccccccccccc';

export const noSleep = () => { const delays = []; const f = async (ms) => { delays.push(ms); }; f.delays = delays; return f; };
