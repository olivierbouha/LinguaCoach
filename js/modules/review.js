/**
 * modules/review.js — Révision : cartes (répétition espacée) et quiz, pour toutes les cartes ou une liste.
 * Fonctionne entièrement hors ligne et sans IA. Un quiz met aussi à jour le calendrier des cartes (juste → « Bien », faux → « À revoir »).
 */
import { h } from '../utils.js';
import { select } from '../ui.js';
import { getLanguage } from '../config.js';
import { dueCards, gradeCard, GRADES } from '../progress.js';
import { ALL, NONE, cardsOfList, planAddToList, buildQuiz, checkTyped } from '../lists-utils.js';

const LS_KEY = 'lc.review.list';
const readLS = () => { try { return localStorage.getItem(LS_KEY) ?? ALL; } catch { return ALL; } };
const writeLS = (v) => { try { localStorage.setItem(LS_KEY, v); } catch { /* facultatif */ } };

export async function render(root, ctx) {
  const { t, store } = ctx;
  const L = ctx.prefs().language; // langue apprise (attribut lang des textes affichés)
  let cards = [];
  let lists = [];
  let queue = [];
  let revealed = false;
  let mode = 'cards'; // cards | quiz
  let listId = ALL;
  let quiz = null; // { settings } | { run }
  const qs = { mode: 'choice', direction: 'fwd', size: 10 };

  const urlList = location.hash.replace(/^#\/?/, '').split('/')[1];

  const inScope = () => cardsOfList(cards, lists, listId);

  const load = async () => {
    const [v, e, l] = await Promise.all([store.all('vocab'), store.all('errors'), store.all('lists')]);
    lists = l.sort((a, b) => a.name.localeCompare(b.name));
    cards = [...v.map((c) => ({ ...c, _col: 'vocab' })), ...e.map((c) => ({ ...c, _col: 'errors' }))];
    if (![ALL, NONE, ...lists.map((x) => x.id)].includes(listId)) listId = ALL;
    queue = dueCards(inScope());
  };

  async function grade(card, g) {
    const { _col, ...rest } = card;
    await store.put(_col, gradeCard(rest, g));
    revealed = false;
    await load();
    draw();
  }

  async function addManual(e) {
    e.preventDefault();
    const f = e.target;
    const front = f.front.value.trim(), back = f.back.value.trim();
    if (!front || !back) return;
    const target = lists.some((l) => l.id === listId) ? listId : '';
    const plan = planAddToList(cards.filter((c) => c._col === 'vocab').map(({ _col, ...c }) => c), [{ front, back }], target, { source: 'manual' });
    if (plan.toPut.length) await store.bulkPut('vocab', plan.toPut);
    f.reset();
    ctx.toast(plan.already ? t('lists.alreadyIn') : t('review.added'), { kind: plan.already ? 'info' : 'success' });
    await load();
    draw();
  }

  /* ---------- Quiz ---------- */
  function startQuiz() {
    const pool = inScope().filter((c) => c._col === 'vocab');
    const built = buildQuiz(pool, { mode: qs.mode, direction: qs.direction, size: qs.size });
    if (!built.items.length) { quiz = { empty: true }; return draw(); }
    quiz = { run: { ...built, i: 0, correct: 0, checked: false, ok: false, picked: '', typed: '', done: false, fellBack: qs.mode === 'choice' && built.mode === 'type' } };
    draw();
  }

  function answerQuiz(value) {
    const r = quiz.run;
    const it = r.items[r.i];
    r.ok = r.mode === 'choice' ? value === it.answer : checkTyped(it.answer, value, { ignoreArticle: r.direction === 'rev' });
    r.picked = value; r.checked = true;
    if (r.ok) r.correct++;
    draw();
  }

  async function nextQuiz(forceOk) {
    const r = quiz.run;
    const it = r.items[r.i];
    if (forceOk && !r.ok) { r.ok = true; r.correct++; }
    const { _col, ...rest } = it.card;
    await store.put(_col, gradeCard(rest, r.ok ? GRADES.good : GRADES.again));
    r.i++; r.checked = false; r.picked = ''; r.typed = '';
    if (r.i >= r.items.length) {
      r.done = true;
      await ctx.logActivity({ skill: 'writing', type: 'quiz', score: { correct: r.correct, total: r.items.length } });
      await load();
    }
    draw();
  }

  function quizView() {
    if (!quiz) {
      const pool = inScope().filter((c) => c._col === 'vocab');
      return h('section', { class: 'card' }, h('h2', {}, t('quiz.title')), h('p', { class: 'muted' }, t('quiz.hint', { n: pool.length })),
        h('div', { class: 'field' }, h('label', { for: 'qz-dir' }, t('quiz.direction')), select([['fwd', t('quiz.fwd', { lang: getLanguage(ctx.prefs()).label.toLowerCase() })], ['rev', t('quiz.rev')]], qs.direction, (v) => { qs.direction = v; }, { id: 'qz-dir' })),
        h('div', { class: 'field' }, h('label', { for: 'qz-mode' }, t('quiz.mode')), select([['choice', t('quiz.choice')], ['type', t('quiz.type')]], qs.mode, (v) => { qs.mode = v; }, { id: 'qz-mode' })),
        h('div', { class: 'field' }, h('label', { for: 'qz-size' }, t('quiz.size')), select([[10, '10'], [20, '20'], [50, '50']], qs.size, (v) => { qs.size = Number(v); }, { id: 'qz-size' })),
        h('button', { class: 'btn btn-primary', type: 'button', disabled: pool.length === 0, onclick: () => startQuiz() }, t('quiz.start')),
        pool.length === 0 ? h('p', { class: 'muted' }, t('quiz.noCards')) : null);
    }
    if (quiz.empty) return h('section', { class: 'card' }, h('p', {}, t('quiz.noCards')), h('button', { class: 'btn', type: 'button', onclick: () => { quiz = null; draw(); } }, t('quiz.back')));
    const r = quiz.run;
    if (r.done) {
      return h('section', { class: 'card' }, h('h2', {}, t('study.finished')), h('p', {}, t('study.score', { c: r.correct, n: r.items.length })),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { quiz = null; draw(); } }, t('study.again')));
    }
    const it = r.items[r.i];
    const promptLang = r.direction === 'fwd' ? L : undefined;
    const answerLang = r.direction === 'fwd' ? undefined : L;
    return h('section', { class: 'card', 'aria-live': 'polite' },
      h('p', { class: 'muted' }, t('study.progress', { i: r.i + 1, n: r.items.length }), r.fellBack ? ` · ${t('quiz.fellBack')}` : ''),
      h('p', { class: 'big-text', lang: promptLang }, it.prompt),
      r.mode === 'choice'
        ? h('div', { class: 'choices', role: 'group', 'aria-label': t('quiz.answers') }, it.options.map((o) => h('button', {
          class: `btn choice-btn ${r.checked ? (o === it.answer ? 'is-right' : o === r.picked ? 'is-wrong' : '') : ''}`, type: 'button', lang: answerLang, disabled: r.checked, onclick: () => answerQuiz(o),
        }, o)))
        : h('div', {}, h('label', { for: 'qz-input' }, t('quiz.yourAnswer')),
          h('input', { id: 'qz-input', class: 'input', lang: answerLang, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', disabled: r.checked, value: r.picked,
            onkeydown: (e) => { if (e.key === 'Enter' && !r.checked) { e.preventDefault(); answerQuiz(e.target.value); } } }),
          !r.checked ? h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => answerQuiz(document.getElementById('qz-input').value) }, t('study.check'))) : null),
      r.checked ? [h('p', { class: r.ok ? 'ok-text' : 'err-text', role: 'status' }, r.ok ? t('study.correct') : `${t('study.expected')} ${it.answer}`),
        h('div', { class: 'btn-row' }, !r.ok && r.mode === 'type' ? h('button', { class: 'btn', type: 'button', onclick: () => nextQuiz(true) }, t('study.alsoCorrect')) : null,
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => nextQuiz(false) }, t('study.next')))] : null);
  }

  /* ---------- Écran ---------- */
  function draw() {
    const card = queue[0];
    const scoped = inScope();
    const block = card
      ? h('section', { class: 'card review-card', 'aria-live': 'polite' },
        h('p', { class: 'muted' }, t('review.remaining', { n: queue.length }), ' · ', card._col === 'errors' ? t('review.kindError') : t('review.kindVocab')),
        h('p', { class: 'big-text', lang: L }, card.front),
        revealed
          ? [h('p', { class: 'answer' }, card.back),
            h('div', { class: 'btn-row' },
              [['again', 'review.again'], ['hard', 'review.hard'], ['good', 'review.good'], ['easy', 'review.easy']].map(([k, key]) =>
                h('button', { class: `btn ${k === 'good' ? 'btn-primary' : ''}`, type: 'button', onclick: () => grade(card, GRADES[k]) }, t(key))))]
          : h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { revealed = true; draw(); } }, t('review.reveal')))
      : h('section', { class: 'card' }, h('p', {}, scoped.length ? t('review.allDone') : t('review.empty')));

    const list = h('section', {},
      h('h2', {}, t('review.all', { n: scoped.length })),
      scoped.length === 0 ? h('p', { class: 'muted' }, t('review.emptyHint'))
        : h('ul', { class: 'list' }, [...scoped].sort((a, b) => a.due - b.due).map((c) => h('li', { class: 'list-item' },
          h('span', {}, h('strong', { lang: L }, c.front), ' — ', c.back),
          h('button', { class: 'btn btn-small', type: 'button', 'aria-label': t('review.deleteAria', { w: c.front }), onclick: async () => { await store.delete(c._col, c.id); await load(); draw(); } }, t('common.delete'))))));

    const form = h('form', { class: 'card', onsubmit: addManual },
      h('h2', {}, t('review.addTitle')),
      h('div', { class: 'field' }, h('label', { for: 'rv-front' }, t('review.front', { lang: getLanguage(ctx.prefs()).label.toLowerCase() })), h('input', { id: 'rv-front', name: 'front', class: 'input', lang: L, required: true, maxlength: 200 })),
      h('div', { class: 'field' }, h('label', { for: 'rv-back' }, t('review.back')), h('input', { id: 'rv-back', name: 'back', class: 'input', required: true, maxlength: 400 })),
      lists.some((l) => l.id === listId) ? h('p', { class: 'hint' }, t('review.addToList', { name: lists.find((l) => l.id === listId).name })) : null,
      h('button', { class: 'btn', type: 'submit' }, t('common.add')));

    const scopeSel = h('div', { class: 'field' }, h('label', { for: 'rv-list' }, t('review.scope')),
      select([[ALL, t('lists.all')], [NONE, t('lists.none')], ...lists.map((l) => [l.id, l.name])], listId, (v) => { listId = v; writeLS(v); quiz = null; revealed = false; queue = dueCards(inScope()); draw(); }, { id: 'rv-list' }));

    const tabs = h('div', { class: 'btn-row tabs', role: 'group', 'aria-label': t('review.modes') },
      ['cards', 'quiz'].map((m) => h('button', { class: `btn ${mode === m ? 'btn-primary' : ''}`, type: 'button', 'aria-pressed': String(mode === m), onclick: () => { mode = m; quiz = null; draw(); } }, t(`review.mode.${m}`))));

    root.replaceChildren(h('h1', {}, t('review.title')),
      h('p', { class: 'btn-row' }, h('a', { href: '#/lists' }, t('review.manageLists')), h('span', { 'aria-hidden': 'true' }, ' · '), h('a', { href: '#/study' }, t('home.studyOpen'))),
      scopeSel, tabs,
      mode === 'quiz' ? quizView() : block,
      mode === 'quiz' ? null : form, mode === 'quiz' ? null : list);
    if (mode === 'quiz') document.getElementById('qz-input')?.focus();
  }

  listId = urlList && urlList !== '' ? urlList : readLS();
  await load();
  draw();
  return {};
}
