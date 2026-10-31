/**
 * modules/conversation.js — Conversation orale avec l'IA : on parle (reconnaissance vocale du navigateur),
 * l'IA répond en texte (streaming) et la réponse est lue à voix haute phrase par phrase.
 *
 * Honnêteté : l'IA ne reçoit que la TRANSCRIPTION (texte), jamais l'audio ; elle ne juge donc pas la prononciation.
 * Aucun enregistrement audio n'est conservé. Les conversations sont enregistrées localement (kind: 'voice').
 * Sans reconnaissance vocale (ex. Firefox) ou sans voix : saisie au clavier / lecture désactivée, texte toujours utilisable.
 */
import { h, uid, formatDateTime } from '../utils.js';
import { banner, spinner, icon, toast, confirmDialog } from '../ui.js';
import { conversationSystemPrompt } from '../ai/prompts.js';
import { getAccent, getLanguage } from '../config.js';
import { speechSupport, createRecognizer, createSpeechQueue, recognitionErrorMessage } from '../speech.js';
import { createSentenceStreamer, splitTip } from '../conversation-utils.js';

const HISTORY_LIMIT = 16;
const STARTER = 'Please start the conversation with a short greeting and one simple question.';
const OPTS_KEY = 'lc.conv.opts';

const loadOpts = () => {
  const d = { autoSend: true, handsFree: false, showText: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}') }; } catch { return d; }
};
const saveOpts = (o) => { try { localStorage.setItem(OPTS_KEY, JSON.stringify(o)); } catch { /* facultatif */ } };

/** Historique transmis à l'IA : doit commencer par un message « user » (certaines API l'exigent). */
export function buildHistory(messages, limit = HISTORY_LIMIT) {
  const msgs = messages.slice(-limit).map((m) => ({ role: m.role, content: m.content }));
  if (msgs.length && msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: STARTER });
  return msgs.length ? msgs : [{ role: 'user', content: STARTER }];
}

