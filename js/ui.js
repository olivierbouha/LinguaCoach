/**
 * ui.js — Composants d'interface partagés (toasts, boîtes de dialogue, champs, icônes).
 * Tout est construit via h() : aucune chaîne n'est interprétée comme du HTML.
 */
import { h } from './utils.js';
import { t } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  write: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  listen: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Z',
  speak: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM6 11.5a6 6 0 0 0 12 0M12 17.5V21M9 21h6',
  chat: 'M4 5h16v11H9l-5 4V5ZM8 9.5h8M8 12.5h5',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 13.5l1.6 1.2-2 3.4-1.9-.6a7 7 0 0 1-1.6.9l-.3 2H10.8l-.3-2a7 7 0 0 1-1.6-.9l-1.9.6-2-3.4 1.6-1.2a7 7 0 0 1 0-1.8L5 10.5l2-3.4 1.9.6a7 7 0 0 1 1.6-.9l.3-2h3.4l.3 2a7 7 0 0 1 1.6.9l1.9-.6 2 3.4-1.6 1.2a7 7 0 0 1 0 1.8Z',
  play: 'M7 5v14l12-7L7 5Z',
  stop: 'M6 6h12v12H6z',
  send: 'M4 12 20 4l-4 16-4-6-8-2Z',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  refresh: 'M20 11a8 8 0 1 0-2 5.5M20 5v6h-6',
  check: 'M5 12.5 10 17.5 19 7',
  flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 1-9Z',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11',
};
export function icon(name, size = 22) {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: ICONS[name] ?? ICONS.check }));
}

/* ---------------- Toasts ---------------- */
export function toast(message, { kind = 'info', action, duration = 5000 } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('span', {}, message));
  if (action) {
    el.append(h('button', { class: 'btn btn-small', type: 'button', onclick: () => { action.run(); el.remove(); } }, action.label));
  }
  region.append(el);
  if (duration) setTimeout(() => el.remove(), duration);
}

/* ---------------- Boîtes de dialogue ---------------- */
function openDialog(build) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' });
    const close = (value) => { dlg.close(); dlg.remove(); resolve(value); };
    build(dlg, close);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Confirmation. Renvoie true/false. */
export function confirmDialog({ title, message, details, confirmLabel = t('common.confirm'), cancelLabel = t('common.cancel'), danger = false }) {
  return openDialog((dlg, close) => {
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.append(
      h('h2', { id: 'dlg-title' }, title),
      message ? h('p', {}, message) : null,
      details ? h('ul', { class: 'dlg-list' }, details.map((d) => h('li', {}, d))) : null,
      h('div', { class: 'dlg-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, cancelLabel),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', autofocus: true, onclick: () => close(true) }, confirmLabel)),
    );
  }).then((v) => v === true);
}

/** Formulaire simple. fields: [{name,label,type,hint,options}]. Renvoie { name: value } ou null. */
export function formDialog({ title, message, fields, confirmLabel = t('common.confirm') }) {
  return openDialog((dlg, close) => {
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    const inputs = {};
    const form = h('form', { method: 'dialog', onsubmit: (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) out[f.name] = f.type === 'checkbox' ? inputs[f.name].checked : inputs[f.name].value;
      close(out);
    } });
    form.append(h('h2', { id: 'dlg-title' }, title), message ? h('p', {}, message) : null);
    for (const f of fields) {
      const id = `dlgf-${f.name}`;
      const input = f.type === 'select'
        ? h('select', { id, class: 'input', value: f.value }, f.options.map(([v, l]) => h('option', { value: v }, l)))
        : f.type === 'checkbox'
          ? h('input', { id, type: 'checkbox', checked: f.value })
          : h('input', { id, class: 'input', type: f.type ?? 'text', autocomplete: f.autocomplete ?? 'off', minlength: f.minlength, required: f.required, value: f.value ?? '' });
      inputs[f.name] = input;
      form.append(h('div', { class: f.type === 'checkbox' ? 'field field-check' : 'field' },
        f.type === 'checkbox' ? [input, h('label', { for: id }, f.label)] : [h('label', { for: id }, f.label), input],
        f.hint ? h('p', { class: 'hint' }, f.hint) : null));
    }
    form.append(h('div', { class: 'dlg-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, t('common.cancel')),
      h('button', { class: 'btn btn-primary', type: 'submit' }, confirmLabel)));
    dlg.append(form);
    setTimeout(() => Object.values(inputs)[0]?.focus(), 0);
  });
}

/* ---------------- Aides de formulaire ---------------- */
let seq = 0;
export const nextId = (p = 'f') => `${p}-${++seq}`;

/** Champ libellé + contrôle + aide. */
export function field(label, control, hint) {
  const id = control.id || (control.id = nextId());
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'hint', id: hintId }, hint) : null);
}

/** <select> à partir de paires [valeur, libellé]. */
export function select(options, value, onChange, attrs = {}) {
  return h('select', { class: 'input', value, onchange: (e) => onChange(e.target.value), ...attrs },
    options.map(([v, l]) => h('option', { value: v }, l)));
}

/** Bandeau d'information (role=status pour les annonces douces). */
export function banner(kind, ...children) {
  return h('div', { class: `banner banner-${kind}`, role: kind === 'error' ? 'alert' : null }, ...children);
}

/** Rend un texte multi-lignes en paragraphes (jamais en HTML). */
export function paragraphs(text) {
  return String(text ?? '').split(/\n{2,}/).map((p) => h('p', {}, p.trim())).filter((p) => p.textContent);
}

/** Pastille d'état de chargement. */
export function spinner(label) {
  return h('span', { class: 'spinner-wrap', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', {}, label ?? t('common.loading')));
}
