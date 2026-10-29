/**
 * sw.js — Service worker de LinguaCoach.
 *
 * Stratégie :
 *  - Précache de tout l'« app shell » (liste ci-dessous, vérifiée par un test) dans un cache versionné.
 *  - Même origine, GET : cache d'abord (rapide, hors ligne) ; les navigations retombent sur index.html.
 *  - Mises à jour : un nouveau sw.js s'installe en attente ; la page propose « Mettre à jour » (SKIP_WAITING),
 *    puis recharge pour éviter tout mélange de versions. Les anciens caches sont supprimés à l'activation.
 *  - Tout ce qui n'est pas de même origine (API IA, etc.) et toute requête non-GET passent DIRECTEMENT au réseau :
 *    aucune réponse d'API, aucune clé et aucune donnée privée n'est jamais mise en cache.
 *
 * Pour publier une nouvelle version : modifier VERSION (et la liste si des fichiers changent).
 */
const VERSION = '1.0.0';
const CACHE = `linguacoach-${VERSION}`;
const PRECACHE = [
  './',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/icon.svg',
  'css/style.css',
  'index.html',
  'js/ai/ai-manager.js',
  'js/ai/errors.js',
  'js/ai/fallback.js',
  'js/ai/http.js',
  'js/ai/prompts.js',
  'js/ai/providers/anthropic.js',
  'js/ai/providers/custom.js',
  'js/ai/providers/gemini.js',
  'js/ai/providers/index.js',
  'js/ai/providers/openai.js',
  'js/app.js',
  'js/audio.js',
  'js/backup.js',
  'js/config.js',
  'js/content/en.js',
  'js/content/index.js',
  'js/i18n.js',
  'js/install.js',
  'js/locales/en.js',
  'js/locales/fr.js',
  'js/modules/home.js',
  'js/modules/listening.js',
  'js/modules/review.js',
  'js/modules/settings.js',
  'js/modules/speaking.js',
  'js/modules/writing.js',
  'js/progress.js',
  'js/speech.js',
  'js/storage.js',
  'js/text-compare.js',
  'js/ui.js',
  'js/utils.js',
  'manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('linguacoach-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // réseau direct, sans cache
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});
