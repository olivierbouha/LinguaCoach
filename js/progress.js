/**
 * progress.js — Indicateurs de progression calculés LOCALEMENT à partir de l'historique réel.
 *
 * Aucune statistique inventée : sans activité enregistrée, tout vaut 0 / null.
 * Les évaluations estimées par une IA ne sont jamais mélangées à ces indicateurs
 * (elles sont stockées dans `activity.aiEstimate` et affichées à part, avec la mention « estimation »).
 *
 * Activité : { id, ts, skill:'writing'|'listening'|'speaking', type, level, topic,
 *              score?: {correct,total, label}, aiEstimate?: string }
 */
import { dayKey, uid } from './utils.js';
import { SKILLS, LEVELS } from './config.js';

const DAY = 86400000;

export function newActivity({ skill, type, level, topic, score, detail, aiEstimate }, now = Date.now()) {
  return { id: uid(), ts: now, skill, type, level, topic, ...(score ? { score } : {}), ...(detail ? { detail } : {}), ...(aiEstimate ? { aiEstimate } : {}) };
}

export function computeStats(activities, { dailyGoal = 3, now = Date.now() } = {}) {
  const today = dayKey(now);
  const days = new Set();
  const bySkill = Object.fromEntries(
    SKILLS.map((s) => [s, { count: 0, todayCount: 0, scoredCount: 0, correct: 0, total: 0, accuracy: null, last: null }])
  );
  let todayCount = 0;
  for (const a of activities) {
    const k = dayKey(a.ts);
    days.add(k);
    const b = bySkill[a.skill];
    if (!b) continue;
    b.count++;
    b.last = Math.max(b.last ?? 0, a.ts);
    if (k === today) { b.todayCount++; todayCount++; }
    if (a.score && a.score.total > 0) {
      b.scoredCount++;
      b.correct += a.score.correct;
      b.total += a.score.total;
    }
  }
  for (const b of Object.values(bySkill)) b.accuracy = b.total ? b.correct / b.total : null;

  // Série : jours consécutifs avec ≥ 1 activité, en comptant jusqu'à hier si rien aujourd'hui.
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { todayCount, dailyGoal, goalReached: todayCount >= dailyGoal, streak, bySkill, total: activities.length, activeDays: days.size };
}

/**
 * Difficulté progressive : propose (sans l'appliquer) de monter ou descendre d'un niveau
 * d'après les derniers exercices NOTÉS LOCALEMENT au niveau courant.
 */
export function suggestLevelShift(activities, { level, skills = ['listening', 'speaking'], window = 5, up = 0.85, down = 0.5 } = {}) {
  const scored = activities
    .filter((a) => skills.includes(a.skill) && a.level === level && a.score?.total > 0)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, window);
  if (scored.length < window) return { shift: 0, reason: 'not-enough-data', n: scored.length, accuracy: null };
  const correct = scored.reduce((s, a) => s + a.score.correct, 0);
  const total = scored.reduce((s, a) => s + a.score.total, 0);
  const accuracy = total ? correct / total : null;
  const idx = LEVELS.indexOf(level);
  if (accuracy >= up && idx < LEVELS.length - 1) return { shift: 1, next: LEVELS[idx + 1], accuracy, n: scored.length, reason: 'high-accuracy' };
  if (accuracy <= down && idx > 0) return { shift: -1, next: LEVELS[idx - 1], accuracy, n: scored.length, reason: 'low-accuracy' };
  return { shift: 0, accuracy, n: scored.length, reason: 'stable' };
}

/** Suggestion d'exercice, basée sur des règles simples et explicites (renvoie aussi la raison). */
export function suggestNext(stats, dueCount) {
  if (dueCount > 0) return { kind: 'review', reason: 'due-cards' };
  const entries = SKILLS.map((s) => [s, stats.bySkill[s]]);
  const untouched = entries.filter(([, b]) => b.todayCount === 0);
  const pool = untouched.length ? untouched : entries;
  pool.sort((a, b) => (a[1].last ?? 0) - (b[1].last ?? 0)); // le moins récemment pratiqué d'abord
  return { kind: pool[0][0], reason: pool[0][1].count === 0 ? 'never-practised' : 'least-recent' };
}

/* ------------------------------------------------------------------ */
/* Répétition espacée (SM-2 simplifié)                                  */
/* ------------------------------------------------------------------ */

export const GRADES = { again: 0, hard: 1, good: 2, easy: 3 };

export function newCard({ kind, front, back, source = '' }, now = Date.now()) {
  return { id: uid(), kind, front: String(front).slice(0, 500), back: String(back).slice(0, 1000), source: String(source).slice(0, 200),
    createdAt: now, updatedAt: now, due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
}

/** Renvoie une NOUVELLE carte mise à jour après une notation 0..3. */
export function gradeCard(card, grade, now = Date.now()) {
  let { interval, ease, reps, lapses } = card;
  let due;
  if (grade === GRADES.again) {
    reps = 0; lapses++; interval = 0; ease = Math.max(1.3, ease - 0.2);
    due = now + 10 * 60 * 1000; // à revoir dans 10 minutes
  } else {
    if (grade === GRADES.hard) { interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2)); ease = Math.max(1.3, ease - 0.15); }
    else if (grade === GRADES.good) { interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease); }
    else { interval = reps === 0 ? 3 : Math.round(Math.max(interval, 1) * ease * 1.3); ease += 0.15; }
    reps++;
    due = now + interval * DAY;
  }
  return { ...card, interval, ease, reps, lapses, due, updatedAt: now };
}

export const dueCards = (cards, now = Date.now()) => cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
