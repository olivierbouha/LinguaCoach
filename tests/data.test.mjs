import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, createMemoryBackend, createMemoryKV, sanitizePrefs } from '../js/storage.js';
import { DEFAULT_PREFS, BACKUP_VERSION } from '../js/config.js';
import { buildExport, parseBackup, importBackup, migrate, BackupError, encryptJSON, decryptJSON, backupReminderDue } from '../js/backup.js';
import { newCard, newActivity } from '../js/progress.js';
import { KEY_A, KEY_B } from './helpers.mjs';

const mkStore = () => new Store({ backend: createMemoryBackend(), local: createMemoryKV(), session: createMemoryKV() });
async function seed(store) {
  store.setPrefs({ level: 'B2', accent: 'en-GB', topic: 'travel', goals: 'Voyager', ai: { primary: { provider: 'openai', model: 'm1' } } });
  store.setKey('primary', KEY_B); store.setKey('fallback', KEY_A);
  await store.put('conversations', { id: 'c1', title: 'T', createdAt: 1, updatedAt: 5, topic: 'travel', level: 'B2', accent: 'en-GB', profile: 'teacher', messages: [{ id: 'm1', role: 'user', content: 'hi', ts: 1 }, { id: 'm2', role: 'assistant', content: 'yo', ts: 2 }] });
  await store.put('activities', newActivity({ skill: 'listening', type: 'story', level: 'B1', topic: 'daily', score: { correct: 2, total: 3 } }, 1000));
  await store.put('vocab', newCard({ kind: 'vocab', front: 'lift', back: 'ascenseur' }, 10));
  await store.put('errors', newCard({ kind: 'error', front: 'Fix: I goed', back: 'I went' }, 10));
}

/* ---------------- Préférences ---------------- */
test('Préférences : valeurs par défaut valides', () => {
  const s = mkStore();
  assert.deepEqual(s.getPrefs(), sanitizePrefs(DEFAULT_PREFS));
  assert.equal(s.getPrefs().accent, 'en-US'); assert.equal(s.getPrefs().uiLang, 'fr');
});
test('Préférences : sauvegarde, fusion profonde de `ai`, relecture', () => {
  const s = mkStore();
  s.setPrefs({ level: 'C1', ai: { primary: { provider: 'gemini' } } });
  s.setPrefs({ ai: { primary: { model: 'm' }, fallback: { enabled: true, provider: 'openai' } } });
  const p = s.getPrefs();
  assert.equal(p.level, 'C1'); assert.equal(p.ai.primary.provider, 'gemini'); assert.equal(p.ai.primary.model, 'm');
  assert.equal(p.ai.fallback.enabled, true);
});
test('Préférences : valeurs invalides, inconnues ou malveillantes assainies ; aucune clé API possible', () => {
  const p = sanitizePrefs({ level: 'Z9', accent: 'fr-FR', theme: 'neon', dailyGoal: 9999, speechRate: -3, topic: '<script>', apiKey: KEY_B,
    ai: { primary: { provider: 'evil', model: 'x'.repeat(999), baseUrl: 'javascript:alert(1)', apiKey: KEY_B } }, aiConsent: { openai: true, hack: true } });
  assert.equal(p.level, 'B1'); assert.equal(p.accent, 'en-US'); assert.equal(p.theme, 'auto'); assert.equal(p.dailyGoal, 50);
  assert.equal(p.speechRate, 0.5); assert.equal(p.topic, 'daily'); assert.equal(p.ai.primary.provider, ''); assert.equal(p.ai.primary.model.length, 200);
  assert.equal(p.ai.primary.baseUrl, ''); assert.deepEqual(p.aiConsent, { openai: true });
  assert.ok(!JSON.stringify(p).includes(KEY_B));
  assert.equal(sanitizePrefs({ ai: { primary: { baseUrl: 'http://localhost:11434/v1/' } } }).ai.primary.baseUrl, 'http://localhost:11434/v1');
  assert.equal(sanitizePrefs({ ai: { primary: { baseUrl: 'http://evil.example/v1' } } }).ai.primary.baseUrl, '', 'http non local refusé');
});
test('Préférences corrompues dans le stockage → retour aux valeurs par défaut sans exception', () => {
  const local = createMemoryKV(); local.setItem('lc.prefs', '{pas du json');
  assert.equal(new Store({ backend: createMemoryBackend(), local }).getPrefs().level, 'B1');
});
test('Clés API : stockage séparé des préférences ; mode session ; effacement', () => {
  const local = createMemoryKV(), session = createMemoryKV();
  const s = new Store({ backend: createMemoryBackend(), local, session });
  s.setKey('primary', ' ' + KEY_B + ' ');
  assert.equal(s.getKeys().primary, KEY_B);
  assert.ok(!local.getItem('lc.prefs')?.includes(KEY_B));
  assert.ok(local.getItem('lc.keys').includes(KEY_B));
  s.setPrefs({ keyStorage: 'session' }); s.migrateKeyStorage();
  assert.equal(local.getItem('lc.keys'), null); assert.ok(session.getItem('lc.keys').includes(KEY_B));
  assert.equal(s.getKeys().primary, KEY_B);
  s.clearKeys(); assert.deepEqual(s.getKeys(), { primary: '', fallback: '' });
});

