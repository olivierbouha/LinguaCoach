/**
 * speech.js — Synthèse vocale (SpeechSynthesis) et reconnaissance vocale (SpeechRecognition).
 *
 * Principes :
 *  - On ne suppose JAMAIS qu'une voix pour l'accent demandé existe : `pickVoice` renvoie la qualité réelle
 *    de la correspondance (exact | language | none) que l'interface affiche telle quelle.
 *  - On ne garantit aucun accent : si seule une voix d'une autre variante existe, on le dit.
 *  - Reconnaissance : API préfixée webkit sur Chrome/Safari ; souvent « en ligne » (l'audio est alors envoyé
 *    par le navigateur à son fournisseur) ; absente sur Firefox. Le repli est l'enregistrement (audio.js).
 */

const norm = (l) => String(l ?? '').replace('_', '-').toLowerCase();

/** Détection des capacités du navigateur. */
export function speechSupport(win = globalThis) {
  return {
    synthesis: !!win.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function',
    recognition: !!(win.SpeechRecognition || win.webkitSpeechRecognition),
    recorder: !!(win.navigator?.mediaDevices?.getUserMedia && win.MediaRecorder),
  };
}

/** Charge les voix (elles arrivent souvent de façon asynchrone). */
export function loadVoices(win = globalThis, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const synth = win.speechSynthesis;
    if (!synth) return resolve([]);
    const now = synth.getVoices();
    if (now.length) return resolve(now);
    const done = () => { clearTimeout(t); synth.removeEventListener?.('voiceschanged', done); resolve(synth.getVoices()); };
    const t = setTimeout(done, timeoutMs);
    synth.addEventListener?.('voiceschanged', done);
  });
}

/**
 * Choisit la meilleure voix pour un code BCP-47.
 * @returns {{voice: object|null, quality: 'exact'|'language'|'none', requested: string, actualLang: string|null}}
 */
export function pickVoice(voices, requested, { preferredURI = '' } = {}) {
  const want = norm(requested);
  const primary = want.split('-')[0];
  const rank = (v) => (v.voiceURI === preferredURI ? 0 : 1) + (v.default ? 0 : 0.2) + (v.localService ? 0 : 0.1);
  const exact = voices.filter((v) => norm(v.lang) === want).sort((a, b) => rank(a) - rank(b));
  if (exact.length) return { voice: exact[0], quality: 'exact', requested, actualLang: exact[0].lang };
  const same = voices.filter((v) => norm(v.lang).split('-')[0] === primary).sort((a, b) => rank(a) - rank(b));
  if (same.length) return { voice: same[0], quality: 'language', requested, actualLang: same[0].lang };
  return { voice: null, quality: 'none', requested, actualLang: null };
}

/** Voix de la langue (pour le sélecteur manuel), la variante demandée en premier. */
export function voicesForLanguage(voices, requested) {
  const want = norm(requested);
  const primary = want.split('-')[0];
  return voices.filter((v) => norm(v.lang).split('-')[0] === primary).sort((a, b) => (norm(b.lang) === want) - (norm(a.lang) === want) || a.name.localeCompare(b.name));
}

/** Texte d'état honnête sur la voix réellement utilisée. */
export function describeVoice(pick) {
  if (!pick || pick.quality === 'none') {
    return { level: 'warn', text: `Aucune voix « ${pick?.requested ?? ''} » ni de la même langue n'est disponible sur cet appareil : la lecture audio n'est pas possible (le texte reste utilisable).` };
  }
  if (pick.quality === 'exact') {
    return { level: 'ok', text: `Voix utilisée : ${pick.voice.name} (${pick.voice.lang}). Elle correspond à la variante demandée ; l'accent exact dépend du moteur vocal de votre appareil.` };
  }
  return { level: 'warn', text: `Aucune voix ${pick.requested} disponible. Repli sur ${pick.voice.name} (${pick.voice.lang}) : l'accent entendu ne correspond pas à la variante choisie.` };
}

