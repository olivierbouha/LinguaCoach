/**
 * modules/speaking.js — Expression orale.
 *
 * Ce que l'écran mesure RÉELLEMENT :
 *   - « Reconnaissance des mots » : comparaison de texte entre la phrase modèle et la transcription du moteur du
 *     navigateur (SpeechRecognition). Ce n'est PAS un score de prononciation.
 *   - Les avis sur prononciation / accentuation / rythme ne viennent que d'une IA (si configurée), sont présentés
 *     comme des estimations qualitatives, sans note chiffrée.
 * Confidentialité : l'enregistrement audio reste en mémoire, n'est envoyé qu'après consentement explicite
 * (à chaque envoi) et peut être supprimé à tout moment.
 */
import { h } from '../utils.js';
import { select, banner, spinner, icon, toast } from '../ui.js';
import { TOPICS, getAccent } from '../config.js';
import { getLibrary, pickItems } from '../content/index.js';
import { speakSequence, stopSpeaking, describeVoice, createRecognizer, recognitionErrorMessage } from '../speech.js';
import { compareTexts } from '../text-compare.js';
import { Recorder, blobToWav16k, wavToBase64 } from '../audio.js';
import { speakingSystemPrompt, speakingUserMessage, parseSections, SPEAKING_SECTIONS, toList } from '../ai/prompts.js';

