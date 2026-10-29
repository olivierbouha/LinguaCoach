/**
 * utils.js — Petits utilitaires partagés (sans dépendance).
 * Aucun accès au DOM à l'import : les fonctions DOM ne sont utilisées qu'à l'appel,
 * ce qui permet d'importer ce module dans Node pour les tests.
 */

/** Identifiant unique (UUID si disponible). */
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/** Clé de jour locale AAAA-MM-JJ (fuseau de l'utilisateur). */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const abortError = () => new DOMException('Aborted', 'AbortError');

/** Attente annulable. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? abortError());
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason ?? abortError());
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** JSON.stringify avec clés triées : sert au calcul de somme de contrôle stable. */
export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Base64 <-> octets (par blocs, pour éviter les dépassements de pile). */
export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Masque les secrets dans un texte (messages d'erreur, logs).
 * - Remplace les valeurs de clés connues.
 * - Remplace aussi les motifs usuels de clés (sk-…, AIza…, Bearer …).
 */
export function redactSecrets(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (s && String(s).length >= 6) out = out.split(String(s)).join('[clé masquée]');
  }
  out = out
    .replace(/sk-ant-[A-Za-z0-9_\-]{8,}/g, '[clé masquée]')
    .replace(/sk-[A-Za-z0-9_\-]{12,}/g, '[clé masquée]')
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[clé masquée]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]{12,}/gi, 'Bearer [clé masquée]');
  return out;
}

/**
 * Création d'éléments DOM sans innerHTML (toute chaîne devient un nœud texte :
 * pas d'injection possible depuis une réponse IA ou un fichier importé).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) el.value = value;
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** Formatage de date relatif simple (français/anglais via Intl). */
export function formatDateTime(ts, locale = 'fr') {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString();
  }
}

/** Mélange Fisher-Yates (non mutant). */
export function shuffle(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