/** Découpe un texte en phrases (évite la coupure des longs énoncés sur Chrome). */
export function splitSentences(text) {
  return String(text).match(/[^.!?…]+[.!?…]*["')\]]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

/**
 * Lit une suite de segments { text, pitch?, voice? } l'un après l'autre.
 * @returns {{done: Promise<'finished'|'canceled'>, cancel: () => void}}
 */
export function speakSequence(segments, { win = globalThis, lang, voice = null, rate = 1, onSegment } = {}) {
  const synth = win.speechSynthesis;
  let canceled = false;
  let finish;
  const done = new Promise((res) => (finish = res));
  if (!synth) { finish('canceled'); return { done, cancel() {} }; }
  const queue = segments.flatMap((seg) => (seg.text ? splitSentences(seg.text).map((t) => ({ ...seg, text: t })) : []));
  let i = 0;
  const next = () => {
    if (canceled) return;
    if (i >= queue.length) return finish('finished');
    const seg = queue[i];
    onSegment?.(seg, i);
    i++;
    const u = new win.SpeechSynthesisUtterance(seg.text);
    const v = seg.voice ?? voice;
    if (v) u.voice = v;
    u.lang = v?.lang ?? lang;
    u.rate = rate;
    if (seg.pitch) u.pitch = seg.pitch;
    u.onend = next;
    u.onerror = (e) => { if (e.error === 'canceled' || e.error === 'interrupted') return; next(); };
    synth.speak(u);
  };
  synth.cancel();
  next();
  return { done, cancel() { canceled = true; synth.cancel(); finish('canceled'); } };
}

/**
 * File de lecture : on peut y ajouter des phrases au fil de l'eau (réponse de l'IA en streaming)
 * sans couper ce qui est en cours (contrairement à speakSequence).
 * @returns {{enqueue(text), cancel(), whenIdle(): Promise<void>, speaking: () => boolean}}
 */
export function createSpeechQueue({ win = globalThis, voice = null, lang, rate = 1, onStart, onIdle } = {}) {
  const synth = win.speechSynthesis;
  const q = [];
  let busy = false;
  let gen = 0;
  let waiters = [];
  const settle = () => { const w = waiters; waiters = []; w.forEach((r) => r()); onIdle?.(); };
  const next = (g) => {
    if (g !== gen) return;
    if (!q.length) { busy = false; return settle(); }
    const text = q.shift();
    const u = new win.SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? lang;
    u.rate = rate;
    u.onend = () => next(g);
    u.onerror = (e) => { if (e.error === 'canceled' || e.error === 'interrupted') return; next(g); };
    synth.speak(u);
  };
  return {
    enqueue(text) {
      if (!synth || !text) return;
      q.push(text);
      if (!busy) { busy = true; onStart?.(); next(gen); }
    },
    cancel() { gen++; q.length = 0; const was = busy; busy = false; synth?.cancel(); if (was) settle(); },
    whenIdle() { return busy ? new Promise((r) => waiters.push(r)) : Promise.resolve(); },
    speaking: () => busy,
  };
}

export function stopSpeaking(win = globalThis) { win.speechSynthesis?.cancel(); }

/**
 * Crée un reconnaisseur. Renvoie null si l'API n'existe pas.
 * Callbacks : onInterim(text), onFinal({transcript, confidence}), onError(code), onEnd().
 */
export function createRecognizer({ lang, win = globalThis, onInterim, onFinal, onError, onEnd }) {
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let conf = null;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { finalText += r[0].transcript + ' '; conf = r[0].confidence ?? conf; }
      else interim += r[0].transcript;
    }
    onInterim?.((finalText + interim).trim());
  };
  rec.onerror = (e) => onError?.(e.error || 'unknown');
  rec.onend = () => { onFinal?.({ transcript: finalText.trim(), confidence: conf }); onEnd?.(); };
  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
    abort: () => rec.abort(),
  };
}

/** Messages d'erreur de reconnaissance (français). */
export function recognitionErrorMessage(code) {
  return ({
    'not-allowed': 'Accès au micro refusé. Autorisez le micro dans les réglages du navigateur.',
    'service-not-allowed': 'Le service de reconnaissance vocale est bloqué par le navigateur.',
    'no-speech': 'Aucune parole détectée. Rapprochez-vous du micro et réessayez.',
    'audio-capture': 'Aucun micro détecté.',
    network: 'La reconnaissance vocale du navigateur nécessite une connexion réseau (indisponible hors ligne).',
    'language-not-supported': 'Cette langue/variante n\'est pas prise en charge par la reconnaissance vocale de ce navigateur.',
    aborted: '',
  })[code] ?? `Erreur de reconnaissance vocale (${code}).`;
}