export async function render(root, ctx) {
  const { t, store } = ctx;
  let prefs = ctx.prefs();
  let sentence = null;
  const cursor = {};
  let state = 'idle'; // idle | recording | processing
  let recognizer = null;
  let recorder = null;
  let wantAudio = false;
  let result = null; // { transcript, confidence, comparison, error }
  let audio = null; // { blob, url, durationMs }
  let activityId = null;
  let aiBusy = false;
  let aiFeedback = null;
  let aiError = null;
  let playing = null;
  let attempt = 0; // invalide les rappels tardifs d'une tentative abandonnée
  const pick = await ctx.voicePick();
  const sup = ctx.support;
  const holder = h('div', {});

  function nextSentence() {
    prefs = ctx.prefs();
    const items = pickItems(getLibrary(prefs).phrases, { topic: prefs.topic, level: prefs.level });
    const key = `${prefs.topic}|${prefs.level}|${prefs.accent}`;
    cursor[key] = ((cursor[key] ?? -1) + 1) % items.length;
    sentence = items[cursor[key]];
    clearAttempt();
  }

  function discardAudio() {
    if (audio?.url) URL.revokeObjectURL(audio.url);
    audio = null;
  }
  function clearAttempt() {
    attempt++;
    recognizer?.abort?.(); recorder?.cancel(); recognizer = null; recorder = null;
    discardAudio();
    result = null; aiFeedback = null; aiError = null; activityId = null; state = 'idle';
  }

  function listenModel(slow) {
    if (!pick.voice) { toast(t('speech.noVoice'), { kind: 'warn' }); return; }
    playing?.cancel();
    playing = speakSequence([{ text: sentence.text }], { voice: pick.voice, lang: pick.voice.lang, rate: slow ? 0.65 : ctx.prefs().speechRate });
    playing.done.then(() => { playing = null; });
  }

  /* ---------- enregistrement ---------- */
  async function start() {
    clearAttempt();
    stopSpeaking();
    const useRecognition = sup.recognition;
    const useRecorder = sup.recorder && (wantAudio || !useRecognition);
    if (!useRecognition && !useRecorder) { toast(t('speaking.noCapability'), { kind: 'error' }); return; }
    state = 'recording'; draw();
    const mine = attempt;
    try {
      if (useRecognition) {
        let finish;
        recognizer = createRecognizer({
          lang: prefs.accent,
          onInterim: (txt) => { if (mine !== attempt) return; result = { ...(result ?? {}), interim: txt }; drawLive(); },
          onFinal: ({ transcript, confidence }) => { if (mine !== attempt) return; result = { ...(result ?? {}), transcript, confidence }; },
          onError: (code) => { if (mine !== attempt) return; result = { ...(result ?? {}), error: recognitionErrorMessage(code) }; },
          onEnd: () => finish?.(),
        });
        recognizer.ended = new Promise((res) => { finish = res; });
        recognizer.start();
      }
      if (useRecorder) {
        recorder = new Recorder();
        await recorder.start({ onAutoStop: () => stop() });
      }
    } catch (e) {
      clearAttempt();
      toast(e?.name === 'NotAllowedError' ? recognitionErrorMessage('not-allowed') : t('speaking.startFail'), { kind: 'error' });
      draw();
    }
  }

  async function stop() {
    if (state !== 'recording') return;
    state = 'processing'; draw();
    const ended = recognizer?.ended;
    recognizer?.stop();
    if (recorder) {
      const { blob, durationMs } = await recorder.stop();
      recorder = null;
      audio = blob.size ? { blob, url: URL.createObjectURL(blob), durationMs } : null;
    }
    if (ended) await Promise.race([ended, new Promise((r) => setTimeout(r, 4000))]);
    if (result?.transcript) result.comparison = compareTexts(sentence.text, result.transcript);
    state = 'idle';
    // Activité réellement effectuée : on l'enregistre ; le score n'existe que si une transcription a été obtenue.
    const act = await ctx.logActivity({
      skill: 'speaking', type: result?.comparison ? 'recognition' : 'recording', level: sentence.level,
      ...(result?.comparison ? { score: { correct: result.comparison.matched, total: result.comparison.expectedCount } } : {}),
    });
    activityId = act.id;
    draw();
  }

  /* ---------- IA ---------- */
  async function askFeedback({ withAudio }) {
    aiBusy = true; aiError = null; aiFeedback = null; draw();
    try {
      const p = ctx.prefs();
      let audioPart;
      if (withAudio) {
        const { wav, durationMs } = await blobToWav16k(audio.blob);
        audioPart = { mimeType: 'audio/wav', base64: wavToBase64(wav), durationMs };
      }
      const r = await ctx.askAI({
        system: speakingSystemPrompt(p, { hasAudio: !!audioPart }),
        messages: [{ role: 'user', content: speakingUserMessage({ expected: sentence.text, recognized: result?.transcript, comparison: result?.comparison }) }],
        maxTokens: 1200, ...(audioPart ? { audio: audioPart } : {}),
      });
      const parsed = parseSections(r.text, SPEAKING_SECTIONS);
      aiFeedback = { ...parsed, raw: r.text, withAudio: !!audioPart, provider: r.provider, model: r.model };
      if (activityId) {
        const acts = await store.all('activities');
        const a = acts.find((x) => x.id === activityId);
        if (a) await store.put('activities', { ...a, aiEstimate: r.text.slice(0, 2000) });
      }
    } catch (e) {
      if (e.kind !== 'canceled') aiError = e.message;
    } finally { aiBusy = false; draw(); }
  }

  /* ---------- rendu ---------- */
  function diffEl(c) {
    return h('p', { class: 'diff', lang: 'en' }, c.ops.map((o) => {
      if (o.type === 'match') return h('span', { class: 'ok' }, o.exp + ' ');
      if (o.type === 'sub') return h('span', { class: 'bad' }, h('del', {}, o.act), ' → ', h('ins', {}, o.exp), ' ');
      if (o.type === 'del') return h('span', { class: 'bad' }, `[${o.exp}] `);
      return h('span', { class: 'extra' }, h('del', {}, o.act), ' ');
    }));
  }

  function aiBlock() {
    if (aiBusy) return h('p', {}, spinner(t('speaking.aiBusy')));
    if (aiError) return banner('error', aiError);
    if (!aiFeedback) return null;
    const secs = aiFeedback.sections;
    return h('section', { class: 'card ai-card' },
      banner('warn', h('strong', {}, t('speaking.aiEstimate')), ' ', aiFeedback.withAudio ? t('speaking.aiEstimateAudio') : t('speaking.aiEstimateText')),
      aiFeedback.structured
        ? SPEAKING_SECTIONS.filter((k) => secs[k]).map((k) => h('div', { class: 'msg-sec' }, h('h3', {}, t(`speaking.sec.${k}`)),
          k === 'TIPS' ? h('ul', {}, toList(secs[k]).map((x) => h('li', {}, x))) : h('p', {}, secs[k])))
        : h('p', {}, aiFeedback.raw),
      h('p', { class: 'meta' }, t('writing.generatedBy', { p: ctx.ai.providerLabel(aiFeedback.provider), m: aiFeedback.model })));
  }

  function resultEl() {
    if (state === 'recording') return h('section', { class: 'card', 'aria-live': 'polite' }, h('p', { id: 'live' }, spinner(t('speaking.listening'))), h('p', { class: 'transcript live', lang: 'en', id: 'live-text' }, result?.interim ?? ''));
    if (state === 'processing') return h('section', { class: 'card' }, spinner(t('speaking.processing')));
    if (!result && !audio) return null;
    const c = result?.comparison;
    const primary = ctx.ai.resolve('primary');
    const audioCapable = primary && ctx.ai.isUsable(primary) && primary.provider.capabilities.audioInput;
    return h('section', { class: 'card' },
      h('h2', {}, t('speaking.result')),
      result?.error ? banner('warn', result.error) : null,
      c
        ? [h('h3', {}, t('speaking.recogTitle')),
          h('p', { role: 'status', class: 'score' }, t('speaking.recogScore', { c: c.matched, n: c.expectedCount })),
          h('p', {}, h('strong', {}, t('speaking.heard')), ' ', h('span', { lang: 'en' }, result.transcript || '—')),
          diffEl(c), h('p', { class: 'hint' }, t('speaking.diffLegend')),
          result.confidence != null ? h('p', { class: 'muted' }, t('speaking.confidence', { pct: Math.round(result.confidence * 100) })) : null,
          banner('info', t('speaking.recogCaveat'))]
        : (sup.recognition && !result?.error ? banner('warn', t('speaking.noTranscript')) : null),
      !sup.recognition ? banner('info', t('speaking.noRecognition')) : null,
      audio ? h('div', {}, h('h3', {}, t('speaking.replayTitle')), h('audio', { controls: true, src: audio.url, 'aria-label': t('speaking.replayTitle') }),
        h('p', { class: 'hint' }, t('speaking.compareByEar')),
        h('button', { class: 'btn btn-small btn-danger', type: 'button', onclick: () => { discardAudio(); draw(); } }, icon('trash', 16), ' ', t('speaking.deleteAudio'))) : null,
      h('div', { class: 'btn-row' },
        ctx.ai.isConfigured() && (c || result?.transcript) ? h('button', { class: 'btn', type: 'button', disabled: aiBusy, onclick: () => askFeedback({ withAudio: false }) }, t('speaking.aiText')) : null,
        audio && audioCapable ? h('button', { class: 'btn', type: 'button', disabled: aiBusy, onclick: () => askFeedback({ withAudio: true }) }, t('speaking.aiAudio', { p: primary.provider.label })) : null),
      ctx.ai.isConfigured() && audio && !audioCapable ? h('p', { class: 'hint' }, t('speaking.audioUnsupported')) : null,
      aiBlock());
  }

  function drawLive() {
    const el = document.getElementById('live-text');
    if (el) el.textContent = result?.interim ?? '';
  }

  function draw() {
    prefs = ctx.prefs();
    const v = describeVoice(pick);
    const accent = getAccent(prefs);
    const primary = ctx.ai.resolve('primary');
    const audioCapable = primary && ctx.ai.isUsable(primary) && primary.provider.capabilities.audioInput;
    holder.replaceChildren(
      banner(v.level === 'ok' ? 'info' : 'warn', h('strong', {}, t('speech.voiceStatus')), ' ', v.text),
      !sup.recognition ? banner('info', t('speaking.noRecognitionTop')) : banner('info', t('speaking.recognitionPrivacy')),
      h('p', { class: 'chips' }, h('span', { class: 'chip' }, accent.label), h('span', { class: 'chip' }, `${t('common.level')} ${prefs.level}`), h('a', { class: 'chip', href: '#/settings' }, t('common.change'))),
      h('div', { class: 'field' }, h('label', { for: 's-topic' }, t('common.topic')),
        select(Object.entries(TOPICS).map(([k, x]) => [k, x.label]), prefs.topic, (x) => { ctx.setPrefs({ topic: x }); nextSentence(); draw(); }, { id: 's-topic' })),
      h('section', { class: 'card' },
        h('h2', {}, t('speaking.model')),
        h('p', { class: 'big-text', lang: 'en' }, sentence.text),
        h('p', { class: 'muted' }, `${t('common.level')} ${sentence.level}`),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', disabled: !pick.voice, onclick: () => listenModel(false) }, icon('play', 18), ' ', t('speaking.listen')),
          h('button', { class: 'btn', type: 'button', disabled: !pick.voice, onclick: () => listenModel(true) }, t('speaking.listenSlow')),
          h('button', { class: 'btn', type: 'button', onclick: () => { nextSentence(); draw(); } }, t('speaking.next'))),
        sup.recognition && sup.recorder && audioCapable
          ? h('div', { class: 'field field-check' }, h('input', { id: 's-audio', type: 'checkbox', checked: wantAudio, disabled: state !== 'idle', onchange: (e) => { wantAudio = e.target.checked; } }), h('label', { for: 's-audio' }, t('speaking.wantAudio')))
          : (sup.recognition && sup.recorder ? h('div', { class: 'field field-check' }, h('input', { id: 's-audio', type: 'checkbox', checked: wantAudio, disabled: state !== 'idle', onchange: (e) => { wantAudio = e.target.checked; } }), h('label', { for: 's-audio' }, t('speaking.wantAudioLocal'))) : null),
        h('div', { class: 'record-row' },
          state === 'recording'
            ? h('button', { class: 'btn btn-record is-recording', type: 'button', onclick: stop }, icon('stop', 20), ' ', t('speaking.stop'))
            : h('button', { class: 'btn btn-record', type: 'button', disabled: state === 'processing' || (!sup.recognition && !sup.recorder), onclick: start }, icon('speak', 20), ' ', t('speaking.record')),
          h('span', { class: 'hint' }, t('speaking.maxDuration')))),
      resultEl());
  }

  root.replaceChildren(h('h1', {}, t('speaking.title')), holder);
  nextSentence();
  draw();
  return { destroy() { clearAttempt(); playing?.cancel(); stopSpeaking(); } };
}