/* ---------------- Export ---------------- */
test('Export : ne contient AUCUNE clé API par défaut', async () => {
  const s = mkStore(); await seed(s);
  const text = JSON.stringify(await buildExport(s));
  assert.ok(!text.includes(KEY_A) && !text.includes(KEY_B));
  assert.ok(!('secrets' in JSON.parse(text)));
  const j = JSON.parse(text);
  assert.equal(j.format, 'linguacoach-backup'); assert.equal(j.version, BACKUP_VERSION); assert.match(j.checksum, /^sha256:[0-9a-f]{64}$/);
  assert.equal(j.data.conversations.length, 1); assert.equal(j.data.prefs.level, 'B2');
});
test('Export avec clés : chiffré (AES-GCM), clés absentes en clair, phrase secrète exigée', async () => {
  const s = mkStore(); await seed(s);
  await assert.rejects(buildExport(s, { includeSecrets: true, passphrase: '' }), (e) => e.code === 'weak-passphrase');
  await assert.rejects(buildExport(s, { includeSecrets: true, passphrase: 'court' }), (e) => e.code === 'weak-passphrase');
  const text = JSON.stringify(await buildExport(s, { includeSecrets: true, passphrase: 'correct horse battery' }));
  assert.ok(!text.includes(KEY_A) && !text.includes(KEY_B));
  const parsed = await parseBackup(text);
  assert.equal(parsed.hasSecrets, true); assert.equal(parsed.secrets, null, 'sans phrase secrète : ignorées');
  const withPass = await parseBackup(text, { passphrase: 'correct horse battery' });
  assert.deepEqual(withPass.secrets, { primary: KEY_B, fallback: KEY_A });
  await assert.rejects(parseBackup(text, { passphrase: 'mauvaise phrase' }), (e) => e.code === 'bad-passphrase');
});
test('chiffrement : aller-retour et rejet de données altérées', async () => {
  const enc = await encryptJSON({ a: 1 }, 'phrase secrète 1', 10000);
  assert.deepEqual(await decryptJSON(enc, 'phrase secrète 1'), { a: 1 });
  await assert.rejects(decryptJSON({ ...enc, ct: enc.ct.slice(0, -4) + 'AAAA' }, 'phrase secrète 1'), (e) => e.code === 'bad-passphrase');
  await assert.rejects(decryptJSON({ ...enc, iterations: 1 }, 'phrase secrète 1'), (e) => e.code === 'bad-passphrase');
});

