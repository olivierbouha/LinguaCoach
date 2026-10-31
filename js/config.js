/**
 * config.js — Constantes et registres extensibles.
 *
 * POUR AJOUTER UNE LANGUE : ajouter une entrée dans LANGUAGES (avec ses accents),
 * puis fournir js/content/<code>.js (voir content/index.js) et, si besoin, un dictionnaire d'interface.
 * POUR AJOUTER UN PROFIL : une entrée dans PROFILES + son texte dans ai/prompts.js.
 * POUR AJOUTER UN FOURNISSEUR : un adaptateur dans ai/providers/ + son enregistrement dans ai/providers/index.js
 *   + son entrée dans PROVIDER_IDS.
 */

export const APP_VERSION = '1.1.0';
export const BACKUP_FORMAT = 'linguacoach-backup';
/** Version du format de sauvegarde. Incrémenter + ajouter une migration dans backup.js si le schéma change. */
export const BACKUP_VERSION = 1;

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const SKILLS = ['writing', 'listening', 'speaking'];

/** Thèmes pédagogiques. `hint` est transmis tel quel aux agents IA. */
export const TOPICS = {
  daily: { label: 'Vie quotidienne', hint: 'everyday life: home, family, routines, shopping, food, health' },
  travel: { label: 'Voyage et tourisme', hint: 'travel and tourism: transport, hotels, directions, sightseeing, emergencies abroad' },
  business: { label: 'Business et milieu professionnel', hint: 'business and the workplace: meetings, emails, negotiations, presentations, job interviews' },
  hobbies: { label: 'Hobbies et loisirs', hint: 'hobbies and leisure: sport, music, cinema, games, reading, cooking, outdoor activities' },
  news: { label: 'Actualités et débats', hint: 'news and debates: current affairs, opinions, arguments, society, technology, environment' },
};

/**
 * Langues et variantes régionales (code BCP-47 → configuration voix, reconnaissance, prompts, exemples).
 * `lex` désigne la variante lexicale/orthographique utilisée par content/*.js.
 */
export const LANGUAGES = {
  en: {
    id: 'en',
    label: 'Anglais',
    promptName: 'English',
    contentKey: 'en',
    accents: {
      'en-US': {
        code: 'en-US',
        label: 'Anglais américain',
        short: 'US',
        lex: 'US',
        promptNote:
          'Use American English: spelling (color, realize, center), vocabulary (apartment, elevator, vacation, cookie) and idioms. Treat British/Australian forms as legitimate regional variants, not errors.',
      },
      'en-GB': {
        code: 'en-GB',
        label: 'Anglais britannique',
        short: 'GB',
        lex: 'GB',
        promptNote:
          'Use British English: spelling (colour, realise, centre), vocabulary (flat, lift, holiday, biscuit) and idioms. Treat American/Australian forms as legitimate regional variants, not errors.',
      },
      'en-AU': {
        code: 'en-AU',
        label: 'Anglais australien',
        short: 'AU',
        lex: 'AU',
        promptNote:
          'Use Australian English: spelling close to British (colour, realise, centre), vocabulary (flat/apartment, lift, holiday, footpath, takeaway). Avoid heavy slang unless the learner is advanced. Treat British/American forms as legitimate regional variants, not errors.',
      },
    },
    defaultAccent: 'en-US',
  },
  nl: {
    id: 'nl',
    label: 'Néerlandais',
    promptName: 'Dutch',
    contentKey: 'nl',
    accents: {
      'nl-NL': {
        code: 'nl-NL',
        label: 'Néerlandais (Pays-Bas)',
        short: 'NL',
        lex: 'NL',
        promptNote:
          'Use standard Dutch as spoken in the Netherlands (Standaardnederlands): vocabulary (mobiel, friet, broodje, spoor) and usage. Treat Belgian (Flemish) forms as legitimate regional variants, not errors.',
      },
      'nl-BE': {
        code: 'nl-BE',
        label: 'Néerlandais (Belgique / flamand)',
        short: 'BE',
        lex: 'BE',
        promptNote:
          'Use standard Belgian Dutch (Vlaams standaardtaal), not dialect: vocabulary such as gsm, frieten, pistolet, perron. Avoid strong dialect forms unless the learner is advanced. Treat Netherlands forms as legitimate regional variants, not errors.',
      },
    },
    defaultAccent: 'nl-NL',
  },
};

/** Langues maternelles proposées (l'explication pédagogique est rédigée dans cette langue). */
export const NATIVE_LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ar', label: 'العربية' },
];

/** Profils pédagogiques (le texte des consignes est dans ai/prompts.js). Indépendants du fournisseur IA. */
export const PROFILES = {
  teacher: { label: 'Professeur bienveillant', desc: 'Correction détaillée, explications, reformulations naturelles.' },
  partner: { label: 'Partenaire de conversation', desc: 'Conversation fluide, relances et mises en situation.' },
  pronunciation: { label: 'Coach de prononciation', desc: 'Prononciation, rythme et accentuation (selon ce que le modèle peut réellement évaluer).' },
  exam: { label: 'Préparation aux examens', desc: 'Exercices structurés, progression et évaluation formative.' },
};

export const CORRECTION_STYLES = {
  detailed: 'Détaillée (toutes les erreurs, avec explications)',
  balanced: 'Équilibrée (erreurs importantes, explications brèves)',
  light: 'Légère (seulement ce qui gêne la compréhension)',
};

/** Fournisseurs IA disponibles. Aucun modèle n'est codé en dur : l'utilisateur le choisit (ou le liste via l'API). */
export const PROVIDER_IDS = ['gemini', 'openai', 'anthropic', 'custom'];

export const THEMES_UI = ['auto', 'light', 'dark'];
export const UI_LANGS = { fr: 'Français', en: 'English' };

const emptySlot = () => ({ provider: '', model: '', baseUrl: '' });

/** Valeurs par défaut des préférences. Les clés API NE SONT PAS ici (voir storage.js). */
export const DEFAULT_PREFS = Object.freeze({
  uiLang: 'fr',
  theme: 'auto',
  language: 'en',
  accent: 'en-US',
  level: 'B1',
  topic: 'daily',
  profile: 'teacher',
  nativeLang: 'fr',
  goals: '',
  correctionStyle: 'balanced',
  dailyGoal: 3,
  speechRate: 1,
  voiceURI: '',
  keyStorage: 'local', // 'local' (localStorage) ou 'session' (effacée à la fermeture de l'onglet)
  backupReminderDays: 7,
  lastBackupAt: 0,
  aiConsent: {}, // { [providerId]: true } — consentement explicite à l'envoi de texte au fournisseur
  audioConsent: false, // case « Je comprends » pour l'envoi audio (rappelée à chaque envoi malgré tout)
  ai: {
    primary: emptySlot(),
    fallback: { enabled: false, ...emptySlot() },
  },
});

export function getAccent(prefs) {
  const lang = LANGUAGES[prefs.language] ?? LANGUAGES.en;
  return lang.accents[prefs.accent] ?? lang.accents[lang.defaultAccent];
}
export function getLanguage(prefs) {
  return LANGUAGES[prefs.language] ?? LANGUAGES.en;
}
