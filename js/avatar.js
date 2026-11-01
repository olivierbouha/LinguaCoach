/**
 * avatar.js — Avatar SVG original et générique d'un tuteur (décoratif : aria-hidden).
 * États pilotés par des classes CSS sur le conteneur : .is-speaking (bouche animée), .is-listening (anneau).
 * L'animation est un simple va-et-vient de la bouche : elle n'est PAS synchronisée sur les phonèmes.
 */
import { svg } from './ui.js';
import { h } from './utils.js';

export function createAvatar(tutor, size = 120) {
  const c = tutor.colors;
  const hair = {
    long: [svg('path', { d: 'M22 52c0-22 12-34 28-34s28 12 28 34v30H66V52H34v30H22V52Z', fill: c.hair }), null],
    bob: [svg('path', { d: 'M22 56c0-24 12-38 28-38s28 14 28 38v14H64V50H36v20H22V56Z', fill: c.hair }), null],
    short: [svg('path', { d: 'M26 46c0-18 10-28 24-28s24 10 24 28c-6-8-14-12-24-12s-18 4-24 12Z', fill: c.hair }), null],
  }[tutor.hair] ?? [];
  const art = svg('svg', { viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: 'avatar-svg' },
    svg('circle', { cx: 50, cy: 50, r: 50, fill: c.bg }),
    hair[0],
    svg('path', { d: 'M18 100c2-18 15-26 32-26s30 8 32 26Z', fill: c.shirt }),
    svg('rect', { x: 43, y: 62, width: 14, height: 14, rx: 6, fill: c.skin }),
    svg('ellipse', { cx: 50, cy: 46, rx: 19, ry: 22, fill: c.skin }),
    tutor.hair === 'short' ? svg('path', { d: 'M31 40c2-12 10-18 19-18s17 6 19 18c-6-5-12-7-19-7s-13 2-19 7Z', fill: c.hair }) : svg('path', { d: 'M31 38c2-10 9-15 19-15s17 5 19 15c-8-3-13-6-19-6s-11 3-19 6Z', fill: c.hair }),
    svg('g', { class: 'avatar-eyes', fill: '#2b2b2b' }, svg('ellipse', { cx: 42, cy: 47, rx: 2.4, ry: 3 }), svg('ellipse', { cx: 58, cy: 47, rx: 2.4, ry: 3 })),
    svg('path', { d: 'M38 41.5q4-2.5 8 0M54 41.5q4-2.5 8 0', stroke: c.hair, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }),
    svg('ellipse', { class: 'avatar-mouth', cx: 50, cy: 58, rx: 5, ry: 1.6, fill: '#9a3b3b' }));
  const box = h('div', { class: 'avatar' }, art);
  box.style.width = `${size}px`; box.style.height = `${size}px`; // CSSOM : autorisé par la CSP (contrairement à l'attribut style)
  return box;
}
