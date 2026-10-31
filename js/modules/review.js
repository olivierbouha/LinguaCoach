/**
 * modules/review.js — Révision : cartes de vocabulaire et d'erreurs fréquentes en répétition espacée.
 * Fonctionne entièrement hors ligne et sans IA.
 */
import { h } from '../utils.js';
import { getLanguage } from '../config.js';
import { dueCards, gradeCard, newCard, GRADES } from '../progress.js';

export async function render(root, ctx) {
  const { t, store } = ctx;
  const L = ctx.prefs().language; // langue apprise (attribut lang des textes affichés)
  let cards = [];
  let queue = [];
  let revealed = false;

  const load = async () => {
    const [v, e] = await Promise.all([store.all('vocab'), store.all('errors')]);
    cards = [...v.map((c) => ({ ...c, _col: 'vocab' })), ...e.map((c) => ({ ...c, _col: 'errors' }))];
    queue = dueCards(cards);
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
    await store.put('vocab', newCard({ kind: 'vocab', front, back, source: 'manual' }));
    f.reset();
    ctx.toast(t('review.added'), { kind: 'success' });
    await load();
    draw();
  }

  function draw() {
    const card = queue[0];
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
      : h('section', { class: 'card' }, h('p', {}, cards.length ? t('review.allDone') : t('review.empty')));

    const list = h('section', {},
      h('h2', {}, t('review.all', { n: cards.length })),
      cards.length === 0 ? h('p', { class: 'muted' }, t('review.emptyHint'))
        : h('ul', { class: 'list' }, [...cards].sort((a, b) => a.due - b.due).map((c) => h('li', { class: 'list-item' },
          h('span', {}, h('strong', { lang: L }, c.front), ' — ', c.back),
          h('button', { class: 'btn btn-small', type: 'button', 'aria-label': t('review.deleteAria', { w: c.front }), onclick: async () => { await store.delete(c._col, c.id); await load(); draw(); } }, t('common.delete'))))));

    const form = h('form', { class: 'card', onsubmit: addManual },
      h('h2', {}, t('review.addTitle')),
      h('div', { class: 'field' }, h('label', { for: 'rv-front' }, t('review.front', { lang: getLanguage(ctx.prefs()).label.toLowerCase() })), h('input', { id: 'rv-front', name: 'front', class: 'input', lang: L, required: true, maxlength: 200 })),
      h('div', { class: 'field' }, h('label', { for: 'rv-back' }, t('review.back')), h('input', { id: 'rv-back', name: 'back', class: 'input', required: true, maxlength: 400 })),
      h('button', { class: 'btn', type: 'submit' }, t('common.add')));

    root.replaceChildren(h('h1', {}, t('review.title')), block, form, list);
  }

  await load();
  draw();
  return {};
}
