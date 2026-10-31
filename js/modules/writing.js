/**
 * modules/writing.js — Conversation d'écriture avec l'agent IA (streaming, correction structurée).
 *
 * Sans IA configurée : l'écran propose des sujets d'écriture locaux et renvoie vers les réglages.
 * Rien n'est envoyé au fournisseur sans consentement (voir app.js › ensureConsent).
 */
import { h, uid, formatDateTime } from '../utils.js';
import { select, banner, spinner, icon, toast, confirmDialog } from '../ui.js';
import { writingSystemPrompt, parseWritingReply } from '../ai/prompts.js';
import { TOPICS, PROFILES, getAccent, getLanguage } from '../config.js';
import { getLibrary } from '../content/index.js';
import { newCard } from '../progress.js';
import { speakSequence } from '../speech.js';

const HISTORY_LIMIT = 12; // nombre de messages récents transmis comme contexte

export async function render(root, ctx) {
  const { t, store } = ctx;
  const L = ctx.prefs().language;
  const langName = getLanguage(ctx.prefs()).label.toLowerCase(); // langue apprise (attribut lang des textes affichés)
  let prefs = ctx.prefs();
  let convs = (await store.all('conversations')).filter((c) => c.kind !== 'voice').sort((a, b) => b.updatedAt - a.updatedAt);
  let conv = convs[0] ?? null;
  let sending = false;
  let controller = null;
  let streamText = '';
  let streamErr = null;
  let rafId = 0;
  let speaking = null;

  const log = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite', 'aria-label': t('writing.logLabel') });
  const ta = h('textarea', { id: 'w-input', class: 'input chat-input', rows: 3, lang: L, maxlength: 4000, placeholder: t('writing.placeholder', { lang: langName }),
    onkeydown: (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } } });
  const sendBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => send() }, icon('send', 18), ' ', t('writing.send'));
  const stopBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => ctx.ai.cancel() }, icon('stop', 18), ' ', t('writing.stop'));
  const status = h('div', { class: 'chat-status', 'aria-live': 'polite' });
  const convSelect = h('div', { class: 'conv-bar' });
  const holder = h('div', {});

  /* ---------- rendu des messages ---------- */
  async function speak(text, btn) {
    if (speaking) { speaking.cancel(); speaking = null; return; }
    const pick = await ctx.voicePick();
    if (!pick.voice) { toast(t('speech.noVoice'), { kind: 'warn' }); return; }
    const p = ctx.prefs();
    speaking = speakSequence([{ text }], { voice: pick.voice, lang: pick.voice.lang, rate: p.speechRate });
    btn.setAttribute('aria-pressed', 'true');
    speaking.done.then(() => { btn.setAttribute('aria-pressed', 'false'); speaking = null; });
  }

  const listenBtn = (text) => {
    const b = h('button', { class: 'btn btn-small', type: 'button', 'aria-pressed': 'false', 'aria-label': t('writing.listenAria') }, icon('listen', 16), ' ', t('writing.listen'));
    b.addEventListener('click', () => speak(text, b));
    return b;
  };

  async function memoriseError(er) {
    const [wrong, right] = er.change.split(/\s*(?:->|→|=>)\s*/);
    if (!right) return toast(t('writing.cannotMemorise'), { kind: 'warn' });
    await store.put('errors', newCard({ kind: 'error', front: `${t('writing.fixThis')} ${wrong}`, back: `${right}${er.note ? ' — ' + er.note : ''}`, source: conv?.id ?? '' }));
    toast(t('writing.memorised'), { kind: 'success' });
  }
  async function addVocab(v) {
    await store.put('vocab', newCard({ kind: 'vocab', front: v.word, back: v.def || '—', source: conv?.id ?? '' }));
    toast(t('writing.vocabAdded', { w: v.word }), { kind: 'success' });
  }

  function assistantCard(content, { streaming = false, meta } = {}) {
    const p = parseWritingReply(content);
    const card = h('article', { class: 'msg msg-ai', 'aria-label': t('writing.aiMsg') });
    const sec = (title, ...body) => h('section', { class: 'msg-sec' }, h('h3', {}, title), ...body);
    if (!p.structured) {
      card.append(...String(content).split(/\n{2,}/).map((x) => h('p', {}, x)));
    } else {
      if (p.corrected) card.append(sec(t('writing.corrected'), h('p', { lang: L }, p.corrected)));
      if (p.natural) card.append(sec(t('writing.natural'), h('p', { lang: L }, p.natural), listenBtn(p.natural)));
      if (p.explanation.length) card.append(sec(t('writing.explanation'), h('ul', {}, p.explanation.map((x) => h('li', {}, x)))));
      if (p.examples.length) card.append(sec(t('writing.examples'), h('ul', { lang: L }, p.examples.map((x) => h('li', {}, x)))));
      if (p.errors.length && !streaming) card.append(sec(t('writing.errors'), h('ul', { class: 'list' }, p.errors.map((er) => h('li', { class: 'list-item' },
        h('span', {}, h('strong', { lang: L }, er.change), er.category ? ` (${er.category})` : '', er.note ? ` — ${er.note}` : ''),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => memoriseError(er) }, t('writing.memorise')))))));
      if (p.vocab.length && !streaming) card.append(sec(t('writing.vocab'), h('ul', { class: 'list' }, p.vocab.map((v) => h('li', { class: 'list-item' },
        h('span', {}, h('strong', { lang: L }, v.word), v.def ? ` — ${v.def}` : ''),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => addVocab(v) }, t('writing.addVocab')))))));
      if (p.reply) card.append(sec(t('writing.reply'), h('p', { lang: L }, p.reply), listenBtn(p.reply)));
      if (p.followup) card.append(sec(t('writing.followup'), h('p', { lang: L, class: 'followup' }, p.followup)));
    }
    if (streaming) card.append(h('p', { class: 'muted' }, spinner(t('writing.streaming'))));
    if (meta) card.append(h('p', { class: 'meta' }, t('writing.generatedBy', { p: ctx.ai.providerLabel(meta.provider), m: meta.model })));
    return card;
  }

  function draw() {
    prefs = ctx.prefs();
    const nodes = [];
    if (!conv || conv.messages.length === 0) nodes.push(h('p', { class: 'muted empty' }, ctx.ai.isConfigured() ? t('writing.empty') : t('writing.emptyNoAi')));
    for (const m of conv?.messages ?? []) {
      nodes.push(m.role === 'user'
        ? h('article', { class: 'msg msg-user', 'aria-label': t('writing.yourMsg') }, h('p', { lang: L }, m.content))
        : assistantCard(m.content, { meta: m.provider ? { provider: m.provider, model: m.model } : null }));
    }
    if (sending) nodes.push(streamText ? assistantCard(streamText, { streaming: true }) : h('article', { class: 'msg msg-ai' }, spinner(t('writing.thinking'))));
    if (streamErr) {
      const retryable = conv?.messages.at(-1)?.role === 'user';
      nodes.push(banner('error', h('p', {}, streamErr.message),
        streamErr.partialText ? h('details', {}, h('summary', {}, t('writing.partial')), h('p', {}, streamErr.partialText)) : null,
        h('div', { class: 'btn-row' },
          retryable && streamErr.kind !== 'config' ? h('button', { class: 'btn', type: 'button', onclick: () => generate() }, icon('refresh', 16), ' ', t('writing.retry')) : null,
          ['config', 'auth', 'validation'].includes(streamErr.kind) ? h('a', { class: 'btn', href: '#/settings' }, t('writing.openSettings')) : null)));
    }
    log.replaceChildren(...nodes);
    log.lastElementChild?.scrollIntoView?.({ block: 'end' });
    sendBtn.disabled = sending || !ctx.ai.isConfigured();
    stopBtn.hidden = !sending;
    ta.disabled = !ctx.ai.isConfigured();
  }
  const scheduleDraw = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); }); };

  function drawConvBar() {
    const sel = h('select', { class: 'input', 'aria-label': t('writing.convSelect'), onchange: async (e) => {
      conv = convs.find((c) => c.id === e.target.value) ?? null; streamErr = null; draw();
    } }, convs.length ? convs.map((c) => h('option', { value: c.id, selected: c.id === conv?.id }, `${c.title || t('writing.untitled')} · ${formatDateTime(c.updatedAt, prefs.uiLang)}`)) : [h('option', { value: '' }, t('writing.noConv'))]);
    convSelect.replaceChildren(
      sel,
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => { conv = null; streamErr = null; draw(); drawConvBar(); ta.focus(); } }, icon('write', 16), ' ', t('writing.newConv')),
      h('button', { class: 'btn btn-small btn-danger', type: 'button', disabled: !conv, onclick: deleteConv }, icon('trash', 16), ' ', t('writing.deleteConv')));
  }

  async function deleteConv() {
    if (!conv) return;
    if (!(await confirmDialog({ title: t('writing.deleteTitle'), message: t('writing.deleteMsg'), confirmLabel: t('common.delete'), danger: true }))) return;
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

  /* ---------- envoi / génération ---------- */
  async function send() {
    const text = ta.value.trim();
    if (!text || sending) return;
    if (!ctx.ai.isConfigured()) { streamErr = { kind: 'config', message: t('writing.needAi') }; draw(); return; }
    const p = ctx.prefs();
    if (!conv) {
      conv = { id: uid(), title: text.slice(0, 50), createdAt: Date.now(), updatedAt: Date.now(), topic: p.topic, level: p.level, accent: p.accent, profile: p.profile, messages: [] };
    }
    conv.messages.push({ id: uid(), role: 'user', content: text, ts: Date.now() });
    ta.value = '';
    await save();
    await generate();
  }

  async function generate() {
    if (sending) return;
    sending = true; streamText = ''; streamErr = null;
    draw();
    controller = new AbortController();
    const p = ctx.prefs();
    const history = conv.messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
    try {
      const r = await ctx.askAI(
        { system: writingSystemPrompt(p), messages: history, maxTokens: 1800 },
        { signal: controller.signal, onToken: (tok) => { streamText += tok; scheduleDraw(); }, onReset: () => { streamText = ''; } });
      conv.messages.push({ id: uid(), role: 'assistant', content: r.text, ts: Date.now(), provider: r.provider, model: r.model });
      await save();
      await ctx.logActivity({ skill: 'writing', type: 'message' });
    } catch (e) {
      // Annulation (refus de consentement ou bouton Arrêter) : on le dit et on propose de réessayer ; le message reste dans la conversation.
      streamErr = { kind: e.kind, message: e.kind === 'canceled' && !e.partialText ? e.message : e.kind === 'canceled' ? t('writing.canceled') : e.message, partialText: e.partialText };
    } finally {
      sending = false; streamText = '';
      draw();
    }
  }

  /* ---------- structure de la page ---------- */
  function drawHeader() {
    const accent = getAccent(prefs);
    holder.replaceChildren(
      h('p', { class: 'chips' },
        h('span', { class: 'chip' }, accent.label), h('span', { class: 'chip' }, `${t('common.level')} ${prefs.level}`),
        h('span', { class: 'chip' }, PROFILES[prefs.profile].label), h('a', { class: 'chip', href: '#/settings' }, t('common.change'))),
      h('div', { class: 'field' }, h('label', { for: 'w-topic' }, t('common.topic')),
        select(Object.entries(TOPICS).map(([k, v]) => [k, v.label]), prefs.topic, (v) => { ctx.setPrefs({ topic: v }); prefs = ctx.prefs(); drawLocalPrompts(); }, { id: 'w-topic' })));
  }

  const localPrompts = h('section', { class: 'card' });
  function drawLocalPrompts() {
    const lib = getLibrary(prefs);
    const items = lib.writingPrompts[prefs.topic] ?? [];
    localPrompts.replaceChildren(h('h2', {}, t('writing.promptsTitle')), h('p', { class: 'muted' }, t('writing.promptsHint')),
      h('ul', { class: 'list' }, items.map((x) => h('li', { class: 'list-item' }, h('span', { lang: L }, x),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => { ta.value = ''; ta.placeholder = x; ta.focus(); } }, t('writing.usePrompt'))))));
  }

  root.replaceChildren(...[
    h('h1', {}, t('writing.title')),
    !ctx.ai.isConfigured() ? banner('info', t('writing.noAi'), ' ', h('a', { href: '#/settings' }, t('home.noAiLink'))) : null,
    holder, convSelect, log, status,
    h('div', { class: 'composer' },
      h('label', { for: 'w-input', class: 'sr-only' }, t('writing.inputLabel', { lang: langName })), ta,
      h('div', { class: 'btn-row' }, sendBtn, stopBtn, h('span', { class: 'hint' }, t('writing.hint')))),
    localPrompts].filter(Boolean));
  drawHeader(); drawLocalPrompts(); drawConvBar(); draw();

  return { destroy() { controller?.abort(); speaking?.cancel(); cancelAnimationFrame(rafId); } };
}