/* ---------------- Import / restauration ---------------- */
test('Aller-retour export → import (remplacement) dans un Store vide', async () => {
  const a = mkStore(); await seed(a);
  const text = JSON.stringify(await buildExport(a));
  const b = mkStore();
  const parsed = await parseBackup(text);
  assert.deepEqual(parsed.counts, { conversations: 1, activities: 1, vocab: 1, errors: 1 });
  await importBackup(b, parsed, { mode: 'replace' });
  assert.deepEqual(await b.all('conversations'), await a.all('conversations'));
  assert.deepEqual(await b.all('activities'), await a.all('activities'));
  assert.deepEqual(await b.all('vocab'), await a.all('vocab'));
  assert.deepEqual(b.getPrefs(), a.getPrefs());
  assert.deepEqual(b.getKeys(), { primary: '', fallback: '' }, 'les clés ne sont pas restaurées sans export chiffré');
});
test('Import avec clés chiffrées : restaurées uniquement si demandé', async () => {
  const a = mkStore(); await seed(a);
  const text = JSON.stringify(await buildExport(a, { includeSecrets: true, passphrase: 'phrase-secrete-ok' }));
  const parsed = await parseBackup(text, { passphrase: 'phrase-secrete-ok' });
  const b = mkStore(); await importBackup(b, parsed, { mode: 'replace', restoreSecrets: false });
  assert.equal(b.getKeys().primary, '');
  const c = mkStore(); await importBackup(c, parsed, { mode: 'replace', restoreSecrets: true });
  assert.deepEqual(c.getKeys(), { primary: KEY_B, fallback: KEY_A });
});
test('Fusion : ajoute l\'absent, garde le plus récent, conserve les préférences locales', async () => {
  const a = mkStore(); await seed(a);
  const parsed = await parseBackup(JSON.stringify(await buildExport(a)));
  const b = mkStore();
  b.setPrefs({ level: 'A2' });
  await b.put('conversations', { id: 'c1', title: 'LOCAL PLUS RECENT', createdAt: 1, updatedAt: 99, messages: [] });
  await b.put('vocab', { ...newCard({ kind: 'vocab', front: 'x', back: 'y' }, 1), id: 'local-only' });
  const st = await importBackup(b, parsed, { mode: 'merge' });
  assert.equal((await b.get('conversations', 'c1')).title, 'LOCAL PLUS RECENT');
  assert.equal((await b.all('vocab')).length, 2); assert.equal((await b.all('activities')).length, 1);
  assert.equal(b.getPrefs().level, 'A2');
  assert.ok(st.added >= 3 && st.kept >= 1);
  // import plus récent → remplace
  const newer = structuredClone(parsed); newer.data.conversations[0].updatedAt = 1000; newer.data.conversations[0].title = 'IMPORT PLUS RECENT';
  await importBackup(b, newer, { mode: 'merge' });
  assert.equal((await b.get('conversations', 'c1')).title, 'IMPORT PLUS RECENT');
});
test('Remplacement : efface ce qui n\'est pas dans le fichier', async () => {
  const a = mkStore(); await seed(a);
  const parsed = await parseBackup(JSON.stringify(await buildExport(a)));
  const b = mkStore(); await b.put('vocab', { ...newCard({ kind: 'vocab', front: 'x', back: 'y' }), id: 'old' });
  await importBackup(b, parsed, { mode: 'replace' });
  assert.ok(!(await b.all('vocab')).some((c) => c.id === 'old'));
});

/* ---------------- Fichiers invalides / corrompus ---------------- */
const goodText = async () => { const s = mkStore(); await seed(s); return JSON.stringify(await buildExport(s)); };
const expectCode = (text, code, opts) => assert.rejects(parseBackup(text, opts), (e) => e instanceof BackupError && e.code === code, `attendu ${code}`);

test('Import corrompu : vide, JSON tronqué, mauvais format, mauvaise structure', async () => {
  await expectCode('', 'not-json');
  const good = await goodText();
  await expectCode(good.slice(0, good.length - 40), 'not-json');
  await expectCode('{"format":"autre","version":1,"data":{}}', 'bad-format');
  await expectCode('[1,2,3]', 'bad-format');
  await expectCode(JSON.stringify({ format: 'linguacoach-backup', version: 'x', data: {} }), 'bad-format');
  await expectCode(JSON.stringify({ format: 'linguacoach-backup', version: 1 }), 'bad-format');
});
test('Import : somme de contrôle — toute modification des données est détectée', async () => {
  const j = JSON.parse(await goodText());
  j.data.conversations[0].messages[0].content = 'altéré';
  await expectCode(JSON.stringify(j), 'checksum');
});
test('Import : version plus récente refusée', async () => {
  const j = JSON.parse(await goodText()); j.version = BACKUP_VERSION + 1;
  await expectCode(JSON.stringify(j), 'too-new');
});
test('Import : validation stricte des enregistrements (sans somme de contrôle, pour tester le schéma)', async () => {
  const base = JSON.parse(await goodText()); delete base.checksum;
  const mutate = (fn) => { const j = structuredClone(base); fn(j.data); return JSON.stringify(j); };
  await expectCode(mutate((d) => { d.activities[0].skill = 'danse'; }), 'invalid-record');
  await expectCode(mutate((d) => { d.activities[0].score = { correct: 9, total: 3 }; }), 'invalid-record');
  await expectCode(mutate((d) => { d.activities[0].ts = 'hier'; }), 'invalid-record');
  await expectCode(mutate((d) => { d.conversations[0].messages[0].role = 'system'; }), 'invalid-record');
  await expectCode(mutate((d) => { d.conversations = 'oops'; }), 'invalid-record');
  await expectCode(mutate((d) => { d.conversations.push(structuredClone(d.conversations[0])); }), 'invalid-record');
  await expectCode(mutate((d) => { d.vocab[0].due = null; }), 'invalid-record');
  await expectCode(mutate((d) => { d.errors[0] = 42; }), 'invalid-record');
});
test('Import : champs inconnus ignorés, préférences assainies, aucune clé injectable', async () => {
  const j = JSON.parse(await goodText()); delete j.checksum;
  j.data.prefs.apiKey = KEY_A; j.data.prefs.level = 'ZZ'; j.data.vocab[0].__proto__x = 'x'; j.data.vocab[0].evil = '<img onerror=alert(1)>';
  const p = await parseBackup(JSON.stringify(j));
  assert.equal(p.data.prefs.level, 'B1'); assert.ok(!JSON.stringify(p.data).includes(KEY_A)); assert.ok(!('evil' in p.data.vocab[0]));
});
test('Import : échec d\'écriture → état précédent restauré (pas de corruption)', async () => {
  const good = await parseBackup(await goodText());
  const s = mkStore(); await seed(s);
  const before = { conv: await s.all('conversations'), vocab: await s.all('vocab'), prefs: s.getPrefs(), keys: s.getKeys() };
  let n = 0; const real = s.backend.bulkPut.bind(s.backend);
  s.backend.bulkPut = async (c, arr) => { if (c === 'activities' && n++ === 0) throw new Error('disque plein'); return real(c, arr); };
  await assert.rejects(importBackup(s, good, { mode: 'replace' }), (e) => e.code === 'write-failed');
  assert.deepEqual(await s.all('conversations'), before.conv); assert.deepEqual(await s.all('vocab'), before.vocab);
  assert.deepEqual(s.getPrefs(), before.prefs); assert.deepEqual(s.getKeys(), before.keys);
});

