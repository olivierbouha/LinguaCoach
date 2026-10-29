/**
 * storage.js — Persistance locale.
 *
 *  - Préférences simples : localStorage  (clé « lc.prefs »)
 *  - Clés API            : localStorage ou sessionStorage, dans une entrée SÉPARÉE (« lc.keys »),
 *                          jamais mêlée aux préférences ni aux exports par défaut.
 *  - Données volumineuses : IndexedDB (conversations, activités, vocabulaire, erreurs),
 *                          avec repli en mémoire si IndexedDB est indisponible (navigation privée…).
 *
 * Le Store reçoit ses dépendances (backend, kv) : les tests utilisent des versions en mémoire.
 */
import {
  DEFAULT_PREFS, LANGUAGES, LEVELS, TOPICS, PROFILES, CORRECTION_STYLES, PROVIDER_IDS, THEMES_UI, UI_LANGS, NATIVE_LANGS,
} from './config.js';
import { clamp } from './utils.js';

export const COLLECTIONS = ['conversations', 'activities', 'vocab', 'errors'];
const PREFS_KEY = 'lc.prefs';
const KEYS_KEY = 'lc.keys';

/* ------------------------------------------------------------------ */
/* Stockage clé/valeur (localStorage-like)                             */
/* ------------------------------------------------------------------ */

export function createMemoryKV() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    _map: m,
  };
}

/** Enveloppe un Storage du navigateur : bascule en mémoire s'il lève (mode privé, quota, politique). */
export function safeKV(getStorage) {
  const mem = createMemoryKV();
  let real = null;
  try {
    real = getStorage();
    real.setItem('lc.__probe', '1');
    real.removeItem('lc.__probe');
  } catch {
    real = null;
  }
  const kv = real ?? mem;
  return {
    persistent: !!real,
    getItem(k) { try { return kv.getItem(k); } catch { return mem.getItem(k); } },
    setItem(k, v) { try { kv.setItem(k, v); } catch { mem.setItem(k, v); } },
    removeItem(k) { try { kv.removeItem(k); } catch { /* ignore */ } mem.removeItem(k); },
  };
}

/* ------------------------------------------------------------------ */
/* Backends de collections                                             */
/* ------------------------------------------------------------------ */

export function createMemoryBackend() {
  const data = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
  const col = (c) => {
    if (!data[c]) throw new Error(`Collection inconnue : ${c}`);
    return data[c];
  };
  return {
    persistent: false,
    async get(c, id) { const v = col(c).get(id); return v ? structuredClone(v) : undefined; },
    async put(c, obj) { col(c).set(obj.id, structuredClone(obj)); return obj; },
    async bulkPut(c, arr) { for (const o of arr) col(c).set(o.id, structuredClone(o)); },
    async all(c) { return [...col(c).values()].map((v) => structuredClone(v)); },
    async delete(c, id) { col(c).delete(id); },
    async clear(c) { col(c).clear(); },
  };
}

export function createIDBBackend(name = 'linguacoach') {
  let dbPromise;
  const open = () =>
    (dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const c of COLLECTIONS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloquée par un autre onglet'));
    }));
  /** Exécute `fn(store)` dans une transaction ; renvoie le résultat de la requête retournée, une fois la transaction validée. */
  const run = async (c, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(c, mode);
      let req;
      try { req = fn(t.objectStore(c)); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('Transaction annulée'));
    });
  };
  return {
    persistent: true,
    open,
    get: (c, id) => run(c, 'readonly', (s) => s.get(id)),
    put: async (c, obj) => { await run(c, 'readwrite', (s) => s.put(obj)); return obj; },
    bulkPut: (c, arr) => run(c, 'readwrite', (s) => { for (const o of arr) s.put(o); }),
    all: async (c) => (await run(c, 'readonly', (s) => s.getAll())) ?? [],
    delete: (c, id) => run(c, 'readwrite', (s) => s.delete(id)),
    clear: (c) => run(c, 'readwrite', (s) => s.clear()),
  };
}

/** Choisit IndexedDB si elle fonctionne réellement, sinon la mémoire (et le signale via `persistent`). */
export async function createBackend() {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no idb');
    const b = createIDBBackend();
    await b.open();
    return b;
  } catch {
    return createMemoryBackend();
  }
}

/* ------------------------------------------------------------------ */
/* Validation / nettoyage des préférences                              */
/* ------------------------------------------------------------------ */

