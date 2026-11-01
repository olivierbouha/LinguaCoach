/**
 * modules/conversation.js — Appel vocal avec un tuteur IA : choix du tuteur et du scénario, écran d'appel plein écran
 * (avatar animé, sous-titres, gros bouton micro), bilan de fin de session relié à Révision.
 *
 * Honnêteté : l'IA ne reçoit que la TRANSCRIPTION (texte), jamais l'audio ; elle ne juge donc pas la prononciation.
 * Aucun enregistrement audio n'est conservé. Les sessions sont enregistrées localement (kind: 'voice').
 * Sans reconnaissance vocale (ex. Firefox) ou sans voix : saisie clavier / texte seul restent utilisables.
 * L'animation de l'avatar n'est pas synchronisée sur la voix : c'est un indicateur « parle / écoute ».
 */
import { h, uid, formatDateTime } from '../utils.js';
import { banner, spinner, icon, toast, confirmDialog } from '../ui.js';
import { conversationSystemPrompt, sessionSummarySystemPrompt, normalizeSessionSummary, extractJson } from '../ai/prompts.js';
import { getAccent, getLanguage } from '../config.js';
import { speechSupport, createRecognizer, createSpeechQueue, recognitionErrorMessage } from '../speech.js';
import { createSentenceStreamer, splitTip } from '../conversation-utils.js';
import { TUTORS, getTutor, getScenario, scenariosForLevel } from '../tutors.js';
import { createAvatar } from '../avatar.js';
import { newCard } from '../progress.js';

const HISTORY_LIMIT = 16;
const STARTER = 'Please start the conversation with a short greeting and one simple question.';
const OPTS_KEY = 'lc.conv.opts';
const SEL_KEY = 'lc.conv.sel';

const readLS = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) ?? '{}') }; } catch { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* facultatif */ } };

/** Historique transmis à l'IA : doit commencer par un message « user » (certaines API l'exigent). */
export function buildHistory(messages, limit = HISTORY_LIMIT) {
  const msgs = messages.slice(-limit).map((m) => ({ role: m.role, content: m.content }));
  if (msgs.length && msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: STARTER });
  return msgs.length ? msgs : [{ role: 'user', content: STARTER }];
}

export const fmtDuration = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Statistiques locales d'une session (aucune IA, rien d'estimé sur la prononciation). */
export function sessionStats(conv) {
  const user = (conv?.messages ?? []).filter((m) => m.role === 'user');
  const words = user.reduce((n, m) => n + (m.content.match(/\S+/g)?.length ?? 0), 0);
  return { turns: user.length, words, durationSec: conv?.durationSec ?? 0 };
}

