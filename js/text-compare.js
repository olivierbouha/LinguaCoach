/**
 * text-compare.js — Comparaison mot à mot (texte attendu vs texte reconnu / dicté).
 *
 * IMPORTANT : ceci mesure l'écart entre deux TEXTES. Pour l'expression orale, cela mesure la
 * « reconnaissance des mots » par le moteur du navigateur, pas la qualité de la prononciation.
 */

/** Découpe en mots normalisés (minuscules, sans ponctuation, apostrophes unifiées). */
export function normalizeWords(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** Distance de Levenshtein. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Alignement par programmation dynamique.
 * Opérations : match | sub (mot différent) | del (mot attendu absent) | ins (mot en trop).
 */
export function alignWords(expected, actual) {
  const m = expected.length, n = actual.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = expected[i - 1] === actual[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1)) {
      const same = expected[i - 1] === actual[j - 1];
      ops.push({
        type: same ? 'match' : 'sub',
        exp: expected[i - 1],
        act: actual[j - 1],
        near: !same && levenshtein(expected[i - 1], actual[j - 1]) <= 1,
      });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ type: 'del', exp: expected[i - 1] });
      i--;
    } else {
      ops.push({ type: 'ins', act: actual[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

/**
 * Compare deux textes.
 * @returns {{ops, expectedCount, actualCount, matched, substituted, missing, extra, wordMatchRate}}
 *   wordMatchRate = mots attendus retrouvés / mots attendus (null si rien d'attendu).
 */
export function compareTexts(expectedText, actualText) {
  const expected = normalizeWords(expectedText);
  const actual = normalizeWords(actualText);
  const ops = alignWords(expected, actual);
  const count = (t) => ops.filter((o) => o.type === t).length;
  const matched = count('match');
  return {
    ops,
    expectedCount: expected.length,
    actualCount: actual.length,
    matched,
    substituted: count('sub'),
    missing: count('del'),
    extra: count('ins'),
    wordMatchRate: expected.length ? matched / expected.length : null,
  };
}
