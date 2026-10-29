/**
 * content/index.js — Accès à la bibliothèque d'exercices selon la langue/l'accent.
 * Pour ajouter une langue : créer content/<code>.js (mêmes exports que en.js) et l'enregistrer dans PACKS.
 */
import * as en from './en.js';
import { LEVELS, getAccent, getLanguage } from '../config.js';

const PACKS = { en };

/** Remplace {clé} par la variante lexicale de l'accent (sinon laisse le mot brut). */
export function resolveLex(text, lexicon, region) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => lexicon[k]?.[region] ?? k);
}

const lvl = (l) => LEVELS.indexOf(l);

/** Trie par proximité au niveau demandé (les plus proches d'abord, puis les plus faciles). */
function byLevel(items, level) {
  return [...items].sort((a, b) => Math.abs(lvl(a.level) - lvl(level)) - Math.abs(lvl(b.level) - lvl(level)) || lvl(a.level) - lvl(b.level));
}

/**
 * Bibliothèque résolue pour les préférences courantes.
 * @returns {{phrases, dialogues, stories, writingPrompts}} avec textes déjà adaptés à l'accent.
 */
export function getLibrary(prefs) {
  const pack = PACKS[getLanguage(prefs).contentKey] ?? en;
  const region = getAccent(prefs).lex;
  const r = (t) => resolveLex(t, pack.LEXICON, region);
  const qs = (qq) => qq.map((q) => ({ ...q, q: r(q.q), options: q.options.map(r), explanation: r(q.explanation) }));
  return {
    phrases: pack.PHRASES.map((p) => ({ ...p, type: 'phrase', text: r(p.text) })),
    dialogues: pack.DIALOGUES.map((d) => ({ ...d, type: 'dialogue', title: r(d.title), lines: d.lines.map((l) => ({ ...l, text: r(l.text) })), questions: qs(d.questions) })),
    stories: pack.STORIES.map((s) => ({ ...s, type: 'story', title: r(s.title), text: r(s.text), questions: qs(s.questions) })),
    writingPrompts: pack.WRITING_PROMPTS,
  };
}

/** Sélectionne des éléments d'un thème, triés par proximité de niveau ; repli sur tous les thèmes si vide. */
export function pickItems(items, { topic, level }) {
  const inTopic = items.filter((i) => i.topic === topic);
  return byLevel(inTopic.length ? inTopic : items, level);
}