export async function render(root, ctx) {
  const { t, store } = ctx;
  const L = ctx.prefs().language;
  let prefs = ctx.prefs();
  const opts = loadOpts();
  const support = speechSupport();
  let convs = (await store.all('conversations')).filter((c) => c.kind === 'voice').sort((a, b) => b.updatedAt - a.updatedAt);
  let conv = convs[0] ?? null;
  let state = 'idle'; // idle | listening | thinking | speaking
  let controller = null;
  let recognizer = null;
  let queue = null;
  let streamText = '';
  let streamErr = null;
  let destroyed = false;
  let rafId = 0;

  const log = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite', 'aria-label': t('conv.logLabel') });
  const statusEl = h('p', { class: 'conv-status', role: 'status', 'aria-live': 'polite' });
  const transcript = h('textarea', { id: 'cv-input', class: 'input chat-input', rows: 2, lang: L, maxlength: 2000, placeholder: t('conv.typePlaceholder'),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTyped(); } } });
  const micBtn = h('button', { class: 'btn btn-primary mic-btn', type: 'button', 'aria-pressed': 'false', onclick: () => toggleMic() });
  const sendBtn = h('button', { class: 'btn', type: 'button', onclick: () => sendTyped() }, icon('send', 18), ' ', t('writing.send'));
  const stopBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => stopAll() }, icon('stop', 18), ' ', t('conv.stop'));
  const startBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startConversation() }, t('conv.start'));
  const convBar = h('div', { class: 'conv-bar' });

  const setState = (s) => {
    state = s;
    const busy = s !== 'idle';
    micBtn.setAttribute('aria-pressed', String(s === 'listening'));
    micBtn.classList.toggle('is-listening', s === 'listening');
    micBtn.replaceChildren(icon('speak', 22), ' ', t(s === 'listening' ? 'conv.micStop' : 'conv.micStart'));
    micBtn.disabled = !support.recognition || !ctx.ai.isConfigured() || s === 'thinking';
    sendBtn.disabled = s === 'thinking' || !ctx.ai.isConfigured();
    transcript.disabled = !ctx.ai.isConfigured();
    stopBtn.hidden = !busy;
    statusEl.textContent = t(`conv.state.${s}`);
  };

  /* ---------- rendu ---------- */
  function draw() {
    const nodes = [];
    if (!conv || conv.messages.length === 0) nodes.push(h('p', { class: 'muted empty' }, ctx.ai.isConfigured() ? t('conv.empty') : t('conv.emptyNoAi')));
    for (const m of conv?.messages ?? []) {
      if (m.role === 'user') nodes.push(h('article', { class: 'msg msg-user', 'aria-label': t('writing.yourMsg') }, h('p', { lang: L }, m.content)));
      else nodes.push(aiMsg(m.content, m.provider ? { provider: m.provider, model: m.model } : null));
    }
    if (state === 'thinking' || (streamText && state === 'speaking')) {
      nodes.push(streamText ? aiMsg(streamText, null, true) : h('article', { class: 'msg msg-ai' }, spinner(t('writing.thinking'))));
    }
    if (streamErr) {
      nodes.push(banner('error', h('p', {}, streamErr.message),
        h('div', { class: 'btn-row' },
          conv?.messages.at(-1)?.role === 'user' && streamErr.kind !== 'config' ? h('button', { class: 'btn', type: 'button', onclick: () => generate() }, icon('refresh', 16), ' ', t('writing.retry')) : null,
          ['config', 'auth', 'validation'].includes(streamErr.kind) ? h('a', { class: 'btn', href: '#/settings' }, t('writing.openSettings')) : null)));
    }
    log.replaceChildren(...nodes);
    log.lastElementChild?.scrollIntoView?.({ block: 'end' });
    startBtn.hidden = !!(conv && conv.messages.length) || !ctx.ai.isConfigured();
  }
  const scheduleDraw = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); }); };

  function aiMsg(content, meta, streaming = false) {
    const { spoken, tip } = splitTip(content);
    const card = h('article', { class: 'msg msg-ai', 'aria-label': t('writing.aiMsg') });
    if (opts.showText) card.append(h('p', { lang: L }, spoken));
    else card.append(h('details', {}, h('summary', {}, t('conv.showText')), h('p', { lang: L }, spoken)));
    if (tip && !streaming) card.append(h('p', { class: 'tip' }, h('strong', {}, t('conv.tip')), ' ', tip));
    if (meta) card.append(h('p', { class: 'meta' }, t('writing.generatedBy', { p: ctx.ai.providerLabel(meta.provider), m: meta.model })));
    return card;
  }

  function drawConvBar() {
    const sel = h('select', { class: 'input', 'aria-label': t('writing.convSelect'), onchange: (e) => {
      stopAll(); conv = convs.find((c) => c.id === e.target.value) ?? null; streamErr = null; draw();
    } }, convs.length ? convs.map((c) => h('option', { value: c.id, selected: c.id === conv?.id }, `${c.title || t('writing.untitled')} · ${formatDateTime(c.updatedAt, prefs.uiLang)}`)) : [h('option', { value: '' }, t('writing.noConv'))]);
    convBar.replaceChildren(sel,
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => { stopAll(); conv = null; streamErr = null; draw(); drawConvBar(); } }, icon('chat', 16), ' ', t('conv.new')),
      h('button', { class: 'btn btn-small btn-danger', type: 'button', disabled: !conv, onclick: deleteConv }, icon('trash', 16), ' ', t('writing.deleteConv')));
  }

  async function deleteConv() {
    if (!conv) return;
    if (!(await confirmDialog({ title: t('writing.deleteTitle'), message: t('writing.deleteMsg'), confirmLabel: t('common.delete'), danger: true }))) return;
    stopAll();
    await store.delete('conversations', conv.id);
    convs = convs.filter((c) => c.id !== conv.id);
    conv = convs[0] ?? null;
    draw(); drawConvBar();
  }

  async function save() {
    conv.updatedAt = Date.now();
    await store.put('conversations', conv);
    if (!convs.some((c) => c.id === conv.id)) convs.unshift(conv);
    convs.sort((a, b) => b.updatedAt - a.updatedAt);
    drawConvBar();
  }

  /* ---------- reconnaissance vocale ---------- */
  function toggleMic() {
    if (state === 'listening') { recognizer?.stop(); return; }
    startListening();
  }

  function startListening() {
    if (!support.recognition || destroyed || !ctx.ai.isConfigured()) return;
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
        if (destroyed) return;
        setState('idle');
        const text = (got || transcript.value).trim();
        if (text && !failed && opts.autoSend) { transcript.value = ''; submit(text); }
        else if (text) transcript.focus();
        else if (!failed && opts.handsFree && ctx.ai.isConfigured()) toast(t('conv.noSpeech'), { kind: 'info' });
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

  async function ensureConv() {
    if (conv) return;
    const p = ctx.prefs();
    conv = { id: uid(), kind: 'voice', title: '', createdAt: Date.now(), updatedAt: Date.now(), topic: p.topic, level: p.level, accent: p.accent, profile: p.profile, messages: [] };
  }

  async function startConversation() {
    if (!ctx.ai.isConfigured() || state === 'thinking') return;
    await ensureConv();
    await generate();
  }

  async function submit(text) {
    if (!ctx.ai.isConfigured()) { streamErr = { kind: 'config', message: t('writing.needAi') }; draw(); return; }
    if (state === 'thinking') return;
    queue?.cancel();
    await ensureConv();
    if (!conv.title) conv.title = text.slice(0, 50);
    conv.messages.push({ id: uid(), role: 'user', content: text, ts: Date.now() });
    await save();
    await generate();
  }

  async function generate() {
    if (state === 'thinking') return;
    streamText = ''; streamErr = null;
    setState('thinking');
    draw();
    controller = new AbortController();
    const p = ctx.prefs();
    const pick = support.synthesis ? await ctx.voicePick() : { voice: null };
    if (!pick.voice && support.synthesis) toast(t('speech.noVoice'), { kind: 'warn' });
    queue = createSpeechQueue({ voice: pick.voice, lang: getAccent(p).code, rate: p.speechRate, onStart: () => { if (state === 'thinking' || state === 'idle') setState('speaking'); } });
    let streamer = createSentenceStreamer((s) => { if (pick.voice) queue.enqueue(s); });
    let ok = false;
    try {
      const r = await ctx.askAI(
        { system: conversationSystemPrompt(p), messages: buildHistory(conv.messages), maxTokens: 400 },
        { signal: controller.signal,
          onToken: (tok) => { streamText += tok; streamer.push(tok); scheduleDraw(); },
          onReset: () => { streamText = ''; queue.cancel(); streamer = createSentenceStreamer((s) => { if (pick.voice) queue.enqueue(s); }); } });
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
      if (!destroyed) { if (!queue.speaking()) setState('idle'); draw(); }
    }
    if (ok && !destroyed) {
      await queue.whenIdle();
      if (destroyed) return;
      setState('idle');
      if (opts.handsFree && support.recognition && ctx.ai.isConfigured()) startListening();
    }
  }

  function stopAll() {
    controller?.abort();
    queue?.cancel();
    recognizer?.abort?.();
    recognizer = null;
    if (!destroyed && state !== 'thinking') setState('idle');
  }

  /* ---------- page ---------- */
  const optCheckbox = (id, key, label, onChange) => h('div', { class: 'choice' },
    h('input', { type: 'checkbox', id, checked: opts[key], onchange: (e) => { opts[key] = e.target.checked; saveOpts(opts); onChange?.(); } }),
    h('label', { for: id }, label));

  const accent = getAccent(prefs);
  root.replaceChildren(...[
    h('h1', {}, t('conv.title')),
    h('p', { class: 'chips' }, h('span', { class: 'chip' }, accent.label), h('span', { class: 'chip' }, `${t('common.level')} ${prefs.level}`), h('a', { class: 'chip', href: '#/settings' }, t('common.change'))),
    !ctx.ai.isConfigured() ? banner('info', t('writing.noAi'), ' ', h('a', { href: '#/settings' }, t('home.noAiLink'))) : null,
    !support.recognition ? banner('warn', t('conv.noRecognition')) : banner('info', t('conv.privacy', { lang: getLanguage(prefs).label })),
    !support.synthesis ? banner('warn', t('conv.noSynthesis')) : null,
    convBar, log, statusEl,
    h('div', { class: 'composer' },
      h('div', { class: 'btn-row' }, micBtn, startBtn, stopBtn),
      h('label', { for: 'cv-input', class: 'sr-only' }, t('conv.typeLabel')), transcript,
      h('div', { class: 'btn-row' }, sendBtn, h('span', { class: 'hint' }, t('conv.hint')))),
    h('fieldset', { class: 'card conv-opts' }, h('legend', {}, t('conv.options')),
      optCheckbox('cv-auto', 'autoSend', t('conv.optAutoSend')),
      optCheckbox('cv-hands', 'handsFree', t('conv.optHandsFree')),
      optCheckbox('cv-text', 'showText', t('conv.optShowText'), draw))].filter(Boolean));
  setState('idle'); drawConvBar(); draw();

  return { destroy() { destroyed = true; controller?.abort(); queue?.cancel(); recognizer?.abort?.(); cancelAnimationFrame(rafId); } };
}
