# LinguaCoach

PWA de coaching linguistique (**anglais** et **néerlandais**, NL/BE) avec des agents IA : **écriture**, **écoute**, **expression orale** et **conversation orale** (v1.1).
HTML / CSS / JavaScript modernes (modules ES), **sans framework, sans étape de build**, déployable sur n'importe quel hébergement statique HTTPS.

> **Statut honnête** : le code, les tests automatisés et les vérifications dans Chromium sont réels (voir « Tests »).
> **Non vérifié** : appels aux vraies API (aucune clé n'était disponible ici), voix/reconnaissance vocale réelles sur smartphone, Safari/iOS, Firefox. Voir « Limites connues ».

---

## 1. Lancer en local

Prérequis : un navigateur récent ; Node ≥ 20 uniquement pour les tests.

```bash
cd linguacoach
python3 -m http.server 8080      # ou : npm start
# ouvrir http://localhost:8080
```

`localhost` est considéré comme « sécurisé » par les navigateurs : service worker, micro et installation PWA fonctionnent.
Sur smartphone, `http://IP-de-l-ordinateur:8080` ne permet **pas** le micro ni le service worker (pas de HTTPS) : utilisez un tunnel HTTPS (ex. `cloudflared tunnel --url http://localhost:8080`) ou déployez (§ 6).

## 2. Structure

```
index.html · manifest.webmanifest · sw.js · css/style.css · assets/icons/
js/
  app.js            démarrage, contexte partagé, routeur (#/home …), consentement IA, PWA
  config.js         langues/accents, thèmes, profils, niveaux, préférences par défaut (registres extensibles)
  storage.js        IndexedDB (+ repli mémoire), préférences (localStorage), clés API (stockage séparé)
  backup.js         export/import JSON : version, somme de contrôle, migrations, fusion/remplacement, chiffrement optionnel
  progress.js       objectifs, série, précision locale, difficulté progressive, répétition espacée (SM-2 simplifié)
  speech.js         SpeechSynthesis (choix de voix honnête) + SpeechRecognition (repli)
  audio.js          enregistrement MediaRecorder + conversion WAV 16 kHz
  text-compare.js   comparaison mot à mot (dictée, reconnaissance)
  i18n.js · locales/{fr,en}.js    interface (français par défaut)
  ui.js · install.js
  ai/
    ai-manager.js   gestionnaire IA indépendant des modules pédagogiques
    fallback.js     retries (backoff exponentiel + jitter, Retry-After) 
    errors.js · http.js   erreurs normalisées, timeouts, annulation, SSE
    prompts.js      consignes dynamiques (thème, niveau, accent, langue maternelle, objectifs, correction, profil) + analyse des réponses
    providers/      gemini.js · openai.js · anthropic.js · custom.js · index.js (registre)
  content/          bibliothèque locale d'exercices (en.js) + sélection par thème/niveau/accent
  modules/          home · writing · listening · speaking · review · settings
tests/              tests unitaires (node:test) + tests navigateur (Playwright)
```

### Étendre
- **Nouvelle langue** : entrée dans `LANGUAGES` (`config.js`, avec ses codes BCP-47) + `js/content/<code>.js` (mêmes exports que `en.js`) + enregistrement dans `content/index.js`. Le code BCP-47 choisi pilote la synthèse, la reconnaissance, les consignes IA et les exemples.
- **Nouvel accent** : une entrée dans `accents` + éventuellement une colonne dans `LEXICON` (`{lift}` → *elevator* / *lift*).
- **Nouveau profil pédagogique** : `PROFILES` (`config.js`) + texte dans `PROFILE_TEXT` (`ai/prompts.js`). Le profil est indépendant du fournisseur et du modèle.
- **Nouveau fournisseur** : un adaptateur dans `ai/providers/` (méthodes `complete`, `listModels`, `capabilities`), à enregistrer dans `providers/index.js` et `PROVIDER_IDS`.
- **Nouvelle langue d'interface** : `js/locales/<code>.js` + `UI_LANGS` (les clés manquantes retombent sur le français ; l'anglais est volontairement partiel).

## 3. Configurer les fournisseurs IA

L'application reste **entièrement utilisable sans clé** pour l'écoute, l'expression orale (comparaison de texte), la révision et la progression. L'IA ajoute : correction d'écriture, exercices d'écoute générés, conseils d'oral.