export async function render(root, ctx) {
  const { t, store } = ctx;
  const L = ctx.prefs().language;
  let prefs = ctx.prefs();
  const opts = readLS(OPTS_KEY, { autoSend: true, handsFree: false, showText: true });
  const sel = readLS(SEL_KEY, { tutor: TUTORS[0].id, scenario: 'free' });
  const support = speechSupport();
  let convs = (await store.all('conversations')).filter((c) => c.kind === 'voice').sort((a, b) => b.updatedAt - a.updatedAt);
  let conv = null;
  let view = 'setup'; // setup | call | summary
  let state = 'idle'; // idle | listening | thinking | speaking
  let controller = null;
  let recognizer = null;
  let queue = null;
  let streamText = '';
  let streamErr = null;
  let destroyed = false;
  let rafId = 0;
  let callStart = 0;
  let timer = 0;
  let summarizing = false;
  let summaryErr = null;

  // éléments de l'écran d'appel (recréés à chaque appel)
  let callRoot, subtitles, statusEl, transcript, micBtn, timerEl, avatarBox;

  const tutor = () => getTutor(conv?.tutorId ?? sel.tutor);

  /* ================= ÉCRAN 1 : préparation ================= */
  function showSetup() {
    view = 'setup'; conv = null; streamErr = null;
    const level = ctx.prefs().level;
    const scenarios = scenariosForLevel(level);
    if (!scenarios.some((s) => s.id === sel.scenario)) sel.scenario = 'free';
    const accent = getAccent(prefs);
    const tutorCards = TUTORS.map((tu) => h('div', { class: 'tutor-choice' },
      h('input', { type: 'radio', name: 'tutor', id: `tu-${tu.id}`, checked: sel.tutor === tu.id, onchange: () => { sel.tutor = tu.id; writeLS(SEL_KEY, sel); } }),
      h('label', { for: `tu-${tu.id}` }, createAvatar(tu, 64), h('strong', {}, tu.name), h('span', { class: 'muted' }, tu.role))));
    const scenarioSel = h('select', { id: 'cv-scenario', class: 'input', onchange: (e) => { sel.scenario = e.target.value; writeLS(SEL_KEY, sel); drawGoal(); } },
      scenarios.map((s) => h('option', { value: s.id, selected: s.id === sel.scenario }, s.title)));
    const goal = h('p', { class: 'muted', id: 'cv-goal' });
    const drawGoal = () => goal.replaceChildren(t('conv.goal'), ' ', getScenario(sel.scenario).goal);
    drawGoal();
    const history = convs.length
      ? h('section', { class: 'card' }, h('h2', {}, t('conv.history')),
        h('ul', { class: 'list' }, convs.map((c) => h('li', { class: 'list-item' },
          h('span', {}, h('strong', {}, `${getTutor(c.tutorId).name} · ${getScenario(c.scenarioId).title}`), h('span', { class: 'muted block' }, `${formatDateTime(c.updatedAt, prefs.uiLang)} · ${fmtDuration(c.durationSec ?? 0)}`)),
          h('span', { class: 'btn-row' },
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => { conv = c; showSummary(); } }, t('conv.see')),
            h('button', { class: 'btn btn-small btn-danger', type: 'button', 'aria-label': t('conv.deleteAria'), onclick: () => deleteConv(c) }, icon('trash', 16)))))))
      : null;
    root.replaceChildren(...[
      h('h1', {}, t('conv.title')),
      h('p', { class: 'chips' }, h('span', { class: 'chip' }, accent.label), h('span', { class: 'chip' }, `${t('common.level')} ${level}`), h('a', { class: 'chip', href: '#/settings' }, t('common.change'))),
      !ctx.ai.isConfigured() ? banner('info', t('conv.emptyNoAi'), ' ', h('a', { href: '#/settings' }, t('home.noAiLink'))) : null,
      !support.recognition ? banner('warn', t('conv.noRecognition')) : banner('info', t('conv.privacy', { lang: getLanguage(prefs).label })),
      !support.synthesis ? banner('warn', t('conv.noSynthesis')) : null,
      h('section', { class: 'card' }, h('h2', {}, t('conv.chooseTutor')),
        h('fieldset', { class: 'tutor-grid' }, h('legend', { class: 'sr-only' }, t('conv.chooseTutor')), ...tutorCards),
        h('div', { class: 'field' }, h('label', { for: 'cv-scenario' }, t('conv.scenario')), scenarioSel, goal),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary call-btn', type: 'button', disabled: !ctx.ai.isConfigured(), onclick: () => startCall() }, icon('speak', 20), ' ', t('conv.call')))),
      history,
    ].filter(Boolean));
  }

  async function deleteConv(c) {
    if (!(await confirmDialog({ title: t('writing.deleteTitle'), message: t('writing.deleteMsg'), confirmLabel: t('common.delete'), danger: true }))) return;
    await store.delete('conversations', c.id);
    convs = convs.filter((x) => x.id !== c.id);
    showSetup();
  }

  /* ================= ÉCRAN 2 : appel ================= */
  const setState = (s) => {
    state = s;
    if (view !== 'call' || !callRoot) return;
    callRoot.classList.toggle('is-speaking', s === 'speaking');
    callRoot.classList.toggle('is-listening', s === 'listening');
    callRoot.classList.toggle('is-thinking', s === 'thinking');
    micBtn.setAttribute('aria-pressed', String(s === 'listening'));
    micBtn.classList.toggle('is-listening', s === 'listening');
    micBtn.replaceChildren(icon('speak', 28), h('span', { class: 'mic-label' }, t(s === 'listening' ? 'conv.micStop' : 'conv.micStart')));
    micBtn.disabled = !support.recognition || s === 'thinking';
    statusEl.textContent = t(`conv.state.${s}`);
  };

  function drawCall() {
    if (view !== 'call' || !callRoot) return;
    const last = conv?.messages.at(-1);
    let aiText = '';
    if (streamText) aiText = splitTip(streamText).spoken;
    else if (last?.role === 'assistant') aiText = splitTip(last.content).spoken;
    subtitles.replaceChildren(...[
      opts.showText && aiText ? h('p', { class: 'subtitle', lang: L }, aiText) : null,
      state === 'thinking' && !streamText ? spinner(t('writing.thinking')) : null,
      streamErr ? banner('error', h('p', {}, streamErr.message),
        h('div', { class: 'btn-row' },
          conv?.messages.at(-1)?.role === 'user' && streamErr.kind !== 'config' ? h('button', { class: 'btn', type: 'button', onclick: () => generate() }, icon('refresh', 16), ' ', t('writing.retry')) : null,
          ['config', 'auth', 'validation'].includes(streamErr.kind) ? h('a', { class: 'btn', href: '#/settings' }, t('writing.openSettings')) : null)) : null,
    ].filter(Boolean));
  }
  const scheduleDraw = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; drawCall(); }); };

  async function startCall() {
    if (!ctx.ai.isConfigured()) return;
    const p = ctx.prefs();
    conv = { id: uid(), kind: 'voice', title: '', createdAt: Date.now(), updatedAt: Date.now(), topic: p.topic, level: p.level, accent: p.accent, profile: p.profile,
      tutorId: sel.tutor, scenarioId: sel.scenario, durationSec: 0, messages: [] };
    view = 'call'; streamErr = null; streamText = ''; callStart = Date.now();
    buildCall();
    timer = setInterval(() => { timerEl.textContent = fmtDuration((Date.now() - callStart) / 1000); }, 1000);
    await generate();
  }

  function buildCall() {
    const tu = tutor();
    const sc = getScenario(conv.scenarioId);
    avatarBox = h('div', { class: 'call-avatar' }, createAvatar(tu, 160));
    statusEl = h('p', { class: 'conv-status', role: 'status', 'aria-live': 'polite' });
    subtitles = h('div', { class: 'call-subtitles', 'aria-live': 'polite', 'aria-label': t('conv.logLabel') });
    timerEl = h('span', { class: 'call-timer' }, '0:00');
    transcript = h('textarea', { id: 'cv-input', class: 'input chat-input', rows: 2, lang: L, maxlength: 2000, placeholder: t('conv.typePlaceholder'),
      onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTyped(); } } });
    micBtn = h('button', { class: 'mic-btn', type: 'button', 'aria-pressed': 'false', onclick: () => toggleMic() });
    const optCheckbox = (id, key, label, onChange) => h('div', { class: 'choice' },
      h('input', { type: 'checkbox', id, checked: opts[key], onchange: (e) => { opts[key] = e.target.checked; writeLS(OPTS_KEY, opts); onChange?.(); } }),
      h('label', { for: id }, label));
    callRoot = h('section', { class: 'call', 'aria-label': t('conv.callWith', { name: tu.name }) },
      h('div', { class: 'call-top' },
        h('div', {}, h('h1', { class: 'call-name' }, tu.name), h('p', { class: 'muted' }, sc.id === 'free' ? tu.role : `${sc.title}`)),
        timerEl),
      avatarBox, statusEl, subtitles,
      h('div', { class: 'call-controls' },
        micBtn,
        h('button', { class: 'btn btn-danger hangup', type: 'button', onclick: () => hangUp() }, icon('stop', 18), ' ', t('conv.hangup'))),
      h('details', { class: 'call-more' }, h('summary', {}, t('conv.moreOptions')),
        h('label', { for: 'cv-input', class: 'sr-only' }, t('conv.typeLabel')), transcript,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => sendTyped() }, icon('send', 18), ' ', t('writing.send')), h('span', { class: 'hint' }, t('conv.hint'))),
        optCheckbox('cv-auto', 'autoSend', t('conv.optAutoSend')),
        optCheckbox('cv-hands', 'handsFree', t('conv.optHandsFree')),
        optCheckbox('cv-text', 'showText', t('conv.optShowText'), drawCall)));
    root.replaceChildren(callRoot);
    setState('idle'); drawCall();
  }

  /* ---------- reconnaissance vocale ---------- */
  function toggleMic() {
    if (state === 'listening') { recognizer?.stop(); return; }
    startListening();
  }

  function startListening() {
    if (!support.recognition || destroyed || view !== 'call' || !ctx.ai.isConfigured()) return;
    queue?.cancel(); // ne jamais écouter pendant que l'IA parle (écho)
    streamErr = null;
    transcript.value = '';
    let got = '';
    let failed = false;
    recognizer = createRecognizer({
      lang: getAccent(ctx.prefs()).code,
      onInterim: (txt) => { transcript.value = txt; },
      onFinal: ({ transcript: txt }) => { got = txt; },
      onError: (code) => { failed = true; const m = recognitionErrorMessage(code); if (m) toast(m, { kind: 'warn' }); },
      onEnd: () => {
        recognizer = null;
        if (destroyed || view !== 'call') return;
        setState('idle');
        const text = (got || transcript.value).trim();
        if (text && !failed && opts.autoSend) { transcript.value = ''; submit(text); }
        else if (text) transcript.focus();
        else if (!failed) toast(t('conv.noSpeech'), { kind: 'info' });
      },
    });
    try { recognizer.start(); setState('listening'); } catch { recognizer = null; setState('idle'); toast(t('conv.micError'), { kind: 'warn' }); }
  }

  /* ---------- envoi / génération ---------- */
  function sendTyped() {
    const text = transcript.value.trim();
    if (!text || state === 'thinking') return;
    transcript.value = '';
    recognizer?.abort?.();
    submit(text);
  }

  async function submit(text) {
    if (view !== 'call' || state === 'thinking') return;
    queue?.cancel();
    if (!conv.title) conv.title = text.slice(0, 50);
    conv.messages.push({ id: uid(), role: 'user', content: text, ts: Date.now() });
    await save();
    await generate();
  }

  async function save() {
    conv.updatedAt = Date.now();
    await store.put('conversations', conv);
    if (!convs.some((c) => c.id === conv.id)) convs.unshift(conv);
    convs.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function generate() {
    if (state === 'thinking' || view !== 'call') return;
    streamText = ''; streamErr = null;
    setState('thinking');
    drawCall();
    controller = new AbortController();
    const p = ctx.prefs();
    const tu = tutor();
    const pick = support.synthesis ? await ctx.voicePick() : { voice: null };
    if (!pick.voice && support.synthesis) toast(t('speech.noVoice'), { kind: 'warn' });
    queue = createSpeechQueue({ voice: pick.voice, lang: getAccent(p).code, rate: p.speechRate, pitch: tu.pitch, onStart: () => { if (state === 'thinking' || state === 'idle') setState('speaking'); } });
    const mk = () => createSentenceStreamer((s) => { if (pick.voice) queue.enqueue(s); });
    let streamer = mk();
    const system = conversationSystemPrompt(p, { persona: tu.persona, scenario: getScenario(conv.scenarioId).setup });
    let ok = false;
    try {
      const r = await ctx.askAI(
        { system, messages: buildHistory(conv.messages), maxTokens: 400 },
        { signal: controller.signal,
          onToken: (tok) => { streamText += tok; streamer.push(tok); scheduleDraw(); },
          onReset: () => { streamText = ''; queue.cancel(); streamer = mk(); } });
      streamer.end();
      conv.messages.push({ id: uid(), role: 'assistant', content: r.text, ts: Date.now(), provider: r.provider, model: r.model });
      await save();
      await ctx.logActivity({ skill: 'speaking', type: 'conversation' });
      ok = true;
    } catch (e) {
      streamer.end();
      queue.cancel();
      streamErr = { kind: e.kind, message: e.kind === 'canceled' && e.partialText ? t('writing.canceled') : e.message, partialText: e.partialText };
    } finally {
      streamText = '';
      controller = null;
      if (!destroyed && view === 'call') { if (!queue.speaking()) setState('idle'); drawCall(); }
    }
    if (ok && !destroyed && view === 'call') {
      await queue.whenIdle();
      if (destroyed || view !== 'call') return;
      setState('idle');
      if (opts.handsFree && support.recognition && ctx.ai.isConfigured()) startListening();
    }
  }

  function stopAll() {
    controller?.abort();
    queue?.cancel();
    recognizer?.abort?.();
    recognizer = null;
  }

  async function hangUp() {
    stopAll();
    clearInterval(timer); timer = 0;
    conv.durationSec = Math.round((Date.now() - callStart) / 1000);
    if (conv.messages.some((m) => m.role === 'user')) await save();
    else { await store.delete('conversations', conv.id).catch(() => {}); convs = convs.filter((c) => c.id !== conv.id); }
    state = 'idle';
    if (conv.messages.some((m) => m.role === 'user')) showSummary();
    else { toast(t('conv.emptyCall'), { kind: 'info' }); showSetup(); }
  }

  /* ================= ÉCRAN 3 : bilan ================= */
  function showSummary() {
    view = 'summary';
    drawSummary();
  }

  async function generateSummary() {
    if (summarizing) return;
    summarizing = true; summaryErr = null; drawSummary();
    const transcriptText = conv.messages.map((m) => `${m.role === 'user' ? 'LEARNER' : 'COACH'}: ${splitTip(m.content).spoken}`).join('\n');
    try {
      const r = await ctx.askAI({ system: sessionSummarySystemPrompt(ctx.prefs()), messages: [{ role: 'user', content: transcriptText.slice(-6000) }], maxTokens: 900 }, {});
      const s = normalizeSessionSummary(extractJson(r.text));
      if (!s) throw Object.assign(new Error(t('conv.summaryBad')), { kind: 'invalid_response' });
      conv.summary = s;
      await save();
    } catch (e) { summaryErr = e.message; }
    summarizing = false;
    if (view === 'summary') drawSummary();
  }

  async function addToReview(items) {
    for (const it of items) await store.put(it.kind === 'error' ? 'errors' : 'vocab', newCard(it));
    toast(t('conv.addedToReview', { n: items.length }), { kind: 'success' });
  }

  function drawSummary() {
    const st = sessionStats(conv);
    const tu = getTutor(conv.tutorId);
    const sm = conv.summary;
    const src = conv.id;
    const errCard = (e) => ({ kind: 'error', front: `${t('writing.fixThis')} ${e.wrong}`, back: `${e.right}${e.note ? ' — ' + e.note : ''}`, source: src });
    const vocCard = (v) => ({ kind: 'vocab', front: v.word, back: v.def || '—', source: src });
    const aiBlock = sm
      ? h('section', { class: 'card' }, h('h2', {}, t('conv.review')), sm.summary ? h('p', {}, sm.summary) : null,
        sm.strengths.length ? [h('h3', {}, t('conv.strengths')), h('ul', {}, sm.strengths.map((x) => h('li', {}, x)))] : null,
        sm.errors.length ? [h('h3', {}, t('writing.errors')), h('ul', { class: 'list' }, sm.errors.map((e) => h('li', { class: 'list-item' },
          h('span', {}, h('strong', { lang: L }, `${e.wrong} → ${e.right}`), e.note ? ` — ${e.note}` : ''),
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => addToReview([errCard(e)]) }, t('writing.memorise')))))] : null,
        sm.vocab.length ? [h('h3', {}, t('writing.vocab')), h('ul', { class: 'list' }, sm.vocab.map((v) => h('li', { class: 'list-item' },
          h('span', {}, h('strong', { lang: L }, v.word), v.def ? ` — ${v.def}` : ''),
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => addToReview([vocCard(v)]) }, t('writing.addVocab')))))] : null,
        (sm.errors.length || sm.vocab.length) ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => addToReview([...sm.errors.map(errCard), ...sm.vocab.map(vocCard)]) }, t('conv.addAll')) : null,
        h('p', { class: 'meta' }, t('conv.reviewDisclaimer')))
      : h('section', { class: 'card' }, h('h2', {}, t('conv.review')), h('p', { class: 'muted' }, t('conv.reviewHint')),
        summaryErr ? banner('error', summaryErr) : null,
        h('button', { class: 'btn btn-primary', type: 'button', disabled: summarizing || !ctx.ai.isConfigured(), onclick: () => generateSummary() }, summarizing ? spinner(t('conv.summarizing')) : t('conv.makeReview')));
    root.replaceChildren(...[
      h('h1', {}, t('conv.sessionTitle')),
      h('section', { class: 'card summary-head' }, createAvatar(tu, 64),
        h('div', {}, h('strong', {}, `${tu.name} · ${getScenario(conv.scenarioId).title}`),
          h('p', { class: 'muted' }, t('conv.stats', { d: fmtDuration(st.durationSec), n: st.turns, w: st.words })))),
      aiBlock,
      h('details', { class: 'card' }, h('summary', {}, t('conv.transcript')),
        h('div', { class: 'chat' }, conv.messages.map((m) => (m.role === 'user'
          ? h('article', { class: 'msg msg-user' }, h('p', { lang: L }, m.content))
          : h('article', { class: 'msg msg-ai' }, h('p', { lang: L }, splitTip(m.content).spoken), splitTip(m.content).tip ? h('p', { class: 'tip' }, h('strong', {}, t('conv.tip')), ' ', splitTip(m.content).tip) : null))))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => showSetup() }, t('conv.newCall'))),
    ].filter(Boolean));
  }

  showSetup();
  return { destroy() {
    if (view === 'call' && conv?.messages.some((m) => m.role === 'user')) { conv.durationSec = Math.round((Date.now() - callStart) / 1000); save().catch(() => {}); }
    destroyed = true; clearInterval(timer); controller?.abort(); queue?.cancel(); recognizer?.abort?.(); cancelAnimationFrame(rafId);
  } };
}
