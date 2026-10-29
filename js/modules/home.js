/**
 * modules/home.js — Accueil : objectif du jour, série, accès rapides, activité récente, suggestion.
 * Tous les chiffres viennent de l'historique réellement enregistré (voir progress.js).
 */
import { h, formatDateTime } from '../utils.js';
import { svg, icon, banner } from '../ui.js';
import { computeStats, dueCards, suggestNext, suggestLevelShift } from '../progress.js';
import { backupReminderDue, daysSinceBackup } from '../backup.js';
import { TOPICS, PROFILES, getAccent } from '../config.js';

const SKILL_ROUTE = { writing: 'writing', listening: 'listening', speaking: 'speaking' };
const SKILL_ICON = { writing: 'write', listening: 'listen', speaking: 'speak' };

function ring(done, goal, t) {
  const r = 44, c = 2 * Math.PI * r;
  const frac = Math.min(1, goal ? done / goal : 0);
  return svg('svg', { viewBox: '0 0 100 100', width: 112, height: 112, role: 'img', 'aria-label': t('home.goalAria', { done, goal }) },
    svg('circle', { cx: 50, cy: 50, r, fill: 'none', 'stroke-width': 9, class: 'ring-bg' }),
    svg('circle', { cx: 50, cy: 50, r, fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round', class: 'ring-fg',
      'stroke-dasharray': `${c * frac} ${c}`, transform: 'rotate(-90 50 50)' }),
    svg('text', { x: 50, y: 56, 'text-anchor': 'middle', class: 'ring-text' }, document.createTextNode(`${done}/${goal}`)));
}

export async function render(root, ctx) {
  const { t, store } = ctx;
  const prefs = ctx.prefs();
  const [activities, vocab, errors, convs] = await Promise.all([store.all('activities'), store.all('vocab'), store.all('errors'), store.all('conversations')]);
  const stats = computeStats(activities, { dailyGoal: prefs.dailyGoal });
  const due = dueCards([...vocab, ...errors]);
  const hasData = activities.length + vocab.length + errors.length + convs.length > 0;
  const hour = new Date().getHours();
  const accent = getAccent(prefs);

  const out = [];
  out.push(h('section', { class: 'hero card' },
    h('h1', {}, hour < 18 ? t('home.hello') : t('home.evening')),
    h('p', { class: 'lead' }, stats.total === 0 ? t('home.welcomeNew') : t('home.welcomeBack')),
    h('p', { class: 'chips' },
      h('a', { class: 'chip', href: '#/settings' }, accent.label),
      h('a', { class: 'chip', href: '#/settings' }, `${t('common.level')} ${prefs.level}`),
      h('a', { class: 'chip', href: '#/settings' }, TOPICS[prefs.topic].label),
      h('a', { class: 'chip', href: '#/settings' }, PROFILES[prefs.profile].label))));

  // Bandeaux d'information
  if (!ctx.ai.isConfigured()) {
    out.push(banner('info', h('strong', {}, t('home.noAiTitle')), ' ', t('home.noAiText'), ' ', h('a', { href: '#/settings' }, t('home.noAiLink'))));
  }
  if (backupReminderDue(prefs, hasData)) {
    const d = daysSinceBackup(prefs.lastBackupAt);
    out.push(banner('warn', d === null ? t('home.backupNever') : t('home.backupOld', { days: d }), ' ', h('a', { href: '#/settings' }, t('home.backupLink'))));
  }
  const shift = suggestLevelShift(activities, { level: prefs.level });
  if (shift.shift !== 0) {
    out.push(banner('info', shift.shift > 0
      ? t('home.levelUp', { pct: Math.round(shift.accuracy * 100), n: shift.n, next: shift.next })
      : t('home.levelDown', { pct: Math.round(shift.accuracy * 100), n: shift.n, next: shift.next }),
    ' ', h('a', { href: '#/settings' }, t('home.levelLink'))));
  }

  // Objectif + série
  out.push(h('section', { class: 'grid-2' },
    h('div', { class: 'card goal' },
      h('h2', {}, t('home.goalTitle')), ring(stats.todayCount, stats.dailyGoal, t),
      h('p', { class: 'muted' }, stats.goalReached ? t('home.goalDone') : t('home.goalLeft', { n: stats.dailyGoal - stats.todayCount }))),
    h('div', { class: 'card streak' },
      h('h2', {}, t('home.streakTitle')),
      h('p', { class: 'big' }, icon('flame', 28), ' ', String(stats.streak)),
      h('p', { class: 'muted' }, stats.streak === 0 ? t('home.streakZero') : t('home.streakDays', { n: stats.streak })))));

  // Compétences
  out.push(h('section', {},
    h('h2', {}, t('home.skills')),
    h('div', { class: 'skills' }, ['writing', 'listening', 'speaking'].map((s) => {
      const b = stats.bySkill[s];
      return h('a', { class: 'card skill', href: `#/${SKILL_ROUTE[s]}` },
        icon(SKILL_ICON[s], 28), h('strong', {}, t(`skill.${s}`)),
        h('span', { class: 'muted' }, b.count === 0 ? t('home.skillNone') : t('home.skillCount', { n: b.count })),
        b.accuracy != null ? h('span', { class: 'muted' }, t('home.accLocal', { pct: Math.round(b.accuracy * 100) })) : null);
    }))));

  // Suggestion
  const next = suggestNext(stats, due.length);
  out.push(h('section', { class: 'card suggestion' },
    h('h2', {}, t('home.suggestion')),
    h('p', {}, next.kind === 'review' ? t('home.sugReview', { n: due.length }) : t(`home.sug.${next.reason}`, { skill: t(`skill.${next.kind}`) })),
    h('a', { class: 'btn btn-primary', href: next.kind === 'review' ? '#/review' : `#/${next.kind}` }, next.kind === 'review' ? t('home.startReview') : t('home.startSkill', { skill: t(`skill.${next.kind}`) }))));

  // Révision
  out.push(h('section', { class: 'card' },
    h('h2', {}, icon('book', 20), ' ', t('home.reviewTitle')),
    h('p', {}, t('home.reviewCounts', { vocab: vocab.length, errors: errors.length, due: due.length })),
    h('a', { class: 'btn', href: '#/review' }, t('home.reviewOpen'))));

  // Activité récente
  const recent = [...activities].sort((a, b) => b.ts - a.ts).slice(0, 5);
  out.push(h('section', {},
    h('h2', {}, t('home.recent')),
    recent.length === 0
      ? h('p', { class: 'muted' }, t('home.recentNone'))
      : h('ul', { class: 'list' }, recent.map((a) => h('li', { class: 'list-item' },
        h('span', {}, h('strong', {}, t(`skill.${a.skill}`)), a.type ? ` · ${t(`type.${a.type}`)}` : '', a.level ? ` · ${a.level}` : ''),
        h('span', { class: 'muted' }, a.score ? t('home.scoreLocal', { c: a.score.correct, n: a.score.total }) + ' · ' : '', formatDateTime(a.ts, prefs.uiLang)))))));

  root.replaceChildren(...out);
  return {};
}