Réglages › Intelligence artificielle : fournisseur, **modèle** (aucun n'est codé en dur : saisissez-le ou cliquez *Lister les modèles*), clé, bouton **Tester**, et un **fournisseur de secours** facultatif.

| Fournisseur | Où obtenir une clé | Protocole utilisé | Notes |
|---|---|---|---|
| Google Gemini | Google AI Studio | `POST /v1beta/models/{modèle}:generateContent` (flux : `:streamGenerateContent?alt=sse`), en-tête `x-goog-api-key` | Seul fournisseur prévu pour l'**audio** (WAV en `inlineData`) |
| OpenAI | platform.openai.com | `POST /v1/chat/completions` (SSE), `Authorization: Bearer` | `max_completion_tokens`, pas de température imposée |
| Anthropic | console.anthropic.com | `POST /v1/messages` (SSE), `x-api-key` + `anthropic-version: 2023-06-01` + `anthropic-dangerous-direct-browser-access: true` (requis pour les appels directs depuis un navigateur) | Pas d'audio |
| Personnalisé | — | « OpenAI Chat Completions » uniquement (`{URL}/chat/completions`) | URL obligatoire, clé facultative (Ollama, LM Studio…). Le serveur doit autoriser le CORS ; un site HTTPS ne peut pas appeler un `http://` non local |

Les adaptateurs ont été écrits d'après la documentation officielle consultée pendant le développement (en-têtes, endpoints, événements SSE). Les API évoluent : en cas d'erreur de validation, vérifiez le nom du modèle (bouton *Lister les modèles*) puis la documentation du fournisseur.

### Bascule automatique (secours)
- Nouvelles tentatives (3 pour le principal, 2 pour le secours) avec backoff exponentiel plafonné + jitter ; `Retry-After` respecté (au-delà de 30 s : pas d'attente, bascule directe).
- Retry : seulement `429`, `5xx/529`, réseau. Bascule : ces cas + quota épuisé + délai dépassé.
- **Jamais** de retry ni de bascule pour : clé invalide, requête rejetée, refus de contenu, réponse vide, annulation.
- Si le flux a déjà commencé à s'afficher, pas de relance automatique (pas de doublon ni de double facturation) : l'erreur propose *Réessayer*.
- Une seule requête à la fois (anti double soumission). Le secours doit être complet, différent du principal et compatible (ex. pas de secours sans audio pour une analyse audio).
- Le contexte et la question sont conservés ; l'utilisateur est informé par une notification.

## 4. Sécurité et confidentialité

- **Une clé API stockée dans le navigateur n'est pas un secret sécurisé** (extensions, appareil partagé, scripts injectés). L'application le dit dans les réglages. Utilisez des clés à dépense plafonnée et ne les saisissez jamais sur un appareil non maîtrisé. Option « session seulement » pour effacer les clés à la fermeture de l'onglet.
- Aucune clé dans le code source ; les clés sont stockées à part des préférences, **jamais dans l'export JSON par défaut**. Export avec clés : option explicite, chiffrée (AES-GCM, clé dérivée PBKDF2-SHA256 250 000 itérations) avec une phrase secrète que vous choisissez et qui n'est stockée nulle part.
- Les clés sont masquées dans les messages d'erreur et ne sont jamais envoyées dans l'URL (Gemini : en-tête). Requêtes IA : `credentials: omit`, `referrerPolicy: no-referrer`, `cache: no-store`.
- **Consentement** : le premier envoi de texte à un fournisseur demande une autorisation (révocable). L'envoi **audio** redemande un consentement détaillé **à chaque fois** (taille, contenu, fournisseur). L'audio reste en mémoire, jamais écrit sur disque, supprimable à tout moment et libéré en quittant l'écran.
- Reconnaissance vocale : fournie par le navigateur ; selon le navigateur, l'audio peut être traité par un service en ligne (Chrome/Safari). C'est indiqué dans l'écran Oral.
- Contenu IA/importé : jamais interprété comme du HTML (construction DOM, pas de `innerHTML` — vérifié par un test). Politique CSP stricte (`script-src 'self'`).
- Service worker : ne met jamais en cache les requêtes cross-origin (API IA) ni non-GET.

### Version publique (sans serveur : limites)
Sans serveur, chaque utilisateur doit fournir sa propre clé, qui transite par son navigateur ; il n'y a pas d'authentification, pas de limitation de débit, pas de contrôle des coûts. Pour une diffusion publique, architecture recommandée (non incluse) :

```
Navigateur ──HTTPS──▶ Backend léger (Cloudflare Worker / Cloud Run / Node)
                       ├─ authentification (OIDC / sessions)       ├─ clés API en secrets serveur
                       ├─ quotas et limitation de débit par utilisateur ├─ journalisation sans contenu sensible
                       └─ proxy vers Gemini/OpenAI/Anthropic (SSE relayé)
```
Il suffirait d'ajouter un adaptateur `custom` pointant vers ce backend (même protocole « OpenAI Chat Completions ») : l'interface et le gestionnaire IA n'ont pas à changer.

## 5. Voix, reconnaissance et expression orale

- `pickVoice` cherche une voix **exacte** (`en-AU`), sinon de la même langue, sinon aucune. L'écran affiche la voix réellement utilisée et prévient en cas de repli : **aucun accent n'est jamais garanti**.
- Expression orale : l'écran distingue (1) la **reconnaissance des mots** (comparaison de texte, calculée localement, *pas* un score de prononciation), (2) les avis qualitatifs de l'IA sur l'intelligibilité, la prononciation, l'accentuation et le rythme, présentés comme **estimations** sans note chiffrée ; à partir d'une simple transcription, l'IA doit dire qu'elle ne peut pas juger prononciation/accent/rythme.
- Sans `SpeechRecognition` (Firefox…), l'enregistrement MediaRecorder permet de se réécouter et de comparer à l'oreille.
- Analyse audio par IA : conversion en WAV 16 kHz mono, envoi uniquement à un fournisseur déclarant `audioInput` (Gemini ici), après consentement.

### Conversation orale (onglet « Parler », v1.1)

- Vous parlez (reconnaissance vocale du navigateur, dans la langue/variante choisie), l'IA répond en streaming et sa réponse est **lue à voix haute phrase par phrase** dès qu'elle arrive. Option mains libres (réécoute automatique après la réponse), envoi automatique, affichage du texte facultatif, saisie clavier de repli.
- L'IA reçoit **uniquement la transcription** (texte) : elle ne juge pas votre prononciation. Aucun audio n'est conservé. Le consentement avant envoi s'applique comme ailleurs.
- La consigne demande des réponses courtes sans markdown, des corrections implicites et un conseil facultatif `[TIP]` (affiché, jamais lu).
- Les conversations orales sont enregistrées localement (`kind: 'voice'`), exportées dans la sauvegarde, et séparées de celles de l'écriture.
- La reconnaissance est coupée pendant que l'IA parle (évite l'écho) ; avec haut-parleurs, un casque reste préférable.

### Néerlandais

Réglages › Apprentissage › Langue apprise. Variantes `nl-NL` et `nl-BE` (néerlandais standard flamand, pas de dialecte), lexique `{mobile}` → mobiel/gsm, friet/frieten, spoor/perron, broodje/pistolet. Contenu local : 25 phrases, 5 dialogues, 10 mini-histoires. Les consignes IA nomment la langue et la variante. Les voix `nl-BE`/`nl-NL` dépendent de l'appareil.

## 6. Déploiement HTTPS (hébergement statique)

Copier le dossier (sans `tests/`, `package.json`, `README.md` si l'on veut) sur : GitHub Pages, Netlify, Cloudflare Pages, Vercel, S3+CloudFront, nginx… HTTPS obligatoire (service worker, micro, installation).

- Servir `manifest.webmanifest` avec le type `application/manifest+json` (la plupart des hébergeurs le font).
- Déploiement dans un sous-dossier : tous les chemins sont relatifs ; `scope` et `start_url` du manifest sont `./`.
- **À chaque mise à jour des fichiers : incrémenter `VERSION` dans `sw.js`** (et ajouter les nouveaux fichiers à `PRECACHE` ; un test vérifie que la liste est complète). Les utilisateurs voient alors « Une nouvelle version est disponible » puis la page se recharge sur la nouvelle version (pas de mélange de versions).
- En-têtes recommandés côté hébergeur : `Content-Security-Policy` (déjà en `<meta>`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- **Je n'ai pas pu héberger l'application publiquement** depuis mon environnement : aucune URL publique n'est fournie.

## 7. Sauvegarde et restauration

Réglages › Données : export JSON (préférences non sensibles, conversations, activités, vocabulaire, erreurs), import avec **validation stricte** (format, version, somme de contrôle SHA-256, schéma de chaque enregistrement, doublons, tailles), **migrations** versionnées (`MIGRATIONS` dans `backup.js`, format actuel : 1), confirmation avant remplacement, **fusion** (le plus récent gagne, préférences locales conservées) ou remplacement, et **retour arrière automatique** si l'écriture échoue. Rappel de sauvegarde configurable (désactivé s'il n'y a aucune donnée).

## 8. Tests

```bash
npm test                                   # 106 tests unitaires/intégration (node:test, aucun réseau)
python3 -m http.server 8080 &              # puis, avec Playwright installé :
node tests/e2e/smoke.mjs                   # 59 vérifications dans Chromium (API IA simulées via page.route)
npm i axe-core && node tests/e2e/a11y.mjs node_modules/axe-core/axe.min.js   # audit axe-core, 14 vues (7 écrans × clair/sombre)
```

### Résultats réels (exécutés pendant le développement)

| Exigence | Vérification | Résultat |
|---|---|---|
| 1. Aucun fournisseur configuré | unitaire + navigateur (envoi désactivé, aucun appel réseau) | ✅ |
| 2-4. Gemini / OpenAI / Anthropic « fonctionnels » | **fetch simulé** : requêtes (URL, en-têtes, corps), réponses, flux SSE, listes de modèles conformes au protocole documenté | ✅ contrat simulé — ⚠️ **non testé contre les vraies API** (pas de clé) |
| 5. Principal indisponible | 503 → 3 essais (délais calculés) → bascule ; aussi dans Chromium | ✅ |
| 6. Secours indisponible | erreur finale, erreur d'origine jointe, 2 essais | ✅ |
| 7. Clé invalide | `auth` sans retry ni bascule ; clé absente des messages (aussi dans le navigateur) | ✅ |
| 8. Import JSON corrompu | vide, tronqué, mauvais format, somme de contrôle, version trop récente, enregistrements invalides, échec d'écriture avec restauration ; refus affiché dans Chromium | ✅ |
| 9. Mode hors ligne | Chromium hors ligne : rechargement depuis le cache, écoute locale, écran d'écriture, erreur réseau claire pour l'IA | ✅ |
| 10. Reconnaissance vocale indisponible | Chromium sans `SpeechRecognition` : message clair, phrase modèle disponible ; + cas « présente » simulé | ✅ |
| Autres | préférences (validation/assainissement), migrations, SSE fragmenté, timeouts/annulation/flux interrompu, anti double soumission, SM-2, série, lexique par accent, i18n complet, précache SW complet, aucune clé/`innerHTML`/modèle en dur dans le code | ✅ |
| Accessibilité | axe-core (WCAG 2.1 A/AA + bonnes pratiques) : 0 violation sur 6 écrans × clair/sombre ; clavier : lien d'évitement, focus sur le titre après navigation | ✅ (outil automatique : ne remplace pas un test avec lecteur d'écran) |

Des bugs réels trouvés et corrigés grâce à ces tests : lecture de flux muet non interruptible, bouton « Vérifier » bloqué, rechargement parasite au premier chargement (service worker), texte perdu après refus de consentement, rendus d'écrans concurrents qui s'écrasaient, contraste des liens en mode sombre.

### Tester sur mobile
1. Déployer en HTTPS (ou tunnel HTTPS), ouvrir sur le téléphone, *Ajouter à l'écran d'accueil*.
2. Réglages › Voix : vérifier la voix annoncée pour chaque accent ; Écoute : lecture, vitesse, réécoute.
3. Oral : autoriser le micro, enregistrer, vérifier la transcription (Chrome Android / Safari iOS).
4. Mode avion : relancer l'app installée ; l'écoute doit fonctionner, l'écriture afficher une erreur réseau claire.
5. Lecteur d'écran (TalkBack / VoiceOver) : parcourir la navigation, un exercice et une conversation.

## 9. Limites connues

- Pas testé avec de vraies clés ni contre les vraies API ; le streaming et les erreurs ont été vérifiés sur des réponses simulées. Les noms de modèles, quotas et comportements des API peuvent changer.
- Analyse audio par IA : seul le chemin Gemini existe ; **non testé** avec un vrai fichier audio. Les évaluations IA sont approximatives.
- Voix de synthèse et reconnaissance vocale : dépendent du système/navigateur ; sur Firefox pas de reconnaissance ; sur Chrome/Safari elle peut nécessiter Internet (donc indisponible hors ligne). Les accents `en-AU`/`en-GB` n'ont souvent pas de voix dédiée.
- Safari/iOS et Firefox n'ont pas été testés. Chromium uniquement.
- Une clé dans le navigateur reste exposée (voir § 4). Pas de backend fourni.
- Appels directs depuis le navigateur : dépendent du CORS du fournisseur (OpenAI, Gemini et Anthropic l'autorisent à ce jour avec les en-têtes utilisés ; un fournisseur personnalisé doit l'autoriser).
- Le stockage du navigateur peut être purgé (surtout iOS) : exportez régulièrement ; un bouton demande le stockage persistant.
- Interface en anglais : partielle (repli sur le français). Contenu local : 40 exercices par langue (25 phrases, 5 dialogues, 10 mini-histoires) ; contenu néerlandais écrit sans relecture par un natif ; l'IA peut en générer d'autres.
- Conversation orale : testée uniquement avec une fausse reconnaissance/synthèse et une IA simulée dans Chromium ; qualité réelle de la reconnaissance du néerlandais, latence et écho non vérifiés.
- Pas de tests de charge, de revue de sécurité externe ni d'audit manuel d'accessibilité.
