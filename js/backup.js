/**
 * backup.js — Export / import JSON : validation stricte, versionnement, migrations,
 * somme de contrôle, fusion ou remplacement, restauration automatique en cas d'échec.
 *
 * Format :
 * {
 *   format: 'linguacoach-backup', version: 1, appVersion, exportedAt,
 *   checksum: 'sha256:<hex de stableStringify(data)>',
 *   data: { prefs, conversations[], activities[], vocab[], errors[] },
 *   secrets?: { encrypted: { alg, kdf, iterations, salt, iv, ct } }   // UNIQUEMENT si demandé + phrase secrète
 * }
 *
 * Les clés API ne sont JAMAIS dans `data`. Elles ne peuvent figurer que dans `secrets`, chiffrées
 * (AES-GCM, clé dérivée par PBKDF2 depuis une phrase secrète choisie par l'utilisateur).
 */
import { BACKUP_FORMAT, BACKUP_VERSION, APP_VERSION, SKILLS } from './config.js';
import { sanitizePrefs, COLLECTIONS } from './storage.js';
import { stableStringify, sha256Hex, bytesToBase64, base64ToBytes } from './utils.js';

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_RECORDS = 100000;
const PBKDF2_ITER = 250000;

export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Migrations : { [versionSource]: (data) => data à versionSource+1 }   */
/* ------------------------------------------------------------------ */
export const MIGRATIONS = {
  // Exemple d'enregistrement pour une future version 2 :
  // 1: (data) => ({ ...data, vocab: data.vocab.map(c => ({ ...c, tags: [] })) }),
};

