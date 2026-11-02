/**
 * modules/study.js — Étudier : vocabulaire généré par l'IA, devoirs de traduction (correction locale), verbes irréguliers.
 *
 *  - Vocabulaire : l'IA propose une liste (JSON validé) que l'on coche puis ajoute à Révision. Texte envoyé au fournisseur après consentement.
 *  - Traduction : à partir de ses cartes de Révision (hors ligne) ou de phrases générées par l'IA. La correction est locale :
 *    une traduction correcte mais différente peut être marquée « juste » par l'utilisateur (pas de faux négatif imposé).
 *  - Verbes irréguliers : liste fixe rédigée à la main (content/verbs.js), vérification locale hors ligne.
 */
import { h, shuffle } from '../utils.js';
import { banner, spinner, toast, icon } from '../ui.js';
import { getLanguage } from '../config.js';
import { vocabGenSystemPrompt, normalizeVocabList, translationGenSystemPrompt, normalizeTranslationItems, extractJson } from '../ai/prompts.js';
import { getVerbs, checkForm } from '../content/verbs.js';
import { normalizeWords } from '../text-compare.js';
import { newCard, gradeCard, GRADES } from '../progress.js';

const SESSION_SIZE = 10;
const TABS = ['vocab', 'translate', 'verbs'];

