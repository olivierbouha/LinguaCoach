/**
 * modules/lists.js — Listes de vocabulaire (façon Quizlet) : créer, renommer, supprimer, modifier les mots,
 * un mot dans plusieurs listes, et import par photos (lecture par l'IA, relecture obligatoire avant ajout).
 * Supprimer une liste ne supprime jamais les cartes. Les photos ne sont pas conservées.
 */
import { h } from '../utils.js';
import { banner, spinner, icon, toast, confirmDialog, formDialog } from '../ui.js';
import { photoVocabSystemPrompt, normalizePhotoVocab, extractJson } from '../ai/prompts.js';
import { fileToJpeg, MAX_PHOTOS } from '../image.js';
import { ALL, NONE, newList, cardListIds, cardsOfList, listCounts, withLists, planAddToList, wordKey } from '../lists-utils.js';

const BATCH = 3; // photos par requête IA

export const composeBack = (it) => [it.translation, it.form ? `vu : ${it.form}` : '', it.example].filter(Boolean).join(' — ');

export async function render(root, ctx) {
  const { t, store } = ctx;
  const L = ctx.prefs().language;
  let lists = [];
  let cards = []; // vocab + errors, avec _col
  let view = 'overview'; // overview | detail | photo
  let currentId = null;
  let editingId = null;
  let destroyed = false;
  // état de l'import photo
  let photos = [];
  let dest = { id: '', newName: '' };
  let scanning = false;
  let scanErr = null;
  let found = null; // [{word, translation, example, form, uncertain, on, known}]
  const holder = h('div', {});

  async function load() {
    const [l, v, e] = await Promise.all([store.all('lists'), store.all('vocab'), store.all('errors')]);
    lists = l.sort((a, b) => a.name.localeCompare(b.name));
    cards = [...v.map((c) => ({ ...c, _col: 'vocab' })), ...e.map((c) => ({ ...c, _col: 'errors' }))];
  }
  const strip = ({ _col, ...c }) => c;
  const listName = (id) => lists.find((x) => x.id === id)?.name ?? '';

  /* ================= Aperçu ================= */
  function drawOverview() {
    view = 'overview';
    const { counts, none, total } = listCounts(cards, lists);
    const nameInput = h('input', { id: 'ls-name', class: 'input', maxlength: 100, placeholder: t('lists.namePh') });
    const create = async (e) => {
      e?.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      if (lists.some((l) => l.name.toLowerCase() === name.toLowerCase())) { toast(t('lists.exists'), { kind: 'warn' }); return; }
      const l = newList(name);
      await store.put('lists', l);
      await load(); currentId = l.id; drawDetail();
    };
    holder.replaceChildren(
      h('section', { class: 'card' }, h('h2', {}, t('lists.new')),
        h('form', { onsubmit: create, class: 'btn-row' }, h('label', { for: 'ls-name', class: 'sr-only' }, t('lists.name')), nameInput, h('button', { class: 'btn btn-primary', type: 'submit' }, t('lists.create')))),
      h('section', { class: 'card' }, h('h2', {}, t('lists.photoTitle')), h('p', { class: 'muted' }, t('lists.photoHint')),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => drawPhoto() }, icon('book', 18), ' ', t('lists.photoStart'))),
      h('section', {}, h('h2', {}, t('lists.mine', { n: lists.length })),
        h('ul', { class: 'list' },
          lists.map((l) => h('li', { class: 'list-item' },
            h('span', {}, h('strong', {}, l.name), h('span', { class: 'muted block' }, t('lists.words', { n: counts.get(l.id) }))),
            h('span', { class: 'btn-row' },
              h('button', { class: 'btn btn-small', type: 'button', onclick: () => { currentId = l.id; drawDetail(); } }, t('lists.open')),
              h('a', { class: 'btn btn-small', href: `#/review/${l.id}` }, t('lists.review'))))),
          h('li', { class: 'list-item' }, h('span', {}, h('strong', {}, t('lists.none')), h('span', { class: 'muted block' }, t('lists.words', { n: none }))),
            h('a', { class: 'btn btn-small', href: `#/review/${NONE}` }, t('lists.review'))),
          h('li', { class: 'list-item' }, h('span', {}, h('strong', {}, t('lists.all')), h('span', { class: 'muted block' }, t('lists.words', { n: total }))),
            h('a', { class: 'btn btn-small', href: '#/review' }, t('lists.review')))),
        lists.length === 0 ? h('p', { class: 'muted' }, t('lists.empty')) : null));
  }

  /* ================= Détail d'une liste ================= */
  async function renameList(l) {
    const r = await formDialog({ title: t('lists.rename'), fields: [{ name: 'name', label: t('lists.name'), value: l.name, required: true }], confirmLabel: t('common.confirm') });
    if (!r?.name?.trim()) return;
    if (lists.some((x) => x.id !== l.id && x.name.toLowerCase() === r.name.trim().toLowerCase())) { toast(t('lists.exists'), { kind: 'warn' }); return; }
    await store.put('lists', { ...l, name: r.name.trim().slice(0, 100), updatedAt: Date.now() });
    await load(); drawDetail();
  }

  async function deleteList(l) {
    if (!(await confirmDialog({ title: t('lists.deleteTitle', { name: l.name }), message: t('lists.deleteMsg'), confirmLabel: t('common.delete'), danger: true }))) return;
    // les cartes gardent leur contenu : on retire seulement l'appartenance
    const touched = cards.filter((c) => (c.lists ?? []).includes(l.id)).map((c) => withLists(strip(c), c.lists.filter((x) => x !== l.id)));
    for (const c of touched) await store.put(cards.find((x) => x.id === c.id)._col, c);
    await store.delete('lists', l.id);
    await load(); drawOverview();
  }

  async function saveCard(c, front, back, listIds) {
    if (!front.trim() || !back.trim()) { toast(t('lists.needBoth'), { kind: 'warn' }); return; }
    await store.put(c._col, { ...strip(c), front: front.trim().slice(0, 500), back: back.trim().slice(0, 1000), lists: [...new Set(listIds)], updatedAt: Date.now() });
    editingId = null; await load(); drawDetail();
  }

  async function removeFromList(c, listId) {
    await store.put(c._col, withLists(strip(c), (c.lists ?? []).filter((x) => x !== listId)));
    await load(); drawDetail();
  }

  async function deleteCard(c) {
    if (!(await confirmDialog({ title: t('lists.deleteCardTitle'), message: t('lists.deleteCardMsg', { w: c.front }), confirmLabel: t('common.delete'), danger: true }))) return;
    await store.delete(c._col, c.id);
    await load(); drawDetail();
  }

  function drawDetail() {
    view = 'detail';
    const l = lists.find((x) => x.id === currentId);
    if (!l) return drawOverview();
    const inList = cardsOfList(cards, lists, l.id).sort((a, b) => a.front.localeCompare(b.front));
    const front = h('input', { id: 'ls-front', class: 'input', lang: L, maxlength: 200, required: true });
    const back = h('input', { id: 'ls-back', class: 'input', maxlength: 400, required: true });
    const addWord = async (e) => {
      e.preventDefault();
      if (!front.value.trim() || !back.value.trim()) return;
      const plan = planAddToList(cards.filter((c) => c._col === 'vocab').map(strip), [{ front: front.value.trim(), back: back.value.trim() }], l.id, { source: 'manual' });
      if (plan.toPut.length) await store.bulkPut('vocab', plan.toPut);
      toast(plan.already ? t('lists.alreadyIn') : plan.joined ? t('lists.joined') : t('lists.addedOne'), { kind: plan.already ? 'info' : 'success' });
      await load(); drawDetail(); document.getElementById('ls-front')?.focus();
    };

    // ajout de cartes existantes
    const pool = cards.filter((c) => !(c.lists ?? []).includes(l.id) && c._col === 'vocab');
    const picked = new Set();
    const search = h('input', { class: 'input', type: 'search', 'aria-label': t('lists.search'), placeholder: t('lists.search') });
    const poolBox = h('ul', { class: 'list pool' });
    const drawPool = () => {
      const q = search.value.trim().toLowerCase();
      poolBox.replaceChildren(...pool.filter((c) => !q || c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)).slice(0, 60).map((c) => h('li', { class: 'list-item' },
        h('span', { class: 'choice' }, h('input', { type: 'checkbox', id: `pl-${c.id}`, checked: picked.has(c.id), onchange: (e) => (e.target.checked ? picked.add(c.id) : picked.delete(c.id)) }),
          h('label', { for: `pl-${c.id}` }, h('strong', { lang: L }, c.front), ' — ', c.back.split(' — ')[0])))));
    };
    search.addEventListener('input', drawPool); drawPool();
    const addExisting = async () => {
      const sel = pool.filter((c) => picked.has(c.id)).map((c) => withLists(strip(c), [...(c.lists ?? []), l.id]));
      if (!sel.length) return;
      await store.bulkPut('vocab', sel);
      toast(t('lists.addedN', { n: sel.length }), { kind: 'success' });
      await load(); drawDetail();
    };

    const row = (c) => {
      if (editingId === c.id) {
        const f = h('input', { id: `ef-${c.id}`, class: 'input', lang: L, value: c.front, maxlength: 200, 'aria-label': t('lists.word') });
        const b = h('input', { class: 'input', value: c.back, maxlength: 400, 'aria-label': t('lists.meaning') });
        const boxes = lists.map((x) => h('div', { class: 'choice' }, h('input', { type: 'checkbox', id: `em-${c.id}-${x.id}`, checked: (c.lists ?? []).includes(x.id), 'data-list': x.id }), h('label', { for: `em-${c.id}-${x.id}` }, x.name)));
        return h('li', { class: 'list-item edit-row' }, h('div', { class: 'edit-fields' }, f, b, h('fieldset', {}, h('legend', {}, t('lists.memberOf')), ...boxes)),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: () => saveCard(c, f.value, b.value, [...boxes.map((d) => d.querySelector('input')).filter((i) => i.checked).map((i) => i.dataset.list)]) }, t('common.save')),
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => { editingId = null; drawDetail(); } }, t('common.cancel'))));
      }
      const others = cardListIds(c, lists).filter((id) => id !== l.id).map(listName);
      return h('li', { class: 'list-item' },
        h('span', {}, h('strong', { lang: L }, c.front), ' — ', c.back, others.length ? h('span', { class: 'muted block' }, `${t('lists.alsoIn')} ${others.join(', ')}`) : null),
        h('span', { class: 'btn-row' },
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => { editingId = c.id; drawDetail(); document.getElementById(`ef-${c.id}`)?.focus(); } }, t('lists.edit')),
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => removeFromList(c, l.id) }, t('lists.removeFrom')),
          h('button', { class: 'btn btn-small btn-danger', type: 'button', 'aria-label': t('lists.deleteCardAria', { w: c.front }), onclick: () => deleteCard(c) }, icon('trash', 16))));
    };

    holder.replaceChildren(
      h('p', {}, h('button', { class: 'btn btn-small', type: 'button', onclick: () => drawOverview() }, '← ', t('lists.back'))),
      h('section', { class: 'card' }, h('h2', {}, l.name), h('p', { class: 'muted' }, t('lists.words', { n: inList.length })),
        h('div', { class: 'btn-row' },
          h('a', { class: 'btn btn-primary', href: `#/review/${l.id}` }, t('lists.review')),
          h('button', { class: 'btn', type: 'button', onclick: () => renameList(l) }, t('lists.rename')),
          h('button', { class: 'btn btn-danger', type: 'button', onclick: () => deleteList(l) }, icon('trash', 16), ' ', t('lists.delete')))),
      h('form', { class: 'card', onsubmit: addWord }, h('h3', {}, t('lists.addWord')),
        h('div', { class: 'field' }, h('label', { for: 'ls-front' }, t('lists.word')), front),
        h('div', { class: 'field' }, h('label', { for: 'ls-back' }, t('lists.meaning')), back),
        h('button', { class: 'btn', type: 'submit' }, t('common.add'))),
      pool.length ? h('details', { class: 'card' }, h('summary', {}, t('lists.addExisting', { n: pool.length })), search, poolBox,
        h('button', { class: 'btn', type: 'button', onclick: addExisting }, t('lists.addSelected'))) : null,
      h('section', {}, inList.length ? h('ul', { class: 'list' }, inList.map(row)) : h('p', { class: 'muted' }, t('lists.emptyList'))));
  }

  /* ================= Import par photos ================= */
  async function addFiles(files) {
    for (const f of [...files]) {
      if (photos.length >= MAX_PHOTOS) { toast(t('lists.maxPhotos', { n: MAX_PHOTOS }), { kind: 'warn' }); break; }
      try { photos.push(await fileToJpeg(f)); } catch (e) { toast(`${f.name} : ${e.message}`, { kind: 'warn' }); }
    }
    if (!destroyed && view === 'photo') drawPhoto();
  }

  async function scan() {
    if (scanning || !photos.length) return;
    scanning = true; scanErr = null; found = null; drawPhoto();
    const merged = new Map();
    try {
      for (let i = 0; i < photos.length; i += BATCH) {
        const batch = photos.slice(i, i + BATCH);
        const r = await ctx.askAI({ system: photoVocabSystemPrompt(ctx.prefs()), messages: [{ role: 'user', content: 'Extract the vocabulary from the attached photo(s).' }], images: batch.map(({ mimeType, base64 }) => ({ mimeType, base64 })), maxTokens: 6000 }, {});
        for (const it of normalizePhotoVocab(extractJson(r.text))) {
          const k = wordKey(it.word);
          if (k && !merged.has(k)) merged.set(k, it);
        }
      }
      const knownKeys = new Set(cards.filter((c) => c._col === 'vocab').map((c) => wordKey(c.front)));
      found = [...merged.values()].map((it) => ({ ...it, on: !it.uncertain, known: knownKeys.has(wordKey(it.word)) }));
      if (!found.length) scanErr = t('lists.nothingFound');
    } catch (e) { scanErr = e.message; }
    scanning = false;
    if (!destroyed && view === 'photo') drawPhoto();
  }

  async function addFound() {
    const chosen = found.filter((x) => x.on && x.word.trim() && x.translation.trim());
    if (!chosen.length) { toast(t('lists.nothingChosen'), { kind: 'warn' }); return; }
    let listId = dest.id;
    if (!listId) {
      const name = dest.newName.trim();
      if (!name) { toast(t('lists.needName'), { kind: 'warn' }); return; }
      const ex = lists.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (ex) listId = ex.id; else { const l = newList(name); await store.put('lists', l); listId = l.id; }
    }
    const plan = planAddToList(cards.filter((c) => c._col === 'vocab').map(strip), chosen.map((x) => ({ front: x.word.trim(), back: composeBack(x) })), listId, { source: 'photo' });
    if (plan.toPut.length) await store.bulkPut('vocab', plan.toPut);
    toast(t('lists.photoAdded', { added: plan.added, joined: plan.joined }), { kind: 'success' });
    cleanupPhotos(); found = null;
    await load(); currentId = listId; drawDetail();
  }

  function cleanupPhotos() { for (const p of photos) URL.revokeObjectURL(p.previewUrl); photos = []; }

  function drawPhoto() {
    view = 'photo';
    const configured = ctx.ai.isConfigured();
    const pickInput = h('input', { id: 'ph-file', type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', onchange: (e) => { addFiles(e.target.files); e.target.value = ''; } });
    const camInput = h('input', { id: 'ph-cam', type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', onchange: (e) => { addFiles(e.target.files); e.target.value = ''; } });
    const destSel = h('select', { id: 'ph-dest', class: 'input', onchange: (e) => { dest.id = e.target.value; drawPhoto(); } },
      [h('option', { value: '', selected: !dest.id }, t('lists.newListOpt')), ...lists.map((l) => h('option', { value: l.id, selected: dest.id === l.id }, l.name))]);
    holder.replaceChildren(
      h('p', {}, h('button', { class: 'btn btn-small', type: 'button', onclick: () => { cleanupPhotos(); found = null; drawOverview(); } }, '← ', t('lists.back'))),
      h('section', { class: 'card' }, h('h2', {}, t('lists.photoTitle')),
        !configured ? banner('info', t('lists.needAi'), ' ', h('a', { href: '#/settings' }, t('home.noAiLink'))) : null,
        h('p', { class: 'muted' }, t('lists.photoPrivacy')),
        pickInput, camInput,
        h('div', { class: 'btn-row' },
          h('label', { class: 'btn', for: 'ph-file', role: 'button', tabindex: 0, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickInput.click(); } } }, t('lists.choosePhotos')),
          h('label', { class: 'btn', for: 'ph-cam', role: 'button', tabindex: 0, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); camInput.click(); } } }, t('lists.takePhoto'))),
        photos.length ? h('ul', { class: 'thumbs' }, photos.map((p, i) => h('li', {},
          h('img', { src: p.previewUrl, alt: t('lists.photoAlt', { i: i + 1 }), width: 96, height: 96 }),
          h('button', { class: 'btn btn-small', type: 'button', 'aria-label': t('lists.removePhoto', { i: i + 1 }), onclick: () => { URL.revokeObjectURL(p.previewUrl); photos.splice(i, 1); drawPhoto(); } }, icon('trash', 14))))) : null,
        h('button', { class: 'btn btn-primary', type: 'button', disabled: !photos.length || !configured || scanning, onclick: () => scan() }, scanning ? spinner(t('lists.scanning')) : t('lists.scan', { n: photos.length }))),
      scanErr ? banner('error', scanErr) : null,
      found ? foundSection(destSel) : null);
  }

  function foundSection(destSel) {
    const nOn = found.filter((x) => x.on).length;
    return h('section', { class: 'card' }, h('h2', {}, t('lists.found', { n: found.length })), h('p', { class: 'muted' }, t('lists.reviewHint')),
      h('ul', { class: 'list found' }, found.map((x, i) => h('li', { class: `list-item ${x.uncertain ? 'is-uncertain' : ''}` },
        h('div', { class: 'found-row' },
          h('input', { type: 'checkbox', id: `fd-${i}`, checked: x.on, 'aria-label': t('lists.keep', { w: x.word }), onchange: (e) => { x.on = e.target.checked; foundCount(); } }),
          h('div', { class: 'edit-fields' },
            h('input', { class: 'input', lang: L, value: x.word, maxlength: 100, 'aria-label': t('lists.word'), oninput: (e) => { x.word = e.target.value; } }),
            h('input', { class: 'input', value: x.translation, maxlength: 200, 'aria-label': t('lists.meaning'), oninput: (e) => { x.translation = e.target.value; } }),
            x.form ? h('span', { class: 'muted' }, `${t('lists.seenAs')} ${x.form}`) : null,
            x.example ? h('span', { class: 'muted', lang: L }, x.example) : null,
            h('span', { class: 'badges' }, x.uncertain ? h('span', { class: 'badge badge-warn' }, t('lists.uncertain')) : null, x.known ? h('span', { class: 'badge' }, t('lists.known')) : null)))))),
      h('div', { class: 'field' }, h('label', { for: 'ph-dest' }, t('lists.destination')), destSel,
        !dest.id ? h('input', { class: 'input', 'aria-label': t('lists.name'), placeholder: t('lists.namePh'), maxlength: 100, value: dest.newName, oninput: (e) => { dest.newName = e.target.value; } }) : null),
      h('button', { id: 'ph-add', class: 'btn btn-primary', type: 'button', onclick: () => addFound() }, t('lists.addFound', { n: nOn })),
      h('p', { class: 'meta' }, t('lists.aiDisclaimer')));
  }
  function foundCount() { const b = document.getElementById('ph-add'); if (b) b.textContent = t('lists.addFound', { n: found.filter((x) => x.on).length }); }

  root.replaceChildren(h('h1', {}, t('lists.title')), holder);
  await load();
  drawOverview();
  return { destroy() { destroyed = true; cleanupPhotos(); } };
}
