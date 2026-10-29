/**
 * Vérifications de bout en bout dans un vrai Chromium (Playwright). Lancement :
 *   python3 -m http.server 8080 &   puis   node tests/e2e/smoke.mjs  [AXE_PATH]
 * Les API IA sont SIMULÉES (page.route) : aucun appel réel, aucune clé réelle.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:8080/';
const AXE = process.argv[2] ?? process.env.AXE_PATH;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
async function newCtx(opts = {}, { noSpeech = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true, permissions: [], ...opts });
  if (noSpeech) await ctx.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  return ctx;
}
const track = (page) => { const errs = []; page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text())); return errs; };

/* ---- 1. Démarrage, navigation, aucune erreur ---- */
{
  const ctx = await newCtx(); const page = await ctx.newPage(); const errs = track(page);
  await page.goto(BASE + '?debug');
  await page.waitForSelector('#view h1');
  check('Accueil : se charge et affiche le titre', /Bonjour|Bonsoir/.test(await page.textContent('#view h1')));
  const navTexts = await page.$$eval('#nav a', (a) => a.map((x) => x.textContent.trim()));
  check('Navigation : 5 entrées fixes', JSON.stringify(navTexts) === JSON.stringify(['Accueil', 'Écriture', 'Écoute', 'Oral', 'Réglages']), navTexts.join(','));
  check('Accueil : message sans activité (aucune stat inventée)', (await page.textContent('#view')).includes('Aucune série en cours') && (await page.textContent('#view')).includes('0/3'));
  for (const r of ['writing', 'listening', 'speaking', 'settings', 'review', 'home']) {
    await page.goto(BASE + `?debug#/${r}`); await page.waitForSelector('#view h1'); await page.waitForTimeout(150);
  }
  check('Toutes les routes s\'affichent sans erreur JS/console', errs.length === 0, errs.join(' | '));
  await page.screenshot({ path: process.env.SHOTS + '/home-mobile.png', fullPage: true }).catch(() => {});
  await ctx.close();
}