/* ---------------- Migrations ---------------- */
test('Migrations : enchaînement v1→v2→v3, données transformées', () => {
  const migs = { 1: (d) => ({ ...d, vocab: d.vocab.map((c) => ({ ...c, tags: [] })) }), 2: (d) => ({ ...d, renamed: true }) };
  const out = migrate({ vocab: [{ id: 'a' }] }, 1, { migrations: migs, target: 3 });
  assert.deepEqual(out, { vocab: [{ id: 'a', tags: [] }], renamed: true });
  assert.deepEqual(migrate({ x: 1 }, 3, { migrations: migs, target: 3 }), { x: 1 });
});
test('Migrations : migration manquante → erreur explicite ; migration appliquée avant validation via parseBackup', async () => {
  assert.throws(() => migrate({}, 1, { migrations: {}, target: 2 }), (e) => e.code === 'no-migration');
  // Sauvegarde « v0 » fictive : l'ancien champ `exercises` devient `activities`.
  const legacy = { format: 'linguacoach-backup', version: 1, data: { prefs: {}, conversations: [], exercises: [{ id: 'x1', ts: 5, skill: 'writing', type: 'message' }], vocab: [], errors: [] } };
  const migrations = { 1: (d) => { const { exercises, ...rest } = d; return { ...rest, activities: exercises }; } };
  const p = await parseBackup(JSON.stringify(legacy), { migrations, targetVersion: 2 });
  assert.equal(p.migrated, true); assert.equal(p.counts.activities, 1);
});

/* ---------------- Rappel de sauvegarde ---------------- */
test('Rappel de sauvegarde : seulement s\'il y a des données et que le délai est dépassé', () => {
  const now = 100 * 86400000;
  assert.equal(backupReminderDue({ lastBackupAt: 0, backupReminderDays: 7 }, false, now), false);
  assert.equal(backupReminderDue({ lastBackupAt: 0, backupReminderDays: 7 }, true, now), true);
  assert.equal(backupReminderDue({ lastBackupAt: now - 2 * 86400000, backupReminderDays: 7 }, true, now), false);
  assert.equal(backupReminderDue({ lastBackupAt: now - 8 * 86400000, backupReminderDays: 7 }, true, now), true);
  assert.equal(backupReminderDue({ lastBackupAt: 0, backupReminderDays: 0 }, true, now), false);
});
test('Suppression totale des données', async () => {
  const s = mkStore(); await seed(s);
  await s.clearAllData();
  assert.equal((await s.all('conversations')).length, 0); assert.deepEqual(s.getKeys(), { primary: '', fallback: '' }); assert.equal(s.getPrefs().level, 'B1');
});
