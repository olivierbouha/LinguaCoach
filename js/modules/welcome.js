/**
 * modules/welcome.js — Assistant de premier lancement : langue apprise, accent, niveau, langue maternelle, objectif.
 * Tout reste modifiable plus tard dans Réglages. L'IA se configure ensuite dans Réglages (jamais de clé demandée ici).
 */
import { h } from '../utils.js';
import { select, field } from '../ui.js';
import { LEVELS, LANGUAGES, NATIVE_LANGS, UI_LANGS } from '../config.js';

export async function render(root, ctx) {
  const { t } = ctx;
  const draft = { ...ctx.prefs() };
  const form = h('div', { class: 'card' });

  function draw() {
    const lang = LANGUAGES[draft.language];
    form.replaceChildren(
      field(t('set.uiLang'), select(Object.entries(UI_LANGS), draft.uiLang, (v) => { draft.uiLang = v; ctx.setPrefs({ uiLang: v }); location.reload(); })),
      field(t('set.language'), select(Object.values(LANGUAGES).map((l) => [l.id, l.label]), draft.language, (v) => { draft.language = v; draft.accent = LANGUAGES[v].defaultAccent; draw(); })),
      field(t('set.accent'), select(Object.values(lang.accents).map((a) => [a.code, a.label]), draft.accent, (v) => { draft.accent = v; })),
      field(t('common.level'), select(LEVELS.map((l) => [l, l]), draft.level, (v) => { draft.level = v; }), t('welcome.levelHint')),
      field(t('set.nativeLang'), select(NATIVE_LANGS.map((n) => [n.code, n.label]), draft.nativeLang, (v) => { draft.nativeLang = v; })),
      field(t('set.dailyGoal'), h('input', { class: 'input', type: 'number', min: 1, max: 50, value: draft.dailyGoal, onchange: (e) => { draft.dailyGoal = e.target.value; } })),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: finish }, t('welcome.finish')),
        h('button', { class: 'btn', type: 'button', onclick: skip }, t('welcome.skip'))));
  }

  function finish() {
    ctx.setPrefs({ language: draft.language, accent: draft.accent, level: draft.level, nativeLang: draft.nativeLang, dailyGoal: draft.dailyGoal, onboarded: true });
    location.hash = '#/home';
  }
  function skip() { ctx.setPrefs({ onboarded: true }); location.hash = '#/home'; }

  root.replaceChildren(h('h1', {}, t('welcome.title')), h('p', { class: 'lead' }, t('welcome.intro')), form,
    h('p', { class: 'hint' }, t('welcome.aiNote'), ' ', h('a', { href: '#/settings' }, t('home.noAiLink'))));
  draw();
  return {};
}
