/**
 * lists-utils.js — Listes de vocabulaire (façon « Quizlet ») : appartenance multiple, doublons, quiz. Fonctions pures, testables.
 *
 * Modèle : collection `lists` {id, name, createdAt, updatedAt} ; chaque carte (vocab/errors) porte `lists: [listId, …]`.
 * Une carte sans liste valide appartient à « Sans liste ». Supprimer une liste ne supprime JAMAIS les cartes.
 */
import { newCard } from './progress.js';
import { normalizeWords } from './text-compare.js';
import { shuffle, uid } from './utils.js';

export const ALL = 'all';
export const NONE = 'none';

const ARTICLES = new Set(['de', 'het', 'een', 'the', 'a', 'an', 'le', 'la', 'les', 'l', 'un', 'une', 'der', 'die', 'das', 'el', 'los', 'las']);

/** Clé de comparaison d'un mot : minuscules, sans ponctuation, sans article initial (« de rivier » = « rivier »). */
export function wordKey(front) {
  const w = normalizeWords(front);
  if (w.length > 1 && ARTICLES.has(w[0])) w.shift();
  return w.join(' ');
}

export function newList(name, now = Date.now()) {
  return { id: uid(), name: String(name).trim().slice(0, 100), createdAt: now, updatedAt: now };
}

/** Identifiants de listes encore existantes pour cette carte. */
export function cardListIds(card, lists) {
  const valid = new Set(lists.map((l) => l.id));
  return (card.lists ?? []).filter((id) => valid.has(id));
}

/** Cartes d'une liste (`ALL` = toutes, `NONE` = sans liste, sinon un identifiant). */
export function cardsOfList(cards, lists, listId) {
  if (listId === ALL || !listId) return cards;
  if (listId === NONE) return cards.filter((c) => cardListIds(c, lists).length === 0);
  return cards.filter((c) => (c.lists ?? []).includes(listId));
}

export function listCounts(cards, lists) {
  const counts = new Map(lists.map((l) => [l.id, 0]));
  let none = 0;
  for (const c of cards) {
    const ids = cardListIds(c, lists);
    if (!ids.length) none++;
    for (const id of ids) counts.set(id, counts.get(id) + 1);
  }
  return { counts, none, total: cards.length };
}

/** Nouvelle carte avec une appartenance modifiée (immuable). */
export function withLists(card, ids, now = Date.now()) {
  return { ...card, lists: [...new Set(ids)], updatedAt: now };
}

/**
 * Prépare l'ajout d'éléments {front, back} à une liste SANS créer de doublon :
 * si une carte de vocabulaire de même mot existe déjà, elle rejoint simplement la liste.
 * @returns {{toPut: object[], added: number, joined: number, already: number}}
 */
export function planAddToList(existingVocab, items, listId, { source = 'manual', now = Date.now() } = {}) {
  const byKey = new Map();
  for (const c of existingVocab) byKey.set(wordKey(c.front), c);
  const toPut = new Map();
  const handled = new Set(); // doublons à l'intérieur d'un même lot : ignorés sans être comptés
  let added = 0, joined = 0, already = 0;
  for (const it of items) {
    const key = wordKey(it.front);
    if (!key || handled.has(key)) continue;
    handled.add(key);
    const cur = toPut.get(key) ?? byKey.get(key);
    if (cur) {
      if ((cur.lists ?? []).includes(listId)) { already++; continue; }
      const upd = withLists(cur, [...(cur.lists ?? []), listId], now);
      toPut.set(key, upd); byKey.set(key, upd); joined++;
    } else {
      const c = newCard({ kind: 'vocab', front: it.front, back: it.back, source, lists: listId ? [listId] : [] }, now);
      toPut.set(key, c); byKey.set(key, c); added++;
    }
  }
  return { toPut: [...toPut.values()], added, joined, already };
}

/** Sens principal d'une carte : « traduction » = verso avant le premier « — » (le reste = forme vue / exemple). */
export const mainBack = (card) => String(card.back).split(' — ')[0].trim();

/**
 * Construit un quiz.
 * @param {object} o  mode: 'choice'|'type' ; direction: 'fwd' (mot → traduction) | 'rev' (traduction → mot) ; size
 * Le choix multiple exige au moins 4 réponses distinctes : sinon repli sur la saisie (`mode` renvoyé).
 */
export function buildQuiz(cards, { mode = 'choice', direction = 'fwd', size = 10, random = Math.random } = {}) {
  const usable = cards.filter((c) => c.front && mainBack(c));
  const answerOf = (c) => (direction === 'fwd' ? mainBack(c) : c.front);
  const promptOf = (c) => (direction === 'fwd' ? c.front : mainBack(c));
  const distinct = new Set(usable.map((c) => answerOf(c).toLowerCase()));
  const effective = mode === 'choice' && distinct.size >= 4 ? 'choice' : 'type';
  const picked = shuffle(usable, random).slice(0, size);
  const items = picked.map((card) => {
    const answer = answerOf(card);
    let options;
    if (effective === 'choice') {
      const wrong = shuffle([...new Set(usable.filter((o) => answerOf(o).toLowerCase() !== answer.toLowerCase()).map(answerOf))], random).slice(0, 3);
      options = shuffle([answer, ...wrong], random);
    }
    return { card, prompt: promptOf(card), answer, ...(options ? { options } : {}) };
  });
  return { mode: effective, direction, items };
}

/** Réponse saisie juste ? Alternatives « a/b », sans tenir compte de la casse, de la ponctuation ni de l'article (côté mot). */
export function checkTyped(expected, typed, { ignoreArticle = false } = {}) {
  const norm = (s) => (ignoreArticle ? wordKey(s) : normalizeWords(s).join(' '));
  const given = norm(typed);
  if (!given) return false;
  return String(expected).split(/\s*\/\s*/).some((alt) => norm(alt) === given) || norm(expected) === given;
}
