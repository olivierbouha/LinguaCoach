/**
 * i18n.js — Internationalisation de l'INTERFACE (français par défaut).
 * Le contenu pédagogique (langue apprise) est géré à part (content/, config.js).
 *
 * Pour ajouter une langue d'interface : créer js/locales/<code>.js (clés de fr.js), l'enregistrer ici
 * et dans UI_LANGS (config.js). Les clés manquantes retombent sur le français.
 */
import fr from './locales/fr.js';
import en from './locales/en.js';

const DICTS = { fr, en };
let current = 'fr';

export function setLang(lang) {
  current = DICTS[lang] ? lang : 'fr';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}
export const getLang = () => current;

/** t('clé', { variable }) — remplace {variable}. Renvoie la clé elle-même si elle est inconnue. */
export function t(key, vars = {}) {
  const s = DICTS[current]?.[key] ?? DICTS.fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export const dictionaries = DICTS;