const str = (v, max, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

function cleanUrl(v) {
  const s = str(v, 300);
  if (!s) return '';
  try {
    const u = new URL(s);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return s.replace(/\/+$/, '');
  } catch { /* invalide */ }
  return '';
}

function cleanSlot(raw = {}) {
  return {
    provider: oneOf(raw?.provider, ['', ...PROVIDER_IDS], ''),
    model: str(raw?.model, 200),
    baseUrl: cleanUrl(raw?.baseUrl),
  };
}

/**
 * Renvoie un objet de préférences complet et valide à partir d'une entrée quelconque.
 * Toute clé inconnue est supprimée (donc aucune clé API ne peut transiter par les préférences).
 */
export function sanitizePrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_PREFS;
  const language = oneOf(r.language, Object.keys(LANGUAGES), d.language);
  const accents = Object.keys(LANGUAGES[language].accents);
  const consent = {};
  if (r.aiConsent && typeof r.aiConsent === 'object') {
    for (const p of PROVIDER_IDS) if (r.aiConsent[p] === true) consent[p] = true;
  }
  const num = (v, min, max, fb) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? clamp(Number(v), min, max) : fb);
  return {
    uiLang: oneOf(r.uiLang, Object.keys(UI_LANGS), d.uiLang),
    theme: oneOf(r.theme, THEMES_UI, d.theme),
    language,
    accent: oneOf(r.accent, accents, LANGUAGES[language].defaultAccent),
    level: oneOf(r.level, LEVELS, d.level),
    topic: oneOf(r.topic, Object.keys(TOPICS), d.topic),
    profile: oneOf(r.profile, Object.keys(PROFILES), d.profile),
    nativeLang: oneOf(r.nativeLang, NATIVE_LANGS.map((n) => n.code), d.nativeLang),
    goals: str(r.goals, 500),
    correctionStyle: oneOf(r.correctionStyle, Object.keys(CORRECTION_STYLES), d.correctionStyle),
    dailyGoal: Math.round(num(r.dailyGoal, 1, 50, d.dailyGoal)),
    speechRate: num(r.speechRate, 0.5, 1.5, d.speechRate),
    voiceURI: str(r.voiceURI, 300),
    keyStorage: oneOf(r.keyStorage, ['local', 'session'], d.keyStorage),
    backupReminderDays: Math.round(num(r.backupReminderDays, 0, 365, d.backupReminderDays)),
    lastBackupAt: num(r.lastBackupAt, 0, 8.64e15, 0),
    aiConsent: consent,
    audioConsent: r.audioConsent === true,
    ai: {
      primary: cleanSlot(r.ai?.primary),
      fallback: { enabled: r.ai?.fallback?.enabled === true, ...cleanSlot(r.ai?.fallback) },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export class Store {
  /**
   * @param {{backend: object, local: object, session?: object}} deps
   *   local/session : objets de type Storage (getItem/setItem/removeItem)
   */
  constructor({ backend, local, session }) {
    this.backend = backend;
    this.local = local;
    this.session = session ?? createMemoryKV();
  }

  /* --- préférences --- */
  getPrefs() {
    let raw = null;
    try { raw = JSON.parse(this.local.getItem(PREFS_KEY) ?? 'null'); } catch { /* corrompu → défauts */ }
    return sanitizePrefs(raw);
  }
  /** Fusionne un patch (l'objet `ai` est fusionné en profondeur) et enregistre. Renvoie les préférences résultantes. */
  setPrefs(patch) {
    const cur = this.getPrefs();
    const next = {
      ...cur,
      ...patch,
      ai: {
        primary: { ...cur.ai.primary, ...(patch.ai?.primary ?? {}) },
        fallback: { ...cur.ai.fallback, ...(patch.ai?.fallback ?? {}) },
      },
      aiConsent: patch.aiConsent === null ? {} : { ...cur.aiConsent, ...(patch.aiConsent ?? {}) },
    };
    const clean = sanitizePrefs(next);
    this.local.setItem(PREFS_KEY, JSON.stringify(clean));
    return clean;
  }
  /** Remplace entièrement les préférences (import). */
  replacePrefs(prefs) {
    const clean = sanitizePrefs(prefs);
    this.local.setItem(PREFS_KEY, JSON.stringify(clean));
    return clean;
  }

  /* --- clés API (séparées des préférences) --- */
  #keyStore() { return this.getPrefs().keyStorage === 'session' ? this.session : this.local; }
  getKeys() {
    // On lit les deux emplacements : si l'utilisateur change de mode, rien n'est perdu silencieusement.
    const read = (kv) => { try { const o = JSON.parse(kv.getItem(KEYS_KEY) ?? 'null'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
    const a = read(this.local), b = read(this.session);
    const pick = (slot) => (typeof b[slot] === 'string' && b[slot] ? b[slot] : typeof a[slot] === 'string' ? a[slot] : '');
    return { primary: pick('primary'), fallback: pick('fallback') };
  }
  setKey(slot, value) {
    if (!['primary', 'fallback'].includes(slot)) throw new Error('slot invalide');
    const keys = this.getKeys();
    keys[slot] = String(value ?? '').trim();
    this.#writeKeys(keys);
  }
  #writeKeys(keys) {
    const target = this.#keyStore();
    const other = target === this.local ? this.session : this.local;
    other.removeItem(KEYS_KEY);
    if (!keys.primary && !keys.fallback) target.removeItem(KEYS_KEY);
    else target.setItem(KEYS_KEY, JSON.stringify(keys));
  }
  /** À appeler après un changement de keyStorage : déplace les clés vers le nouvel emplacement. */
  migrateKeyStorage() { this.#writeKeys(this.getKeys()); }
  clearKeys() { this.local.removeItem(KEYS_KEY); this.session.removeItem(KEYS_KEY); }

  /* --- collections --- */
  get(c, id) { return this.backend.get(c, id); }
  put(c, obj) { return this.backend.put(c, obj); }
  bulkPut(c, arr) { return this.backend.bulkPut(c, arr); }
  all(c) { return this.backend.all(c); }
  delete(c, id) { return this.backend.delete(c, id); }
  clear(c) { return this.backend.clear(c); }
  async clearAllData({ includePrefs = true, includeKeys = true } = {}) {
    for (const c of COLLECTIONS) await this.backend.clear(c);
    if (includePrefs) this.local.removeItem(PREFS_KEY);
    if (includeKeys) this.clearKeys();
  }
}
