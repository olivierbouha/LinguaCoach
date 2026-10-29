/**
 * modules/settings.js — Réglages : apprentissage, apparence, voix, IA (principal + secours), données.
 * Les clés API sont saisies localement, stockées à part (voir storage.js) et jamais exportées par défaut.
 */
import { h } from '../utils.js';
import { select, field, banner, toast, confirmDialog, formDialog, spinner } from '../ui.js';
import {
  LEVELS, TOPICS, PROFILES, NATIVE_LANGS, CORRECTION_STYLES, PROVIDER_IDS, UI_LANGS, getLanguage,
} from '../config.js';
import { PROVIDERS } from '../ai/providers/index.js';
import { describeVoice, voicesForLanguage, pickVoice } from '../speech.js';
import { buildExport, parseBackup, importBackup, BackupError, daysSinceBackup } from '../backup.js';
import { getInstallEvent } from '../install.js';

export async function render(root, ctx) {
  const { t, store } = ctx;
  const holder = h('div', {});

  const sec = (title, ...body) => h('section', { class: 'card settings-sec' }, h('h2', {}, title), ...body);
  const set = (patch) => { ctx.setPrefs(patch); };

  /* ---------- Apprentissage ---------- */
  function learning(p) {
    const lang = getLanguage(p);
    return sec(t('set.learning'),
      field(t('set.accent'), select(Object.values(lang.accents).map((a) => [a.code, `${a.label} (${a.code})`]), p.accent, (v) => { set({ accent: v }); draw(); })),
      field(t('common.level'), select(LEVELS.map((l) => [l, l]), p.level, (v) => set({ level: v }))),
      field(t('common.topic'), select(Object.entries(TOPICS).map(([k, v]) => [k, v.label]), p.topic, (v) => set({ topic: v }))),
      field(t('set.nativeLang'), select(NATIVE_LANGS.map((n) => [n.code, n.label]), p.nativeLang, (v) => set({ nativeLang: v })), t('set.nativeLangHint')),
      field(t('set.correction'), select(Object.entries(CORRECTION_STYLES), p.correctionStyle, (v) => set({ correctionStyle: v }))),
      field(t('set.goals'), h('textarea', { class: 'input', rows: 2, maxlength: 500, value: p.goals, onchange: (e) => set({ goals: e.target.value }) }), t('set.goalsHint')),
      field(t('set.dailyGoal'), h('input', { class: 'input', type: 'number', min: 1, max: 50, value: p.dailyGoal, onchange: (e) => set({ dailyGoal: e.target.value }) })),
      h('fieldset', { class: 'profiles' }, h('legend', {}, t('set.profile')),
        Object.entries(PROFILES).map(([k, v]) => h('div', { class: 'choice' },
          h('input', { type: 'radio', name: 'profile', id: `pf-${k}`, checked: p.profile === k, onchange: () => set({ profile: k }) }),
          h('label', { for: `pf-${k}` }, h('strong', {}, v.label), h('span', { class: 'muted block' }, v.desc)))),
        h('p', { class: 'hint' }, t('set.profileHint'))));
  }

  /* ---------- Apparence & voix ---------- */
  async function appearance(p) {
    const voices = await ctx.allVoices();
    const pk = pickVoice(voices, p.accent, { preferredURI: p.voiceURI });
    const v = describeVoice(pk);
    const list = voicesForLanguage(voices, p.accent);
    return sec(t('set.appearance'),
      field(t('set.theme'), select([['auto', t('set.themeAuto')], ['light', t('set.themeLight')], ['dark', t('set.themeDark')]], p.theme, (x) => set({ theme: x }))),
      field(t('set.uiLang'), select(Object.entries(UI_LANGS), p.uiLang, (x) => { set({ uiLang: x }); draw(); }), t('set.uiLangHint')),
      h('h3', {}, t('set.voice')),
      banner(v.level === 'ok' ? 'info' : 'warn', v.text),
      list.length
        ? field(t('set.voicePick'), select([['', t('set.voiceAuto')], ...list.map((x) => [x.voiceURI, `${x.name} (${x.lang})`])], p.voiceURI, (x) => { set({ voiceURI: x }); location.reload(); }))
        : h('p', { class: 'muted' }, t('set.noVoices')),
      h('p', { class: 'hint' }, t('set.voiceHint')));
  }

  /* ---------- IA ---------- */
  function slotForm(slot, p, label) {
    const cfg = p.ai[slot];
    const keys = store.getKeys();
    const prov = PROVIDERS[cfg.provider];
    const idp = `ai-${slot}`;
    const dl = h('datalist', { id: `${idp}-models` });
    const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const modelInput = h('input', { class: 'input', id: `${idp}-model`, list: `${idp}-models`, autocomplete: 'off', spellcheck: 'false', value: cfg.model, placeholder: t('set.modelPh'), onchange: (e) => set({ ai: { [slot]: { model: e.target.value } } }) });
    const keyInput = h('input', { class: 'input', id: `${idp}-key`, type: 'password', autocomplete: 'off', spellcheck: 'false', value: keys[slot], placeholder: prov?.requiresKey === false ? t('set.keyOptional') : t('set.keyPh'), onchange: (e) => { store.setKey(slot, e.target.value); status.replaceChildren(); } });
    const show = h('button', { class: 'btn btn-small', type: 'button', 'aria-pressed': 'false', onclick: (e) => { const on = keyInput.type === 'password'; keyInput.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.textContent = on ? t('set.hideKey') : t('set.showKey'); } }, t('set.showKey'));

    const listBtn = h('button', { class: 'btn btn-small', type: 'button', onclick: async () => {
      status.replaceChildren(spinner());
      try {
        const names = await ctx.ai.listModels(slot);
        dl.replaceChildren(...names.map((n) => h('option', { value: n })));
        status.replaceChildren(h('span', { class: 'ok-text' }, t('set.modelsFound', { n: names.length })));
      } catch (e) { status.replaceChildren(h('span', { class: 'err-text' }, e.message)); }
    } }, t('set.listModels'));

    const testBtn = h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: async () => {
      status.replaceChildren(spinner(t('set.testing')));
      try {
        const r = await ctx.ai.test(slot);
        status.replaceChildren(h('span', { class: 'ok-text' }, t('set.testOk', { p: ctx.ai.providerLabel(r.provider), m: r.model, ms: r.ms })));
      } catch (e) { status.replaceChildren(h('span', { class: 'err-text' }, e.message)); }
    } }, t('set.test'));

    return h('div', { class: 'slot' },
      h('h3', {}, label),
      field(t('set.provider'), select([['', t('set.none')], ...PROVIDER_IDS.map((id) => [id, PROVIDERS[id].label])], cfg.provider, (v) => { set({ ai: { [slot]: { provider: v } } }); draw(); }, { id: `${idp}-prov` })),
      cfg.provider ? [
        prov.requiresBaseUrl ? field(t('set.baseUrl'), h('input', { class: 'input', id: `${idp}-url`, type: 'url', value: cfg.baseUrl, placeholder: 'http://localhost:11434/v1', onchange: (e) => { set({ ai: { [slot]: { baseUrl: e.target.value } } }); draw(); } }), t('set.baseUrlHint')) : null,
        field(t('set.model'), modelInput, t('set.modelHint')), dl,
        field(t('set.key'), keyInput, prov.requiresKey ? t('set.keyHint') : t('set.keyOptionalHint')),
        h('div', { class: 'btn-row' }, show, listBtn, testBtn), status,
        cfg.provider === 'custom' ? h('p', { class: 'hint' }, t('set.customHint')) : null,
        prov.capabilities.audioInput ? h('p', { class: 'hint' }, t('set.audioCapable')) : h('p', { class: 'hint' }, t('set.audioNot')),
      ] : null);
  }

  function aiSection(p) {
    return sec(t('set.ai'),
      banner('warn', h('strong', {}, t('set.keyRiskTitle')), ' ', t('set.keyRisk')),
      slotForm('primary', p, t('set.primary')),
      h('div', { class: 'field field-check' },
        h('input', { id: 'fb-enable', type: 'checkbox', checked: p.ai.fallback.enabled, onchange: (e) => { set({ ai: { fallback: { enabled: e.target.checked } } }); draw(); } }),
        h('label', { for: 'fb-enable' }, t('set.fallbackEnable'))),
      h('p', { class: 'hint' }, t('set.fallbackHint')),
      p.ai.fallback.enabled ? slotForm('fallback', p, t('set.fallback')) : null,
      field(t('set.keyStorage'), select([['local', t('set.keyLocal')], ['session', t('set.keySession')]], p.keyStorage, (v) => { set({ keyStorage: v }); store.migrateKeyStorage(); })),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-small', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: t('set.clearKeysTitle'), message: t('set.clearKeysMsg'), confirmLabel: t('common.delete'), danger: true })) { store.clearKeys(); draw(); toast(t('set.keysCleared'), { kind: 'success' }); }
        } }, t('set.clearKeys')),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => { set({ aiConsent: null }); toast(t('set.consentRevoked'), { kind: 'success' }); } }, t('set.revokeConsent'))),
      h('p', { class: 'hint' }, t('set.publicNote')));
  }

  /* ---------- Données ---------- */
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function doExport(withSecrets) {
    try {
      let passphrase = '';
      if (withSecrets) {
        const f = await formDialog({ title: t('set.exportSecretsTitle'), message: t('set.exportSecretsMsg'),
          fields: [{ name: 'pass', label: t('set.passphrase'), type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }], confirmLabel: t('set.exportBtn') });
        if (!f) return;
        passphrase = f.pass;
      }
      const data = await buildExport(store, { includeSecrets: withSecrets, passphrase });
      download(`linguacoach-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
      set({ lastBackupAt: Date.now() });
      toast(t('set.exported'), { kind: 'success' });
      draw();
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }

  async function doImport(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let parsed;
      try { parsed = await parseBackup(text); } catch (e) { throw e; }
      let restoreSecrets = false;
      if (parsed.hasSecrets) {
        const f = await formDialog({ title: t('set.importSecretsTitle'), message: t('set.importSecretsMsg'), fields: [{ name: 'pass', label: t('set.passphrase'), type: 'password', autocomplete: 'off' }], confirmLabel: t('common.continue') });
        if (!f) return;
        if (f.pass) { parsed = await parseBackup(text, { passphrase: f.pass }); restoreSecrets = !!parsed.secrets; }
      }
      const c = parsed.counts;
      const choice = await formDialog({
        title: t('set.importTitle'), message: t('set.importSummary', { conv: c.conversations, act: c.activities, vocab: c.vocab, err: c.errors }),
        fields: [{ name: 'mode', label: t('set.importMode'), type: 'select', value: 'merge', options: [['merge', t('set.modeMerge')], ['replace', t('set.modeReplace')]] }], confirmLabel: t('set.importBtn'),
      });
      if (!choice) return;
      if (choice.mode === 'replace' && !(await confirmDialog({ title: t('set.replaceTitle'), message: t('set.replaceMsg'), confirmLabel: t('set.modeReplace'), danger: true }))) return;
      const st = await importBackup(store, parsed, { mode: choice.mode, restoreSecrets });
      toast(t('set.imported', { a: st.added, u: st.updated }), { kind: 'success' });
      ctx.setPrefs({});
      draw();
    } catch (e) {
      toast(e instanceof BackupError ? e.message : t('set.importFail'), { kind: 'error', duration: 9000 });
    }
  }

  async function data(p) {
    const d = daysSinceBackup(p.lastBackupAt);
    const persisted = await (navigator.storage?.persisted?.() ?? Promise.resolve(false));
    const fileInput = h('input', { id: 'imp', type: 'file', accept: 'application/json,.json', class: 'sr-only', onchange: (e) => { doImport(e.target.files[0]); e.target.value = ''; } });
    return sec(t('set.data'),
      h('p', {}, d === null ? t('set.neverBackup') : t('set.lastBackup', { days: d })),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => doExport(false) }, t('set.export')),
        h('button', { class: 'btn', type: 'button', onclick: () => doExport(true) }, t('set.exportSecrets')),
        h('label', { class: 'btn', for: 'imp' }, t('set.import')), fileInput),
      h('p', { class: 'hint' }, t('set.exportHint')),
      field(t('set.reminder'), select([['0', t('set.reminderOff')], ['3', '3'], ['7', '7'], ['14', '14'], ['30', '30']].map(([v, l]) => [v, v === '0' ? l : t('set.everyDays', { n: l })]), String(p.backupReminderDays), (v) => set({ backupReminderDays: Number(v) }))),
      h('p', { class: 'hint' }, ctx.storageIsPersistent ? t('set.storageOk') : t('set.storageMemory'), ' ', persisted ? t('set.persisted') : null,
        !persisted && navigator.storage?.persist ? h('button', { class: 'btn btn-small', type: 'button', onclick: async () => { await navigator.storage.persist(); draw(); } }, t('set.askPersist')) : null),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: t('set.delConvTitle'), message: t('set.delConvMsg'), confirmLabel: t('common.delete'), danger: true })) { await store.clear('conversations'); toast(t('set.deleted'), { kind: 'success' }); }
        } }, t('set.delConv')),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: t('set.delAllTitle'), message: t('set.delAllMsg'), confirmLabel: t('set.delAll'), danger: true })) { await store.clearAllData(); ctx.setPrefs({}); toast(t('set.deleted'), { kind: 'success' }); location.hash = '#/home'; location.reload(); }
        } }, t('set.delAll'))));
  }

  function about() {
    const ev = getInstallEvent();
    return sec(t('set.about'), h('p', {}, t('set.version', { v: ctx.version })), h('p', { class: 'hint' }, t('set.aboutText')),
      ev ? h('button', { class: 'btn', type: 'button', onclick: async () => { ev.prompt(); await ev.userChoice; } }, t('set.install')) : h('p', { class: 'hint' }, t('set.installHint')));
  }

  let drawing = false;
  async function draw() {
    if (drawing) return;
    drawing = true;
    const y = window.scrollY;
    const p = ctx.prefs();
    const parts = [learning(p), await appearance(p), aiSection(p), await data(p), about()];
    holder.replaceChildren(...parts);
    window.scrollTo(0, y);
    drawing = false;
  }

  root.replaceChildren(h('h1', {}, t('set.title')), holder);
  await draw();
  return {};
}