export async function render(root, ctx) {
  const { t, store } = ctx;
  const L = ctx.prefs().language;
  let tab = 'vocab';
  const pane = h('div', {});
  let destroyed = false;

  const tabBar = () => h('div', { class: 'btn-row tabs', role: 'group', 'aria-label': t('study.tabs') },
    TABS.map((k) => h('button', { class: `btn ${tab === k ? 'btn-primary' : ''}`, type: 'button', 'aria-pressed': String(tab === k), onclick: () => { tab = k; draw(); } }, t(`study.tab.${k}`))));

  function draw() {
    const holder = h('div', {});
    pane.replaceChildren(tabBar(), holder);
    ({ vocab: vocabTab, translate: translateTab, verbs: verbsTab })[tab](holder);
  }

  /* ================= Vocabulaire (IA) ================= */
  function vocabTab(box) {
    let items = [];
    let busy = false;
    let err = null;
    const theme = h('input', { id: 'st-theme', class: 'input', maxlength: 120, placeholder: t('study.themePh') });
    const count = h('select', { id: 'st-count', class: 'input' }, [10, 15, 20].map((n) => h('option', { value: n, selected: n === 15 }, String(n))));
    const out = h('div', {});

    async function generate() {
      if (busy) return;
      busy = true; err = null; drawOut();
      try {
        const have = (await store.all('vocab')).map((c) => c.front);
        const r = await ctx.askAI({ system: vocabGenSystemPrompt(ctx.prefs(), { count: Number(count.value), theme: theme.value.trim(), exclude: have }), messages: [{ role: 'user', content: 'Generate the list now.' }], maxTokens: 1800 }, {});
        const list = normalizeVocabList(extractJson(r.text));
        if (!list.length) throw Object.assign(new Error(t('study.badList')), { kind: 'invalid_response' });
        const haveSet = new Set(have.map((x) => x.toLowerCase()));
        items = list.filter((x) => !haveSet.has(x.word.toLowerCase())).map((x) => ({ ...x, on: true }));
        if (!items.length) err = t('study.allKnown');
      } catch (e) { err = e.message; items = []; }
      busy = false;
      if (!destroyed) drawOut();
    }

    async function addSelected() {
      const chosen = items.filter((x) => x.on);
      for (const it of chosen) await store.put('vocab', newCard({ kind: 'vocab', front: it.word, back: it.example ? `${it.translation} — ${it.example}` : it.translation, source: 'ai-vocab' }));
      items = items.filter((x) => !x.on);
      toast(t('study.added', { n: chosen.length }), { kind: 'success' });
      drawOut();
    }

    function drawOut() {
      out.replaceChildren(...[
        busy ? spinner(t('study.generating')) : null,
        err ? banner('error', err) : null,
        items.length ? h('section', { class: 'card' }, h('h2', {}, t('study.proposed', { n: items.length })),
          h('ul', { class: 'list' }, items.map((it, i) => h('li', { class: 'list-item' },
            h('span', { class: 'choice' },
              h('input', { type: 'checkbox', id: `vw-${i}`, checked: it.on, onchange: (e) => { it.on = e.target.checked; } }),
              h('label', { for: `vw-${i}` }, h('strong', { lang: L }, it.word), ' — ', it.translation, it.example ? h('span', { class: 'muted block', lang: L }, it.example) : null))))),
          h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => addSelected() }, t('study.addSelected'))),
          h('p', { class: 'meta' }, t('study.aiDisclaimer'))) : null,
      ].filter(Boolean));
    }

    box.append(
      !ctx.ai.isConfigured() ? banner('info', t('study.needAi'), ' ', h('a', { href: '#/settings' }, t('home.noAiLink'))) : null,
      h('section', { class: 'card' }, h('h2', {}, t('study.vocabTitle')), h('p', { class: 'muted' }, t('study.vocabHint')),
        h('div', { class: 'field' }, h('label', { for: 'st-theme' }, t('study.theme')), theme),
        h('div', { class: 'field' }, h('label', { for: 'st-count' }, t('study.count')), count),
        h('button', { class: 'btn btn-primary', type: 'button', disabled: !ctx.ai.isConfigured(), onclick: () => generate() }, t('study.generate'))),
      out);
    drawOut();
  }

  /* ================= Traduction ================= */
  function translateTab(box) {
    let source = 'cards';
    let session = null; // { items, i, correct, checked, ok, typed }
    let busy = false;
    let err = null;
    const area = h('div', {});

    async function start() {
      err = null;
      let items = [];
      if (source === 'cards') {
        const cards = (await store.all('vocab')).filter((c) => c.back);
        items = shuffle(cards).slice(0, SESSION_SIZE).map((c) => ({ prompt: c.back.split(' — ')[0], answer: c.front, card: c }));
        if (!items.length) { err = t('study.noCards'); return draw(); }
      } else {
        if (!ctx.ai.isConfigured()) { err = t('study.needAi'); return draw(); }
        busy = true; draw();
        try {
          const r = await ctx.askAI({ system: translationGenSystemPrompt(ctx.prefs(), { count: 8 }), messages: [{ role: 'user', content: 'Generate the sentences now.' }], maxTokens: 1200 }, {});
          const list = normalizeTranslationItems(extractJson(r.text));
          if (!list.length) throw Object.assign(new Error(t('study.badList')), { kind: 'invalid_response' });
          items = list.map((x) => ({ prompt: x.source, answer: x.target }));
        } catch (e) { err = e.message; }
        busy = false;
        if (!items.length) return draw();
      }
      session = { items, i: 0, correct: 0, checked: false, ok: false, typed: '' };
      draw();
    }

    function check(typed) {
      const it = session.items[session.i];
      const a = normalizeWords(it.answer).join(' ');
      const alts = it.answer.split(/\s*\/\s*/).map((x) => normalizeWords(x).join(' '));
      session.typed = typed;
      session.ok = normalizeWords(typed).join(' ') === a || alts.includes(normalizeWords(typed).join(' '));
      session.checked = true;
      draw();
    }

    async function next(markCorrect) {
      const it = session.items[session.i];
      const good = markCorrect ?? session.ok;
      if (good) session.correct++;
      if (it.card) await store.put('vocab', gradeCard(it.card, good ? GRADES.good : GRADES.again));
      session.i++; session.checked = false; session.typed = '';
      if (session.i >= session.items.length) {
        await ctx.logActivity({ skill: 'writing', type: 'translation', score: { correct: session.correct, total: session.items.length } });
        session.done = true;
      }
      draw();
    }

    function draw() {
      const nodes = [];
      if (err) nodes.push(banner('error', err));
      if (busy) nodes.push(spinner(t('study.generating')));
      if (!session && !busy) {
        nodes.push(h('section', { class: 'card' }, h('h2', {}, t('study.translateTitle')), h('p', { class: 'muted' }, t('study.translateHint')),
          h('fieldset', {}, h('legend', {}, t('study.source')),
            [['cards', t('study.srcCards')], ['ai', t('study.srcAi')]].map(([k, label]) => h('div', { class: 'choice' },
              h('input', { type: 'radio', name: 'tr-src', id: `tr-${k}`, checked: source === k, onchange: () => { source = k; } }),
              h('label', { for: `tr-${k}` }, label)))),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => start() }, t('study.start'))));
      } else if (session?.done) {
        nodes.push(h('section', { class: 'card' }, h('h2', {}, t('study.finished')), h('p', {}, t('study.score', { c: session.correct, n: session.items.length })),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { session = null; draw(); } }, t('study.again'))));
      } else if (session) {
        const it = session.items[session.i];
        const input = h('input', { id: 'tr-input', class: 'input', lang: L, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', disabled: session.checked, value: session.typed,
          onkeydown: (e) => { if (e.key === 'Enter' && !session.checked) { e.preventDefault(); check(e.target.value); } } });
        nodes.push(h('section', { class: 'card', 'aria-live': 'polite' },
          h('p', { class: 'muted' }, t('study.progress', { i: session.i + 1, n: session.items.length })),
          h('p', { class: 'big-text' }, it.prompt),
          h('label', { for: 'tr-input' }, t('study.yourTranslation', { lang: getLanguage(ctx.prefs()).label.toLowerCase() })), input,
          !session.checked
            ? h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => check(input.value) }, t('study.check')))
            : [h('p', { class: session.ok ? 'ok-text' : 'err-text', role: 'status' }, session.ok ? t('study.correct') : t('study.notExact')),
              h('p', {}, t('study.expected'), ' ', h('strong', { lang: L }, it.answer)),
              h('div', { class: 'btn-row' },
                !session.ok ? h('button', { class: 'btn', type: 'button', onclick: () => next(true) }, t('study.alsoCorrect')) : null,
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => next() }, t('study.next')))]));
      }
      area.replaceChildren(...nodes);
      area.querySelector('#tr-input:not([disabled])')?.focus();
    }
    box.append(area);
    draw();
  }

  /* ================= Verbes irréguliers ================= */
  function verbsTab(box) {
    const data = getVerbs(ctx.prefs().language);
    if (!data) { box.append(banner('info', t('study.noVerbs'))); return; }
    let mode = 'train'; // train | table
    let session = null;
    const area = h('div', {});
    const forms = data.columns.length - 1; // formes à saisir (hors infinitif)

    function startTraining() {
      session = { items: shuffle(data.verbs).slice(0, SESSION_SIZE), i: 0, correct: 0, checked: false, results: [], done: false };
      draw();
    }

    function checkAll() {
      const it = session.items[session.i];
      const typed = [...area.querySelectorAll('input.verb-in')].map((i) => i.value);
      session.results = typed.map((v, k) => checkForm(it.forms[k + 1], v));
      session.typed = typed;
      session.checked = true;
      if (session.results.every(Boolean)) session.correct++;
      draw();
    }

    async function next() {
      session.i++; session.checked = false;
      if (session.i >= session.items.length) {
        session.done = true;
        await ctx.logActivity({ skill: 'writing', type: 'verbs', score: { correct: session.correct, total: session.items.length } });
      }
      draw();
    }

    function draw() {
      const nodes = [h('div', { class: 'btn-row' },
        h('button', { class: `btn ${mode === 'train' ? 'btn-primary' : ''}`, type: 'button', 'aria-pressed': String(mode === 'train'), onclick: () => { mode = 'train'; draw(); } }, t('study.train')),
        h('button', { class: `btn ${mode === 'table' ? 'btn-primary' : ''}`, type: 'button', 'aria-pressed': String(mode === 'table'), onclick: () => { mode = 'table'; draw(); } }, t('study.table')))];
      if (mode === 'table') {
        nodes.push(h('div', { class: 'table-wrap' }, h('table', { class: 'verb-table' },
          h('caption', {}, t('study.tableCaption', { n: data.verbs.length })),
          h('thead', {}, h('tr', {}, ...data.columns.map((c) => h('th', { scope: 'col' }, c)), h('th', { scope: 'col' }, t('study.meaning')))),
          h('tbody', {}, data.verbs.map((v) => h('tr', {}, ...v.forms.map((f) => h('td', { lang: L }, f)), h('td', {}, v.fr + (v.aux ? ` (${v.aux})` : ''))))))),
          h('p', { class: 'meta' }, t('study.verbsDisclaimer')));
      } else if (!session) {
        nodes.push(h('section', { class: 'card' }, h('h2', {}, t('study.verbsTitle')), h('p', { class: 'muted' }, t('study.verbsHint', { n: data.verbs.length })),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startTraining() }, t('study.start')), h('p', { class: 'meta' }, t('study.verbsDisclaimer'))));
      } else if (session.done) {
        nodes.push(h('section', { class: 'card' }, h('h2', {}, t('study.finished')), h('p', {}, t('study.score', { c: session.correct, n: session.items.length })),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { session = null; draw(); } }, t('study.again'))));
      } else {
        const it = session.items[session.i];
        nodes.push(h('section', { class: 'card', 'aria-live': 'polite' },
          h('p', { class: 'muted' }, t('study.progress', { i: session.i + 1, n: session.items.length })),
          h('p', { class: 'big-text', lang: L }, it.forms[0], h('span', { class: 'muted' }, ` — ${it.fr}`)),
          ...data.columns.slice(1).map((col, k) => h('div', { class: 'field' },
            h('label', { for: `vf-${k}` }, col),
            h('input', { id: `vf-${k}`, class: 'input verb-in', lang: L, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', disabled: session.checked, value: session.checked ? session.typed[k] : '',
              onkeydown: (e) => { if (e.key === 'Enter' && !session.checked && k === forms - 1) { e.preventDefault(); checkAll(); } } }),
            session.checked ? h('p', { class: session.results[k] ? 'ok-text' : 'err-text' }, session.results[k] ? t('study.correct') : `${t('study.expected')} ${it.forms[k + 1]}`) : null)),
          session.checked && it.aux ? h('p', { class: 'muted' }, t('study.aux', { a: it.aux })) : null,
          !session.checked
            ? h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => checkAll() }, t('study.check')))
            : h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => next() }, t('study.next')))));
      }
      area.replaceChildren(...nodes);
      if (mode === 'train' && session && !session.checked && !session.done) area.querySelector('#vf-0')?.focus();
    }
    box.append(area);
    draw();
  }

  root.replaceChildren(h('h1', {}, t('study.title')), pane);
  draw();
  return { destroy() { destroyed = true; } };
}
