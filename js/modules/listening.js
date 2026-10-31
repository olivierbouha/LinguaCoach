/**
 * modules/listening.js — Compréhension orale : bibliothèque locale (hors ligne) + exercices générés par l'IA (facultatif).
 * Synthèse vocale via SpeechSynthesis ; la voix réellement utilisée est affichée (jamais un accent « garanti »).
 * Les scores sont calculés localement (réponses justes / total), jamais estimés.
 */
import { h } from '../utils.js';
import { select, banner, spinner, icon, toast } from '../ui.js';
import { TOPICS, getAccent } from '../config.js';
import { getLibrary, pickItems } from '../content/index.js';
import { speakSequence, stopSpeaking, describeVoice } from '../speech.js';
import { compareTexts } from '../text-compare.js';
import { listeningGenSystemPrompt, extractJson, normalizeGeneratedExercise } from '../ai/prompts.js';
import { uid } from '../utils.js';

const RATES = [0.6, 0.8, 1, 1.2];

export async function render(root, ctx) {
  const { t } = ctx;
  const L = ctx.prefs().language; // langue apprise (attribut lang des textes affichés)
  let prefs = ctx.prefs();
  let format = 'story'; // phrase | dialogue | story
  let dictation = false;
  let rate = RATES.includes(prefs.speechRate) ? prefs.speechRate : 1;
  let exercise = null;
  let showTranscript = false;
  let answers = {};
  let checked = false;
  let dictText = '';
  let dictResult = null;
  let playing = null;
  let currentLine = -1;
  let generating = false;
  let checkBtn = null; // bouton « Vérifier » du quiz (activé quand toutes les questions ont une réponse)
  const cursor = {};
  const pick = await ctx.voicePick();

  const holder = h('div', {});

  function library() {
    prefs = ctx.prefs();
    const lib = getLibrary(prefs);
    return { phrase: lib.phrases, dialogue: lib.dialogues, story: lib.stories }[format];
  }

  function nextLocal() {
    prefs = ctx.prefs();
    const items = pickItems(library(), { topic: prefs.topic, level: prefs.level });
    const key = `${format}|${prefs.topic}|${prefs.level}|${prefs.accent}`;
    const i = (cursor[key] ?? -1) + 1;
    cursor[key] = i % items.length;
    exercise = items[cursor[key]];
    reset();
  }

  function reset() { stop(); showTranscript = false; answers = {}; checked = false; dictText = ''; dictResult = null; currentLine = -1; }

  /* ---------- lecture audio ---------- */
  async function play() {
    if (!pick.voice) { toast(t('speech.noVoice'), { kind: 'warn' }); return; }
    stop();
    let segments;
    if (exercise.type === 'dialogue') {
      const voices = await ctx.allVoices();
      const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(pick.voice.lang.slice(0, 2).toLowerCase()) && v.voiceURI !== pick.voice.voiceURI);
      const voiceB = sameLang.find((v) => v.lang.replace('_', '-').toLowerCase() === pick.voice.lang.replace('_', '-').toLowerCase()) ?? sameLang[0] ?? null;
      segments = exercise.lines.map((l, i) => ({ text: l.text, lineIndex: i, voice: l.speaker === 'B' ? voiceB ?? pick.voice : pick.voice, pitch: l.speaker === 'B' && !voiceB ? 0.8 : 1 }));
    } else {
      segments = [{ text: exercise.text }];
    }
    playing = speakSequence(segments, {
      voice: pick.voice, lang: pick.voice.lang, rate,
      onSegment: (seg) => { if (seg.lineIndex != null && seg.lineIndex !== currentLine) { currentLine = seg.lineIndex; if (showTranscript) draw(); } },
    });
    draw();
    playing.done.then(() => { playing = null; currentLine = -1; draw(); });
  }
  function stop() { playing?.cancel(); playing = null; stopSpeaking(); }

  /* ---------- vérification ---------- */
  async function checkQuiz() {
    const qs = exercise.questions;
    const correct = qs.filter((q, i) => answers[i] === q.answer).length;
    checked = true;
    await ctx.logActivity({ skill: 'listening', type: exercise.type, level: exercise.level, topic: exercise.topic ?? prefs.topic, score: { correct, total: qs.length } });
    draw();
  }

  async function checkDictation() {
    dictResult = compareTexts(exercise.text, dictText);
    if (!checked) {
      checked = true;
      await ctx.logActivity({ skill: 'listening', type: 'dictation', level: exercise.level, topic: exercise.topic ?? prefs.topic, score: { correct: dictResult.matched, total: dictResult.expectedCount } });
    }
    draw();
  }

  /* ---------- génération IA ---------- */
  async function generate() {
    generating = true; draw();
    try {
      const p = ctx.prefs();
      const r = await ctx.askAI({
        system: listeningGenSystemPrompt(p), json: true, maxTokens: 2500,
        messages: [{ role: 'user', content: `Create a new ${format} exercise now. Variation seed: ${Math.random().toString(36).slice(2, 8)}.` }],
      });
      const ex = normalizeGeneratedExercise(extractJson(r.text), { id: uid() });
      if (!ex) throw new Error(t('listening.genBad'));
      exercise = { ...ex, level: p.level, topic: p.topic };
      format = ex.type;
      reset();
      toast(t('listening.genOk'), { kind: 'success' });
    } catch (e) {
      if (e.kind !== 'canceled') toast(e.message || t('listening.genBad'), { kind: 'error', duration: 8000 });
    } finally { generating = false; draw(); }
  }

  /* ---------- rendu ---------- */
  function transcriptEl() {
    if (exercise.type === 'dialogue') {
      return h('ul', { class: 'transcript', lang: L }, exercise.lines.map((l, i) => h('li', { class: i === currentLine ? 'current' : '' }, h('strong', {}, `${l.speaker}: `), l.text)));
    }
    return h('p', { class: 'transcript', lang: L }, exercise.text);
  }

  function diffEl(res) {
    return h('p', { class: 'diff', lang: L }, res.ops.map((o) => {
      if (o.type === 'match') return h('span', { class: 'ok' }, o.exp + ' ');
      if (o.type === 'sub') return h('span', { class: o.near ? 'near' : 'bad' }, h('del', {}, o.act), ' → ', h('ins', {}, o.exp), ' ');
      if (o.type === 'del') return h('span', { class: 'bad' }, `[${o.exp}] `);
      return h('span', { class: 'extra' }, h('del', {}, o.act), ' ');
    }));
  }

  function questionsEl() {
    return h('div', {}, exercise.questions.map((q, i) => {
      const name = `q${i}`;
      return h('fieldset', { class: 'question' },
        h('legend', {}, `${i + 1}. `, h('span', { lang: L }, q.q)),
        q.options.map((o, j) => {
          const id = `${name}-${j}`;
          const right = checked && j === q.answer;
          const wrong = checked && answers[i] === j && j !== q.answer;
          return h('div', { class: `choice ${right ? 'is-right' : ''} ${wrong ? 'is-wrong' : ''}` },
            h('input', { type: 'radio', id, name, checked: answers[i] === j, disabled: checked, onchange: () => { answers[i] = j; if (checkBtn) checkBtn.disabled = Object.keys(answers).length < exercise.questions.length; } }),
            h('label', { for: id, lang: L }, o, right ? h('span', { class: 'tag' }, ' ✓ ', t('listening.right')) : null, wrong ? h('span', { class: 'tag' }, ' ✗ ', t('listening.wrong')) : null));
        }),
        checked ? h('p', { class: 'explain' }, q.explanation) : null);
    }));
  }

  function draw() {
    prefs = ctx.prefs();
    const v = describeVoice(pick);
    const accent = getAccent(prefs);
    const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': t('listening.format') },
      [['phrase', 'listening.fPhrase'], ['dialogue', 'listening.fDialogue'], ['story', 'listening.fStory']].map(([k, key]) =>
        h('button', { class: 'seg-btn', type: 'button', 'aria-pressed': String(format === k), onclick: () => { format = k; nextLocal(); draw(); } }, t(key))));

    const player = exercise && h('section', { class: 'card' },
      h('h2', {}, exercise.title ?? t('listening.phraseTitle')),
      h('p', { class: 'muted' }, exercise.generated ? t('listening.srcAi') : t('listening.srcLocal'), ' · ', exercise.level ? `${t('common.level')} ${exercise.level}` : '', ' · ', accent.short),
      h('div', { class: 'btn-row' },
        playing
          ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { stop(); draw(); } }, icon('stop', 18), ' ', t('listening.stop'))
          : h('button', { class: 'btn btn-primary', type: 'button', disabled: !pick.voice, onclick: play }, icon('play', 18), ' ', t('listening.play')),
        h('button', { class: 'btn', type: 'button', disabled: !pick.voice, onclick: play }, icon('refresh', 18), ' ', t('listening.replay')),
        h('div', { class: 'field inline' }, h('label', { for: 'l-rate' }, t('listening.speed')),
          select(RATES.map((r) => [String(r), `${r}×`]), String(rate), (x) => { rate = Number(x); ctx.setPrefs({ speechRate: rate }); if (playing) play(); }, { id: 'l-rate' }))),
      h('button', { class: 'btn btn-small', type: 'button', 'aria-expanded': String(showTranscript), onclick: () => { showTranscript = !showTranscript; draw(); } }, showTranscript ? t('listening.hide') : t('listening.show')),
      showTranscript ? transcriptEl() : null,
      !pick.voice ? banner('warn', t('listening.noVoiceReadText')) : null,
      exercise.type === 'phrase' && dictation
        ? h('div', { class: 'dictation' },
          h('label', { for: 'l-dict' }, t('listening.dictLabel')),
          h('textarea', { id: 'l-dict', class: 'input', rows: 3, lang: L, value: dictText, disabled: checked, oninput: (e) => { dictText = e.target.value; } }),
          h('button', { class: 'btn btn-primary', type: 'button', disabled: checked, onclick: checkDictation }, t('listening.check')),
          dictResult ? [h('p', { role: 'status' }, t('listening.dictScore', { c: dictResult.matched, n: dictResult.expectedCount })), diffEl(dictResult),
            h('p', { class: 'hint' }, t('listening.dictLegend')), h('p', { class: 'hint' }, t('listening.dictNote'))] : null)
        : null,
      exercise.questions?.length
        ? h('div', {}, h('h3', {}, t('listening.questions')), questionsEl(),
          checked
            ? h('p', { role: 'status', class: 'score' }, t('listening.score', { c: exercise.questions.filter((q, i) => answers[i] === q.answer).length, n: exercise.questions.length }), ' ', h('span', { class: 'muted' }, t('listening.scoreLocal')))
            : (checkBtn = h('button', { class: 'btn btn-primary', type: 'button', disabled: Object.keys(answers).length < exercise.questions.length, onclick: checkQuiz }, t('listening.check'))))
        : null,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => { nextLocal(); draw(); } }, t('listening.next')),
        ctx.ai.isConfigured() ? h('button', { class: 'btn', type: 'button', disabled: generating, onclick: generate }, generating ? spinner(t('listening.generating')) : t('listening.generate')) : null));

    holder.replaceChildren(
      banner(v.level === 'ok' ? 'info' : 'warn', h('strong', {}, t('speech.voiceStatus')), ' ', v.text),
      h('p', { class: 'chips' }, h('span', { class: 'chip' }, accent.label), h('span', { class: 'chip' }, `${t('common.level')} ${prefs.level}`), h('a', { class: 'chip', href: '#/settings' }, t('common.change'))),
      h('div', { class: 'field' }, h('label', { for: 'l-topic' }, t('common.topic')),
        select(Object.entries(TOPICS).map(([k, x]) => [k, x.label]), prefs.topic, (x) => { ctx.setPrefs({ topic: x }); nextLocal(); draw(); }, { id: 'l-topic' })),
      tabs,
      format === 'phrase' ? h('div', { class: 'field field-check' }, h('input', { id: 'l-dictmode', type: 'checkbox', checked: dictation, onchange: (e) => { dictation = e.target.checked; reset(); draw(); } }), h('label', { for: 'l-dictmode' }, t('listening.dictMode'))) : null,
      player);
  }

  root.replaceChildren(h('h1', {}, t('listening.title')), h('p', { class: 'muted' }, ctx.ai.isConfigured() ? t('listening.introAi') : t('listening.introLocal')), holder);
  nextLocal();
  draw();
  return { destroy() { stop(); } };
}
