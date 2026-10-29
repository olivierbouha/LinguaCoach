/**
 * app.js — Point d'entrée : initialisation, contexte partagé, routeur par hash, PWA (service worker, installation).
 *
 * Chaque module d'écran exporte `render(root, ctx)` et renvoie éventuellement { destroy() }.
 */
import { Store, createBackend, safeKV } from './storage.js';
import { AIManager } from './ai/ai-manager.js';
import { AIError, friendlyMessage } from './ai/errors.js';
import { setLang, t } from './i18n.js';
import { loadVoices, pickVoice, speechSupport } from './speech.js';
import { newActivity } from './progress.js';
import { APP_VERSION } from './config.js';
import { $, h } from './utils.js';
import { toast, confirmDialog, icon } from './ui.js';

import * as home from './modules/home.js';
import * as writing from './modules/writing.js';
import * as listening from './modules/listening.js';
import * as speaking from './modules/speaking.js';
import * as settings from './modules/settings.js';
import * as review from './modules/review.js';
import './install.js';

const ROUTES = { home, writing, listening, speaking, settings, review };
const NAV = [
  ['home', 'nav.home', 'home'],
  ['writing', 'nav.writing', 'write'],
  ['listening', 'nav.listening', 'listen'],
  ['speaking', 'nav.speaking', 'speak'],
  ['settings', 'nav.settings', 'settings'],
];

let store;
let ai;
let current = null; // { name, view }
let voicesCache = null;

/* ------------------------------------------------------------------ */
/* Contexte partagé                                                     */
/* ------------------------------------------------------------------ */
function buildContext() {
  const ctx = {
    store, ai, t, toast, confirmDialog,
    version: APP_VERSION,
    prefs: () => store.getPrefs(),
    setPrefs(patch) {
      const p = store.setPrefs(patch);
      applyPrefs(p);
      return p;
    },
    navigate(route) { location.hash = `#/${route}`; },
    support: speechSupport(),

    /** Voix réellement disponible pour l'accent courant (avec sa qualité de correspondance). */
    async voicePick() {
      voicesCache ??= await loadVoices();
      const p = store.getPrefs();
      return pickVoice(voicesCache, p.accent, { preferredURI: p.voiceURI });
    },
    async allVoices() { return (voicesCache ??= await loadVoices()); },

    /** Enregistre une activité réellement accomplie (alimente objectifs, série, progression). */
    async logActivity(a) {
      const p = store.getPrefs();
      const act = newActivity({ level: p.level, topic: p.topic, ...a });
      await store.put('activities', act);
      return act;
    },

    /**
     * Appel IA avec consentement explicite et notifications (nouvelle tentative / bascule).
     * `audio` : si présent, un consentement détaillé est demandé à CHAQUE envoi.
     */
    async askAI(req, opts = {}) {
      if (!ai.isConfigured()) throw new AIError('config', friendlyMessage('config'), { code: 'not_configured' });
      const ok = await ensureConsent(req.audio ? { audio: req.audio } : {});
      if (!ok) throw new AIError('canceled', t('ai.consentDeclined'));
      return ai.ask(req, {
        ...opts,
        onNotice: (n) => { toast(n.message, { kind: 'warn' }); opts.onNotice?.(n); },
      });
    },
  };
  return ctx;
}

/** Consentement avant tout envoi de contenu à un fournisseur. */
async function ensureConsent({ audio } = {}) {
  const p = store.getPrefs();
  const targets = [ai.resolve('primary'), ai.hasFallback() ? ai.resolve('fallback') : null].filter(Boolean)
    .filter((r) => !audio || r.provider.capabilities.audioInput);
  if (audio) {
    const names = [...new Set(targets.map((r) => r.provider.label))].join(', ');
    return confirmDialog({
      title: t('consent.audioTitle'),
      message: t('consent.audioMsg', { providers: names }),
      details: [
        t('consent.audioD1', { kb: Math.round((audio.base64.length * 3) / 4 / 1024), sec: Math.round((audio.durationMs ?? 0) / 100) / 10 }),
        t('consent.audioD2'), t('consent.audioD3'), t('consent.audioD4'),
      ],
      confirmLabel: t('consent.audioOk'),
    });
  }
  const missing = targets.filter((r) => !p.aiConsent[r.provider.id]);
  if (!missing.length) return true;
  const names = [...new Set(targets.map((r) => r.provider.label))].join(', ');
  const ok = await confirmDialog({
    title: t('consent.title'),
    message: t('consent.msg', { providers: names }),
    details: [t('consent.d1'), t('consent.d2'), t('consent.d3')],
    confirmLabel: t('consent.ok'),
  });
  if (ok) store.setPrefs({ aiConsent: Object.fromEntries(targets.map((r) => [r.provider.id, true])) });
  return ok;
}