/** Applique les migrations successives jusqu'à `target`. */
export function migrate(data, fromVersion, { migrations = MIGRATIONS, target = BACKUP_VERSION } = {}) {
  let v = fromVersion;
  let out = data;
  while (v < target) {
    const step = migrations[v];
    if (typeof step !== 'function') throw new BackupError('no-migration', `Aucune migration disponible de la version ${v} vers ${v + 1}.`);
    out = step(structuredClone(out));
    v++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Validation stricte des enregistrements                               */
/* ------------------------------------------------------------------ */
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max = 100000) => typeof v === 'string' && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function fail(coll, i, msg) {
  throw new BackupError('invalid-record', `Données invalides dans « ${coll} » (élément ${i + 1}) : ${msg}.`);
}

const VALIDATORS = {
  conversations(r, i) {
    if (!isStr(r.id, 100) || !r.id) fail('conversations', i, 'identifiant manquant');
    if (!Array.isArray(r.messages)) fail('conversations', i, 'messages manquants');
    const messages = r.messages.map((m, j) => {
      if (!isObj(m) || !['user', 'assistant'].includes(m.role) || !isStr(m.content)) fail('conversations', i, `message ${j + 1} invalide`);
      return { id: isStr(m.id, 100) ? m.id : `${r.id}-${j}`, role: m.role, content: m.content, ts: isNum(m.ts) ? m.ts : 0, ...(isStr(m.provider, 50) ? { provider: m.provider } : {}) };
    });
    return {
      id: r.id, title: isStr(r.title, 300) ? r.title : '', createdAt: isNum(r.createdAt) ? r.createdAt : 0,
      updatedAt: isNum(r.updatedAt) ? r.updatedAt : 0, topic: isStr(r.topic, 50) ? r.topic : '',
      level: isStr(r.level, 5) ? r.level : '', accent: isStr(r.accent, 20) ? r.accent : '',
      profile: isStr(r.profile, 50) ? r.profile : '', messages,
      ...(r.kind === 'voice' ? { kind: 'voice' } : {}),
    };
  },
  activities(r, i) {
    if (!isStr(r.id, 100) || !r.id) fail('activities', i, 'identifiant manquant');
    if (!isNum(r.ts)) fail('activities', i, 'date invalide');
    if (!SKILLS.includes(r.skill)) fail('activities', i, 'compétence inconnue');
    const out = { id: r.id, ts: r.ts, skill: r.skill, type: isStr(r.type, 50) ? r.type : '', level: isStr(r.level, 5) ? r.level : '', topic: isStr(r.topic, 50) ? r.topic : '' };
    if (r.score != null) {
      if (!isObj(r.score) || !isNum(r.score.correct) || !isNum(r.score.total) || r.score.total < 0 || r.score.correct < 0 || r.score.correct > r.score.total)
        fail('activities', i, 'score invalide');
      out.score = { correct: r.score.correct, total: r.score.total };
    }
    if (isStr(r.detail, 2000)) out.detail = r.detail;
    if (isStr(r.aiEstimate, 5000)) out.aiEstimate = r.aiEstimate;
    return out;
  },
  vocab: card('vocab'),
  errors: card('errors'),
};

function card(coll) {
  return (r, i) => {
    if (!isStr(r.id, 100) || !r.id) fail(coll, i, 'identifiant manquant');
    if (!isStr(r.front, 600) || !isStr(r.back, 1200)) fail(coll, i, 'contenu de carte invalide');
    for (const k of ['due', 'interval', 'ease', 'reps']) if (!isNum(r[k])) fail(coll, i, `champ « ${k} » invalide`);
    return {
      id: r.id, kind: isStr(r.kind, 30) ? r.kind : coll, front: r.front, back: r.back, source: isStr(r.source, 200) ? r.source : '',
      createdAt: isNum(r.createdAt) ? r.createdAt : 0, updatedAt: isNum(r.updatedAt) ? r.updatedAt : 0,
      due: r.due, interval: r.interval, ease: r.ease, reps: r.reps, lapses: isNum(r.lapses) ? r.lapses : 0,
    };
  };
}

/* ------------------------------------------------------------------ */
/* Chiffrement optionnel des clés                                       */
/* ------------------------------------------------------------------ */
async function deriveKey(pass, salt, iterations) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj, passphrase, iterations = PBKDF2_ITER) {
  if (!passphrase || passphrase.length < 8) throw new BackupError('weak-passphrase', 'La phrase secrète doit contenir au moins 8 caractères.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

export async function decryptJSON(enc, passphrase) {
  try {
    if (!isObj(enc) || enc.alg !== 'AES-GCM' || enc.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(enc.iterations) || enc.iterations < 10000 || enc.iterations > 5_000_000) throw new Error('format');
    const key = await deriveKey(passphrase, base64ToBytes(enc.salt), enc.iterations);
    const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(enc.iv) }, key, base64ToBytes(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new BackupError('bad-passphrase', 'Phrase secrète incorrecte ou données chiffrées corrompues.');
  }
}

/* ------------------------------------------------------------------ */
/* Export                                                               */
/* ------------------------------------------------------------------ */
export async function snapshot(store) {
  const data = { prefs: store.getPrefs() };
  for (const c of COLLECTIONS) data[c] = await store.all(c);
  return data;
}

export async function buildExport(store, { includeSecrets = false, passphrase = '', now = Date.now() } = {}) {
  const data = await snapshot(store);
  const out = {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion: APP_VERSION, exportedAt: new Date(now).toISOString(),
    checksum: 'sha256:' + (await sha256Hex(stableStringify(data))),
    data,
  };
  if (includeSecrets) {
    const keys = store.getKeys();
    out.secrets = { encrypted: await encryptJSON(keys, passphrase) };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lecture + validation (aucune écriture dans le Store ici)             */
/* ------------------------------------------------------------------ */
/**
 * @returns {Promise<{data, hasSecrets:boolean, secrets:object|null, version:number, migrated:boolean, counts:object}>}
 * @throws {BackupError} code: too-large | not-json | bad-format | too-new | invalid-record | checksum | no-migration | bad-passphrase
 */
export async function parseBackup(text, { passphrase = '', migrations = MIGRATIONS, targetVersion = BACKUP_VERSION } = {}) {
  if (typeof text !== 'string' || text.length === 0) throw new BackupError('not-json', 'Le fichier est vide.');
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError('too-large', 'Le fichier dépasse la taille maximale acceptée (50 Mo).');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new BackupError('not-json', 'Le fichier n\'est pas un JSON valide (corrompu ou tronqué).'); }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError('bad-format', 'Ce fichier n\'est pas une sauvegarde LinguaCoach.');
  if (!Number.isInteger(raw.version) || raw.version < 1) throw new BackupError('bad-format', 'Version de sauvegarde invalide.');
  if (raw.version > targetVersion) throw new BackupError('too-new', `Sauvegarde créée par une version plus récente (format ${raw.version}). Mettez l'application à jour.`);
  if (!isObj(raw.data)) throw new BackupError('bad-format', 'Section « data » manquante.');

  if (raw.checksum != null) {
    const expected = 'sha256:' + (await sha256Hex(stableStringify(raw.data)));
    if (raw.checksum !== expected) throw new BackupError('checksum', 'Somme de contrôle incorrecte : le fichier a été modifié ou corrompu.');
  }

  // La migration s'applique sur les données brutes AVANT la validation du schéma courant.
  const migrated = raw.version < targetVersion;
  const rawData = migrate(raw.data, raw.version, { migrations, target: targetVersion });

  const data = { prefs: sanitizePrefs(rawData.prefs) };
  const counts = {};
  for (const c of COLLECTIONS) {
    const arr = rawData[c] ?? [];
    if (!Array.isArray(arr)) throw new BackupError('invalid-record', `« ${c} » doit être une liste.`);
    if (arr.length > MAX_RECORDS) throw new BackupError('too-large', `Trop d'éléments dans « ${c} ».`);
    const seen = new Set();
    data[c] = arr.map((r, i) => {
      if (!isObj(r)) fail(c, i, 'élément non valide');
      const v = VALIDATORS[c](r, i);
      if (seen.has(v.id)) fail(c, i, 'identifiant en double');
      seen.add(v.id);
      return v;
    });
    counts[c] = data[c].length;
  }

  let secrets = null;
  const hasSecrets = !!raw.secrets?.encrypted;
  if (hasSecrets && passphrase) {
    const k = await decryptJSON(raw.secrets.encrypted, passphrase);
    secrets = { primary: isStr(k?.primary, 500) ? k.primary : '', fallback: isStr(k?.fallback, 500) ? k.fallback : '' };
  }
  return { data, hasSecrets, secrets, version: raw.version, migrated, counts };
}

/* ------------------------------------------------------------------ */
/* Import                                                               */
/* ------------------------------------------------------------------ */
/**
 * Applique des données DÉJÀ validées (issues de parseBackup).
 * mode 'replace' : remplace tout (préférences comprises). mode 'merge' : ajoute les éléments absents,
 * garde le plus récent en cas d'identifiant commun, conserve les préférences locales.
 * En cas d'erreur d'écriture, l'état précédent est restauré.
 */
export async function importBackup(store, parsed, { mode = 'replace', restoreSecrets = false } = {}) {
  if (!['replace', 'merge'].includes(mode)) throw new BackupError('bad-mode', 'Mode d\'import inconnu.');
  const before = await snapshot(store);
  const keysBefore = store.getKeys();
  const stats = { added: 0, updated: 0, kept: 0 };
  try {
    if (mode === 'replace') {
      for (const c of COLLECTIONS) {
        await store.clear(c);
        await store.bulkPut(c, parsed.data[c]);
        stats.added += parsed.data[c].length;
      }
      store.replacePrefs(parsed.data.prefs);
    } else {
      for (const c of COLLECTIONS) {
        const existing = new Map((await store.all(c)).map((r) => [r.id, r]));
        const toWrite = [];
        for (const r of parsed.data[c]) {
          const cur = existing.get(r.id);
          if (!cur) { toWrite.push(r); stats.added++; }
          else if ((r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) { toWrite.push(r); stats.updated++; }
          else stats.kept++;
        }
        if (toWrite.length) await store.bulkPut(c, toWrite);
      }
    }
    if (restoreSecrets && parsed.secrets) {
      if (parsed.secrets.primary) store.setKey('primary', parsed.secrets.primary);
      if (parsed.secrets.fallback) store.setKey('fallback', parsed.secrets.fallback);
    }
    return stats;
  } catch (e) {
    // Retour arrière : on remet l'état d'avant l'import.
    for (const c of COLLECTIONS) { await store.clear(c); await store.bulkPut(c, before[c]); }
    store.replacePrefs(before.prefs);
    store.setKey('primary', keysBefore.primary);
    store.setKey('fallback', keysBefore.fallback);
    throw new BackupError('write-failed', 'Échec de l\'écriture : l\'état précédent a été restauré. ' + (e?.message ?? ''));
  }
}

/** Nombre de jours depuis la dernière sauvegarde (null si jamais). */
export function daysSinceBackup(lastBackupAt, now = Date.now()) {
  return lastBackupAt ? Math.floor((now - lastBackupAt) / 86400000) : null;
}

/** Faut-il rappeler à l'utilisateur de sauvegarder ? (seulement s'il existe des données à perdre) */
export function backupReminderDue({ lastBackupAt, backupReminderDays }, hasData, now = Date.now()) {
  if (!hasData || !backupReminderDays) return false;
  const d = daysSinceBackup(lastBackupAt, now);
  return d === null || d >= backupReminderDays;
}
