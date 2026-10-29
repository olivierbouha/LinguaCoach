/** Audit d'accessibilité axe-core (WCAG 2.1 A/AA + bonnes pratiques) sur les 6 écrans, thèmes clair et sombre.
 *  node tests/e2e/a11y.mjs <chemin/axe.min.js> */
import { createRequire } from 'node:module'; import fs from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:8080/';
const axeSrc = fs.readFileSync(process.argv[2], 'utf8');
const b = await chromium.launch(); let total = 0;
for (const theme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, colorScheme: theme, bypassCSP: true }); // bypassCSP : seulement pour injecter axe
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.goto(BASE + '?debug'); await page.waitForSelector('#view h1');
  await page.evaluate((t) => window.__lc.ctx.setPrefs({ theme: t }), theme);
  await page.evaluate(async () => { await window.__lc.ctx.logActivity({ skill: 'listening', type: 'story', score: { correct: 1, total: 2 } }); });
  for (const r of ['home', 'writing', 'listening', 'speaking', 'settings', 'review']) {
    await page.goto(`${BASE}?debug#/${r}`); await page.waitForSelector('#view h1'); await page.waitForTimeout(300);
    await page.evaluate(axeSrc);
    const res = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }));
    total += res.violations.length;
    console.log(`${res.violations.length === 0 ? 'PASS' : 'FAIL'}  axe [${theme}] ${r} : ${res.violations.length} violation(s)`, res.violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(' ')}`).join(' ;; '));
  }
  await ctx.close();
}
await b.close(); process.exit(total ? 1 : 0);
