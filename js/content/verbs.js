/**
 * content/verbs.js — Verbes irréguliers (liste fixe, vérifiable, hors ligne).
 * Alternatives séparées par « / ». Rédigé à la main : à faire relire (surtout le néerlandais) avant usage sérieux.
 *
 * en : [base, prétérit, participe passé, traduction (fr)]
 * nl : [infinitif, prétérit sing., prétérit plur., participe passé, traduction (fr), auxiliaire]
 */
export const VERBS = {
  en: {
    columns: ['Base', 'Past simple', 'Past participle'],
    rows: [
      ['be', 'was/were', 'been', 'être'], ['begin', 'began', 'begun', 'commencer'], ['break', 'broke', 'broken', 'casser'],
      ['bring', 'brought', 'brought', 'apporter'], ['build', 'built', 'built', 'construire'], ['buy', 'bought', 'bought', 'acheter'],
      ['catch', 'caught', 'caught', 'attraper'], ['choose', 'chose', 'chosen', 'choisir'], ['come', 'came', 'come', 'venir'],
      ['cost', 'cost', 'cost', 'coûter'], ['cut', 'cut', 'cut', 'couper'], ['do', 'did', 'done', 'faire'],
      ['draw', 'drew', 'drawn', 'dessiner'], ['drink', 'drank', 'drunk', 'boire'], ['drive', 'drove', 'driven', 'conduire'],
      ['eat', 'ate', 'eaten', 'manger'], ['fall', 'fell', 'fallen', 'tomber'], ['feel', 'felt', 'felt', 'ressentir'],
      ['find', 'found', 'found', 'trouver'], ['fly', 'flew', 'flown', 'voler (dans les airs)'], ['forget', 'forgot', 'forgotten', 'oublier'],
      ['get', 'got', 'got/gotten', 'obtenir, devenir'], ['give', 'gave', 'given', 'donner'], ['go', 'went', 'gone/been', 'aller'],
      ['grow', 'grew', 'grown', 'grandir, cultiver'], ['have', 'had', 'had', 'avoir'], ['hear', 'heard', 'heard', 'entendre'],
      ['hide', 'hid', 'hidden', 'cacher'], ['hit', 'hit', 'hit', 'frapper'], ['hold', 'held', 'held', 'tenir'],
      ['keep', 'kept', 'kept', 'garder'], ['know', 'knew', 'known', 'savoir, connaître'], ['learn', 'learnt/learned', 'learnt/learned', 'apprendre'],
      ['leave', 'left', 'left', 'partir, quitter'], ['lend', 'lent', 'lent', 'prêter'], ['let', 'let', 'let', 'laisser, permettre'],
      ['lose', 'lost', 'lost', 'perdre'], ['make', 'made', 'made', 'faire, fabriquer'], ['mean', 'meant', 'meant', 'signifier'],
      ['meet', 'met', 'met', 'rencontrer'], ['pay', 'paid', 'paid', 'payer'], ['put', 'put', 'put', 'mettre'],
      ['read', 'read', 'read', 'lire'], ['ride', 'rode', 'ridden', 'monter (vélo, cheval)'], ['ring', 'rang', 'rung', 'sonner'],
      ['run', 'ran', 'run', 'courir'], ['say', 'said', 'said', 'dire'], ['see', 'saw', 'seen', 'voir'],
      ['sell', 'sold', 'sold', 'vendre'], ['send', 'sent', 'sent', 'envoyer'], ['set', 'set', 'set', 'placer, régler'],
      ['shut', 'shut', 'shut', 'fermer'], ['sing', 'sang', 'sung', 'chanter'], ['sit', 'sat', 'sat', 'être assis'],
      ['sleep', 'slept', 'slept', 'dormir'], ['speak', 'spoke', 'spoken', 'parler'], ['spend', 'spent', 'spent', 'dépenser, passer (du temps)'],
      ['stand', 'stood', 'stood', 'être debout'], ['steal', 'stole', 'stolen', 'voler (dérober)'], ['swim', 'swam', 'swum', 'nager'],
      ['take', 'took', 'taken', 'prendre'], ['teach', 'taught', 'taught', 'enseigner'], ['tell', 'told', 'told', 'dire, raconter'],
      ['think', 'thought', 'thought', 'penser'], ['throw', 'threw', 'thrown', 'lancer'], ['understand', 'understood', 'understood', 'comprendre'],
      ['wake', 'woke', 'woken', 'se réveiller'], ['wear', 'wore', 'worn', 'porter (un vêtement)'], ['win', 'won', 'won', 'gagner'],
      ['write', 'wrote', 'written', 'écrire'],
    ],
  },
  nl: {
    columns: ['Infinitief', 'Verleden tijd (enkelvoud)', 'Verleden tijd (meervoud)', 'Voltooid deelwoord'],
    rows: [
      ['zijn', 'was', 'waren', 'geweest', 'être', 'zijn'], ['hebben', 'had', 'hadden', 'gehad', 'avoir', 'hebben'],
      ['worden', 'werd', 'werden', 'geworden', 'devenir', 'zijn'], ['kunnen', 'kon', 'konden', 'gekund', 'pouvoir', 'hebben'],
      ['willen', 'wilde/wou', 'wilden/wouden', 'gewild', 'vouloir', 'hebben'], ['moeten', 'moest', 'moesten', 'gemoeten', 'devoir', 'hebben'],
      ['mogen', 'mocht', 'mochten', 'gemogen', 'avoir le droit', 'hebben'], ['gaan', 'ging', 'gingen', 'gegaan', 'aller', 'zijn'],
      ['komen', 'kwam', 'kwamen', 'gekomen', 'venir', 'zijn'], ['doen', 'deed', 'deden', 'gedaan', 'faire', 'hebben'],
      ['zien', 'zag', 'zagen', 'gezien', 'voir', 'hebben'], ['geven', 'gaf', 'gaven', 'gegeven', 'donner', 'hebben'],
      ['nemen', 'nam', 'namen', 'genomen', 'prendre', 'hebben'], ['blijven', 'bleef', 'bleven', 'gebleven', 'rester', 'zijn'],
      ['staan', 'stond', 'stonden', 'gestaan', 'être debout', 'hebben'], ['zitten', 'zat', 'zaten', 'gezeten', 'être assis', 'hebben'],
      ['liggen', 'lag', 'lagen', 'gelegen', 'être couché', 'hebben'], ['lopen', 'liep', 'liepen', 'gelopen', 'marcher', 'hebben/zijn'],
      ['spreken', 'sprak', 'spraken', 'gesproken', 'parler', 'hebben'], ['schrijven', 'schreef', 'schreven', 'geschreven', 'écrire', 'hebben'],
      ['lezen', 'las', 'lazen', 'gelezen', 'lire', 'hebben'], ['eten', 'at', 'aten', 'gegeten', 'manger', 'hebben'],
      ['drinken', 'dronk', 'dronken', 'gedronken', 'boire', 'hebben'], ['slapen', 'sliep', 'sliepen', 'geslapen', 'dormir', 'hebben'],
      ['vinden', 'vond', 'vonden', 'gevonden', 'trouver', 'hebben'], ['denken', 'dacht', 'dachten', 'gedacht', 'penser', 'hebben'],
      ['weten', 'wist', 'wisten', 'geweten', 'savoir', 'hebben'], ['kennen', 'kende', 'kenden', 'gekend', 'connaître', 'hebben'],
      ['brengen', 'bracht', 'brachten', 'gebracht', 'apporter', 'hebben'], ['kopen', 'kocht', 'kochten', 'gekocht', 'acheter', 'hebben'],
      ['zoeken', 'zocht', 'zochten', 'gezocht', 'chercher', 'hebben'], ['vragen', 'vroeg', 'vroegen', 'gevraagd', 'demander', 'hebben'],
      ['beginnen', 'begon', 'begonnen', 'begonnen', 'commencer', 'zijn'], ['helpen', 'hielp', 'hielpen', 'geholpen', 'aider', 'hebben'],
      ['houden', 'hield', 'hielden', 'gehouden', 'tenir', 'hebben'], ['laten', 'liet', 'lieten', 'gelaten', 'laisser, faire faire', 'hebben'],
      ['krijgen', 'kreeg', 'kregen', 'gekregen', 'recevoir', 'hebben'], ['winnen', 'won', 'wonnen', 'gewonnen', 'gagner', 'hebben'],
      ['verliezen', 'verloor', 'verloren', 'verloren', 'perdre', 'hebben'], ['kiezen', 'koos', 'kozen', 'gekozen', 'choisir', 'hebben'],
      ['sterven', 'stierf', 'stierven', 'gestorven', 'mourir', 'zijn'], ['snijden', 'sneed', 'sneden', 'gesneden', 'couper', 'hebben'],
      ['rijden', 'reed', 'reden', 'gereden', 'rouler, conduire', 'hebben/zijn'], ['vallen', 'viel', 'vielen', 'gevallen', 'tomber', 'zijn'],
      ['vliegen', 'vloog', 'vlogen', 'gevlogen', 'voler (dans les airs)', 'hebben/zijn'], ['zwemmen', 'zwom', 'zwommen', 'gezwommen', 'nager', 'hebben/zijn'],
      ['trekken', 'trok', 'trokken', 'getrokken', 'tirer', 'hebben'], ['breken', 'brak', 'braken', 'gebroken', 'casser', 'hebben'],
      ['sluiten', 'sloot', 'sloten', 'gesloten', 'fermer', 'hebben'], ['bieden', 'bood', 'boden', 'geboden', 'offrir, proposer', 'hebben'],
      ['roepen', 'riep', 'riepen', 'geroepen', 'appeler, crier', 'hebben'], ['vergeten', 'vergat', 'vergaten', 'vergeten', 'oublier', 'hebben'],
      ['begrijpen', 'begreep', 'begrepen', 'begrepen', 'comprendre', 'hebben'],
    ],
  },
};

/** Verbes de la langue sous forme d'objets { id, forms: [...], fr, aux? } (l'ordre de `forms` suit `columns`). */
export function getVerbs(langId) {
  const v = VERBS[langId];
  if (!v) return null;
  const nforms = v.columns.length;
  return {
    columns: v.columns,
    verbs: v.rows.map((r) => ({ id: `${langId}-${r[0]}`, forms: r.slice(0, nforms), fr: r[nforms], aux: r[nforms + 1] ?? '' })),
  };
}

/** Une réponse est juste si elle égale l'une des alternatives (« a/b ») de la forme attendue (casse/espaces ignorés). */
export function checkForm(expected, typed) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const given = norm(typed);
  if (!given) return false;
  // l'élève peut aussi taper toutes les alternatives : « got/gotten »
  const alts = norm(expected).split('/').map((x) => x.trim());
  return alts.includes(given) || norm(expected) === given || given.split('/').map((x) => x.trim()).every((g) => alts.includes(g));
}