/* ---- 2. Écoute locale : transcription, quiz, score local, activité, série ---- */
{
  const ctx = await newCtx(); const page = await ctx.newPage(); const errs = track(page);
  await page.goto(BASE + '?debug#/listening'); await page.waitForSelector('#view h1');
  const status = await page.textContent('#view .banner');
  check('Écoute : état de la voix affiché honnêtement', /Voix utilisée|Aucune voix|Repli/.test(status), status.slice(0, 90));
  check('Écoute : transcription masquée par défaut', (await page.$('.transcript')) === null);
  await page.click('text=Afficher la transcription'); check('Écoute : transcription affichable', (await page.$('.transcript')) !== null);
  const nq = await page.$$eval('fieldset.question', (f) => f.length);
  for (let i = 0; i < nq; i++) await page.locator('fieldset.question').nth(i).locator('input[type=radio]').first().check();
  await page.click('button:has-text("Vérifier")');
  const score = await page.textContent('.score'); check('Écoute : score calculé localement', /Score : \d sur \d/.test(score) && score.includes('localement'), score);
  await page.goto(BASE + '?debug#/home'); await page.waitForSelector('.ring-text');
  check('Accueil : l\'activité réelle alimente objectif (1/3) et série (1)', (await page.textContent('.ring-text')) === '1/3' && (await page.textContent('.streak .big')).trim() === '1');
  check('Accueil : activité récente listée avec score local', (await page.textContent('#view')).includes('correct(s)'));
  await page.goto(BASE + '?debug#/listening'); await page.selectOption('#l-topic', 'travel');
  await page.click('button.seg-btn:has-text("Phrase")'); await page.check('#l-dictmode');
  const phrase = await page.evaluate(() => document.querySelector('h2')?.textContent);
  await page.click('text=Afficher la transcription'); const text = (await page.textContent('.transcript')).trim();
  await page.fill('#l-dict', text.replace(/\w+$/, 'xxx')); await page.click('.dictation button:has-text("Vérifier")');
  check('Écoute : dictée comparée mot à mot', /Mots corrects : \d+ sur \d+/.test(await page.textContent('.dictation [role=status]')));
  check('Écoute : aucune erreur JS', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ---- 3. Expression orale : reconnaissance vocale INDISPONIBLE ---- */
{
  const ctx = await newCtx(); const page = await ctx.newPage(); const errs = track(page);
  await page.goto(BASE + '?debug#/speaking'); await page.waitForSelector('#view h1');
  const t = await page.textContent('#view');
  check('Oral sans reconnaissance : message clair', t.includes('reconnaissance vocale n\'est pas disponible'));
  check('Oral sans reconnaissance : phrase modèle + écoute disponibles', t.includes('Phrase modèle') && t.includes('Écouter'));
  check('Oral : aucune erreur JS', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
/* ---- 3b. Oral avec reconnaissance simulée (API présente) ---- */
{
  const ctx = await newCtx({}, { noSpeech: false });
  await ctx.addInitScript(() => {
    class FakeSR { start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: Object.assign([Object.assign([{ transcript: window.__said ?? 'hello', confidence: 0.9 }], { isFinal: true })], {}) }); }, 50); }
      stop() { setTimeout(() => this.onend?.(), 30); } abort() {} }
    window.SpeechRecognition = FakeSR; window.__said = 'I wake up at seven and drink a cup of coffee';
  });
  const page = await ctx.newPage(); const errs = track(page);
  await page.goto(BASE + '?debug#/speaking'); await page.waitForSelector('#view h1');
  // phrase A1 « I wake up at seven and drink a cup of tea. » : on choisit ce thème/niveau
  await page.evaluate(() => window.__lc.ctx.setPrefs({ level: 'A1', topic: 'daily' })); await page.goto(BASE + '?debug#/home'); await page.goto(BASE + '?debug#/speaking'); await page.waitForSelector('.big-text');
  await page.evaluate(() => { window.__said = 'I wake up at seven and drink a cup of coffee'; });
  await page.click('button:has-text("Enregistrer")'); await page.waitForSelector('button:has-text("Arrêter")'); await page.click('button:has-text("Arrêter")');
  await page.waitForSelector('text=Reconnaissance des mots');
  const r = await page.textContent('#view');
  check('Oral (reconnaissance simulée) : comparaison attendu/reconnu affichée', /Mots attendus retrouvés : 10 sur 11/.test(r), (r.match(/Mots attendus[^.]*\./) ?? [''])[0]);
  check('Oral : avertissement « pas un score de prononciation »', r.includes('pas la qualité de votre prononciation'));
  check('Oral : sans IA configurée, aucun bouton d\'analyse IA', !r.includes('Conseils de l\'IA'));
  check('Oral (simulé) : aucune erreur JS', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ---- 4. Écriture sans IA ; puis avec IA simulée en flux (OpenAI), consentement, parsing, activité ---- */
{
  const ctx = await newCtx(); const page = await ctx.newPage(); const errs = track(page);
  let apiCalls = 0, lastBody = null, lastHeaders = null;
  await page.route('https://api.openai.com/**', async (route) => {
    apiCalls++; lastBody = JSON.parse(route.request().postData()); lastHeaders = route.request().headers();
    const md = '### CORRECTED\nI went to the cinema.\n### NATURAL\nI went to the movies.\n### EXPLANATION\n- Passé irrégulier.\n### ERRORS\nverb | I goed -> I went | irrégulier\n### VOCAB\ncinema | cinéma\n### REPLY\nSounds fun!\n### FOLLOWUP\nWhat did you watch?';
    const parts = md.match(/[\s\S]{1,20}/g).map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: parts });
  });
  await page.goto(BASE + '?debug#/writing'); await page.waitForSelector('#view h1');
  check('Écriture sans IA : envoi désactivé + explication + sujets locaux', await page.isDisabled('#w-input') && (await page.textContent('#view')).includes('nécessite un fournisseur IA') && (await page.textContent('#view')).includes('Sujets d\'écriture'));
  await page.goto(BASE + '?debug#/settings'); await page.waitForSelector('#ai-primary-prov');
  await page.selectOption('#ai-primary-prov', 'openai');
  await page.fill('#ai-primary-model', 'test-model'); await page.dispatchEvent('#ai-primary-model', 'change');
  await page.fill('#ai-primary-key', 'sk-test-FAKEFAKEFAKEFAKEFAKE'); await page.dispatchEvent('#ai-primary-key', 'change');
  await page.goto(BASE + '?debug#/writing'); await page.waitForSelector('#w-input:not([disabled])');
  await page.fill('#w-input', 'Yesterday I goed to the cinema.'); await page.click('button:has-text("Envoyer")');
  await page.waitForSelector('dialog[open]');
  check('Écriture : consentement demandé AVANT tout envoi', apiCalls === 0 && (await page.textContent('dialog')).includes('OpenAI'));
  await page.click('dialog button:has-text("Annuler")'); await page.waitForTimeout(200);
  check('Écriture : refus du consentement → rien n\'est transmis', apiCalls === 0);
  check('Écriture : après refus, le message reste et « Réessayer » est proposé', (await page.$('.msg-user')) !== null && (await page.$('.banner-error button:has-text("Réessayer")')) !== null);
  await page.click('.banner-error button:has-text("Réessayer")'); await page.click('dialog button:has-text("Autoriser et envoyer")');
  await page.waitForSelector('.msg-ai h3:has-text("Correction")', { timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector('.msg-ai .spinner'), null, { timeout: 8000 });
  const txt = await page.textContent('.chat');
  check('Écriture : réponse en flux analysée en sections (correction, naturel, erreurs, vocab, relance)', ['I went to the cinema.', 'I went to the movies.', 'I goed -> I went', 'cinema', 'What did you watch?'].every((s) => txt.includes(s)));
  check('Écriture : requête OpenAI conforme (Bearer, stream, modèle configuré, consignes avec niveau/accent/thème)',
    lastHeaders.authorization === 'Bearer sk-test-FAKEFAKEFAKEFAKEFAKE' && lastBody.stream === true && lastBody.model === 'test-model' && lastBody.messages[0].content.includes('B1') && lastBody.messages[0].content.includes('en-US') && lastBody.messages[0].content.includes('everyday life'));
  await page.click('button:has-text("Mémoriser")'); await page.click('button:has-text("Ajouter")');
  const counts = await page.evaluate(async () => ({ e: (await window.__lc.ctx.store.all('errors')).length, v: (await window.__lc.ctx.store.all('vocab')).length, a: (await window.__lc.ctx.store.all('activities')).filter((x) => x.skill === 'writing').length, c: (await window.__lc.ctx.store.all('conversations')).length }));
  check('Écriture : erreur mémorisée, vocabulaire ajouté, activité et conversation enregistrées', counts.e === 1 && counts.v === 1 && counts.a === 1 && counts.c === 1, JSON.stringify(counts));
  // pas de nouveau consentement au 2e message
  await page.fill('#w-input', 'Second message.'); await page.click('button:has-text("Envoyer")'); await page.waitForFunction(() => document.querySelectorAll('.msg-ai').length >= 2, null, { timeout: 8000 });
  check('Écriture : consentement mémorisé (pas de 2e dialogue)', (await page.$('dialog[open]')) === null && apiCalls === 2);
  // erreurs : clé invalide
  await page.route('https://api.openai.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 'invalid_api_key', message: 'Incorrect API key provided: sk-test-FAKEFAKEFAKEFAKEFAKE' } }) }));
  await page.fill('#w-input', 'Third.'); await page.click('button:has-text("Envoyer")'); await page.waitForSelector('.banner-error');
  const err = await page.textContent('.banner-error');
  check('Écriture : clé invalide → message clair, clé NON affichée, lien vers les réglages', err.includes('Clé API refusée') && !err.includes('FAKEFAKE') && (await page.$('.banner-error a[href="#/settings"]')) !== null, err.slice(0, 120));
  check('Écriture : aucune erreur JS', errs.filter((e) => !/401/.test(e)).length === 0, errs.join(' | '));
  // la clé n'est pas dans les préférences ni dans un export
  const leak = await page.evaluate(() => localStorage.getItem('lc.prefs').includes('FAKEFAKE'));
  check('Stockage : clé hors des préférences', leak === false);
  // test de connexion depuis les réglages + export sans clé
  await page.goto(BASE + '?debug#/settings'); await page.waitForSelector('#ai-primary-prov');
  await page.route('https://api.openai.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) }));
  await page.click('button:has-text("Tester")'); await page.waitForSelector('.ok-text');
  check('Réglages : bouton Tester → succès affiché', (await page.textContent('.ok-text')).includes('Connexion réussie'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exporter (JSON)")')]);
  const exported = fs.readFileSync(await dl.path(), 'utf8');
  check('Export JSON : valide, sans clé API', exported.includes('linguacoach-backup') && !exported.includes('FAKEFAKE') && JSON.parse(exported).data.conversations.length === 1);
  // import corrompu
  await page.setInputFiles('#imp', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(exported.slice(0, 200)) });
  await page.waitForSelector('.toast-error'); check('Import corrompu : refusé avec message clair', (await page.textContent('.toast-error')).includes('pas un JSON valide'));
  // import valide (fusion)
  await page.setInputFiles('#imp', { name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await page.waitForSelector('dialog[open] select'); await page.click('dialog button:has-text("Importer")');
  await page.waitForSelector('.toast:has-text("Import terminé")', { timeout: 8000 }).then(() => check('Import valide (fusion) : réussi', true), () => check('Import valide (fusion) : réussi', false, 'toast absent'));
  await ctx.close();
}

/* ---- 5. Bascule principal → secours dans le navigateur ---- */
{
  const ctx = await newCtx(); const page = await ctx.newPage(); const errs = track(page);
  const seen = [];
  await page.route('https://api.openai.com/**', (r) => { seen.push('openai'); r.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'retry-after': '0' }, body: '{"error":{"message":"down"}}' }); });
  await page.route('https://generativelanguage.googleapis.com/**', (r) => { seen.push('gemini'); r.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': '*' }, body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '### REPLY\nFallback answer' }] }, finishReason: 'STOP' }] })}\n\n` }); });
  await page.goto(BASE + '?debug'); await page.waitForSelector('#view h1');
  await page.evaluate(() => { const c = window.__lc.ctx; c.setPrefs({ aiConsent: { openai: true, gemini: true }, ai: { primary: { provider: 'openai', model: 'm' }, fallback: { enabled: true, provider: 'gemini', model: 'g' } } }); c.store.setKey('primary', 'sk-test-AAAAAAAAAAAAAAAAAAAA'); c.store.setKey('fallback', 'AIzaFAKEFAKEFAKEFAKEFAKEFAKE'); });
  await page.goto(BASE + '?debug#/writing'); await page.waitForSelector('#w-input:not([disabled])');
  await page.fill('#w-input', 'Hello coach'); await page.click('button:has-text("Envoyer")');
  await page.waitForSelector('.msg-ai:has-text("Fallback answer")', { timeout: 20000 });
  check('Bascule dans le navigateur : 3 essais OpenAI puis Gemini, réponse affichée', seen.filter((s) => s === 'openai').length === 3 && seen.includes('gemini'), seen.join(','));
  check('Bascule : l\'utilisateur est informé (toast)', (await page.$$eval('.toast', (t) => t.map((x) => x.textContent).join('|'))).includes('bascule'));
  await ctx.close();
}

/* ---- 6. PWA : service worker, hors ligne ---- */
{
  const ctx = await newCtx(); const page = await ctx.newPage(); const errs = track(page);
  await page.goto(BASE + '?debug'); await page.waitForSelector('#view h1');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
  const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[0]); return { keys, n: (await c.keys()).length }; });
  check('PWA : service worker actif, cache versionné rempli', cached.keys.length === 1 && cached.keys[0].startsWith('linguacoach-') && cached.n >= 40, JSON.stringify(cached));
  const manifest = await (await page.request.get(BASE + 'manifest.webmanifest')).json();
  check('PWA : manifest servi', manifest.name === 'LinguaCoach');
  await page.reload(); await page.waitForSelector('#view h1');  // contrôlé par le SW
  await ctx.setOffline(true);
  await page.goto(BASE + '?debug#/listening'); await page.reload(); await page.waitForSelector('#view h1', { timeout: 8000 });
  check('Hors ligne : l\'application se recharge depuis le cache', (await page.textContent('#view h1')).includes('Écoute'));
  check('Hors ligne : indicateur affiché', await page.isVisible('#offline-pill'));
  await page.click('text=Afficher la transcription'); check('Hors ligne : exercice d\'écoute local fonctionnel', (await page.$('.transcript')) !== null);
  await page.goto(BASE + '?debug#/writing'); await page.reload(); await page.waitForSelector('#view h1');
  check('Hors ligne : écran d\'écriture (sujets locaux) accessible', (await page.textContent('#view')).includes('Sujets d\'écriture'));
  // appel IA hors ligne → erreur réseau claire
  await page.evaluate(() => { const c = window.__lc.ctx; c.setPrefs({ aiConsent: { openai: true }, ai: { primary: { provider: 'openai', model: 'm' } } }); c.store.setKey('primary', 'sk-test-AAAAAAAAAAAAAAAAAAAA'); });
  await page.goto(BASE + '?debug#/home'); await page.goto(BASE + '?debug#/writing'); await page.waitForSelector('#w-input:not([disabled])');
  await page.fill('#w-input', 'offline test'); await page.click('button:has-text("Envoyer")'); await page.waitForSelector('.banner-error', { timeout: 20000 });
  check('Hors ligne : appel IA → erreur réseau claire (avec bouton Réessayer)', (await page.textContent('.banner-error')).includes('Connexion impossible') && (await page.$('.banner-error button:has-text("Réessayer")')) !== null);
  await ctx.setOffline(false);
  const swSrc = await (await page.request.get(BASE + 'sw.js')).text();
  check('Service worker : ne met pas en cache les requêtes cross-origin/non-GET', /origin !== self\.location\.origin/.test(swSrc));
  await ctx.close();
}

/* ---- 7. Accessibilité axe-core : voir tests/e2e/a11y.mjs (script séparé) ---- */

/* ---- 8. Clavier : navigation et focus visibles ---- */
{
  const ctx = await newCtx(); const page = await ctx.newPage();
  await page.goto(BASE + '?debug'); await page.waitForSelector('#view h1');
  await page.keyboard.press('Tab'); check('Clavier : le lien « Aller au contenu » reçoit le focus en premier', await page.evaluate(() => document.activeElement.id === 'skip'));
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('Clavier : changement de page déplace le focus sur le titre', await (async () => { await page.goto(BASE + '?debug#/settings'); await page.waitForSelector('#view h1'); await page.waitForTimeout(100); return page.evaluate(() => document.activeElement.tagName === 'H1'); })());
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
fs.writeFileSync(process.env.OUT ?? '/tmp/e2e-results.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