/* ------------------------------------------------------------------ */
/* Préférences visibles (thème, langue d'interface)                      */
/* ------------------------------------------------------------------ */
function applyPrefs(p) {
  setLang(p.uiLang);
  document.documentElement.dataset.theme = p.theme;
  const dark = p.theme === 'dark' || (p.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14161f' : '#f6f4ef');
  renderChrome();
}

function renderChrome() {
  const nav = $('#nav');
  const active = current?.name === 'review' ? 'home' : current?.name ?? 'home';
  nav.replaceChildren(...NAV.map(([name, key, ic]) => h('a', {
    href: `#/${name}`, class: 'nav-item', 'aria-current': name === active ? 'page' : null,
  }, icon(ic), h('span', {}, t(key)))));
  nav.setAttribute('aria-label', t('nav.label'));
  $('#skip').textContent = t('app.skip');
  $('#offline-pill').textContent = t('app.offline');
  $('#app-title').textContent = t('app.name');
}

/* ------------------------------------------------------------------ */
/* Routeur                                                              */
/* ------------------------------------------------------------------ */
let routeToken = 0;
let firstRoute = true; // pas de vol de focus au tout premier affichage (le lien d'évitement reste le premier arrêt de Tab)
async function route() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  const mod = ROUTES[name] ?? ROUTES.home;
  const resolved = ROUTES[name] ? name : 'home';
  const token = ++routeToken; // évite qu'un rendu lent écrase un écran plus récent
  try { current?.view?.destroy?.(); } catch { /* ignore */ }
  const root = $('#view');
  root.replaceChildren(h('p', { class: 'muted', role: 'status' }, t('common.loading')));
  current = { name: resolved, view: null };
  renderChrome();
  // Chaque écran se construit dans son propre conteneur, attaché seulement s'il est toujours l'écran courant.
  const container = h('div', { class: 'screen' });
  try {
    const view = await mod.render(container, ctx);
    if (token !== routeToken) { view?.destroy?.(); return; }
    current.view = view;
    root.replaceChildren(container);
  } catch (e) {
    console.error(e);
    if (token !== routeToken) return;
    root.replaceChildren(h('div', { class: 'banner banner-error', role: 'alert' }, t('app.renderError')));
  }
  window.scrollTo(0, 0);
  $('#view h1')?.setAttribute('tabindex', '-1');
  if (!firstRoute) $('#view h1')?.focus({ preventScroll: true });
  firstRoute = false;
  document.title = `${t(`nav.${resolved === 'review' ? 'home' : resolved}`)} · ${t('app.name')}`;
}

/* ------------------------------------------------------------------ */
/* PWA                                                                  */
/* ------------------------------------------------------------------ */
function setupOnlineState() {
  const pill = $('#offline-pill');
  const update = () => { pill.hidden = navigator.onLine; };
  addEventListener('online', update);
  addEventListener('offline', update);
  update();
}

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Au tout premier chargement, le SW prend le contrôle (clients.claim) : inutile de recharger la page.
  const hadController = !!navigator.serviceWorker.controller;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const prompt = (worker) => toast(t('pwa.update'), {
      duration: 0,
      action: { label: t('pwa.updateNow'), run: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
    });
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      location.reload();
    });
  } catch (e) {
    console.warn('Service worker indisponible :', e?.message);
  }
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                            */
/* ------------------------------------------------------------------ */
let ctx;
async function main() {
  const backend = await createBackend();
  store = new Store({ backend, local: safeKV(() => localStorage), session: safeKV(() => sessionStorage) });
  ai = new AIManager({
    getConfig: () => {
      const p = store.getPrefs();
      const k = store.getKeys();
      return { primary: { ...p.ai.primary, apiKey: k.primary }, fallback: { ...p.ai.fallback, apiKey: k.fallback } };
    },
  });
  ctx = buildContext();
  ctx.storageIsPersistent = backend.persistent;
  applyPrefs(store.getPrefs());
  setupOnlineState();
  addEventListener('hashchange', route);
  await route();
  setupServiceWorker();
  // Exposé uniquement avec ?debug (tests de bout en bout / débogage local).
  if (new URLSearchParams(location.search).has('debug')) window.__lc = { ctx, ai };
}

main().catch((e) => {
  console.error(e);
  $('#view').replaceChildren(h('div', { class: 'banner banner-error', role: 'alert' }, 'Erreur de démarrage : ' + (e?.message ?? e)));
});
