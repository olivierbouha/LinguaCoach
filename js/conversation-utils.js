/**
 * conversation-utils.js — Utilitaires purs (testables) de la conversation orale :
 *  - nettoyage d'un texte pour la synthèse vocale (markdown, émojis, liens),
 *  - découpage en phrases au fil du flux de l'IA,
 *  - séparation du conseil optionnel « [TIP] » (jamais lu à voix haute).
 */

export const TIP_MARKER = '[TIP]';

/** Retire ce qui ne doit pas être prononcé : markdown, URL, émojis, parenthèses de mise en forme. */
export function cleanForSpeech(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>~]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sépare la réponse parlée du conseil `[TIP] …` (le conseil est affiché, pas lu). */
export function splitTip(text) {
  const s = String(text ?? '');
  const i = s.indexOf(TIP_MARKER);
  if (i < 0) return { spoken: s.trim(), tip: '' };
  return { spoken: s.slice(0, i).trim(), tip: s.slice(i + TIP_MARKER.length).trim() };
}

/**
 * Découpe un flux de jetons en phrases prononçables.
 * `onSentence(phrase)` est appelé dès qu'une phrase est complète ; le texte après `[TIP]` est ignoré.
 * Un début de marqueur en fin de tampon (ex. « [TI ») est retenu jusqu'à ce qu'on sache ce que c'est.
 */
export function createSentenceStreamer(onSentence) {
  let buf = '';
  let all = '';
  let tipMode = false;
  const emit = (s) => { const c = cleanForSpeech(s); if (c && /[\p{L}\p{N}]/u.test(c)) onSentence(c); };
  const boundary = /[.!?…]+["')\]]*(?:\s+|$)|\n+/;
  const drain = (final) => {
    if (tipMode) return;
    const i = buf.indexOf(TIP_MARKER);
    if (i >= 0) { const head = buf.slice(0, i); buf = ''; tipMode = true; drainText(head, true); return; }
    // retenir un éventuel début de marqueur
    let hold = 0;
    if (!final) for (let k = Math.min(TIP_MARKER.length - 1, buf.length); k > 0; k--) if (TIP_MARKER.startsWith(buf.slice(-k))) { hold = k; break; }
    const usable = buf.slice(0, buf.length - hold);
    buf = buf.slice(buf.length - hold);
    drainText(usable, final);
  };
  let pending = '';
  const drainText = (txt, final) => {
    pending += txt.replace(/[*_`#]+/g, '');
    for (;;) {
      const m = boundary.exec(pending);
      // sans espace après la ponctuation finale, on attend la suite (sauf fin de flux)
      if (!m || (!final && m.index + m[0].length >= pending.length && !/\s$/.test(m[0]) && !/\n/.test(m[0]))) break;
      emit(pending.slice(0, m.index + m[0].length));
      pending = pending.slice(m.index + m[0].length);
    }
    if (final && pending.trim()) { emit(pending); pending = ''; }
  };
  return {
    push(tok) { all += tok; if (!tipMode) { buf += tok; drain(false); } },
    /** Fin du flux : vide le tampon. Renvoie le texte parlé et le conseil. */
    end() { if (!tipMode) { drain(true); drainText('', true); } return splitTip(all); },
  };
}
