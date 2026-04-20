/**
 * weak-points.ts — Detect programming weak points from logged data.
 *
 * Scans recent completed sessions and produces `WeakPointFinding`s the coach
 * can cite: RPE creep (same load, rising effort), missed targets, volume
 * drops, lift imbalances. Pure engine logic — no LLM, no I/O. Returns data
 * the prompt builder formats into a "Recent signals" section.
 */

import { db } from '@/lib/db/database';
import type { Lift, SetLog, SessionExercise, TrainingSession } from '@/lib/db/types';

// ── Types ────────────────────────────────────────────────────────────────────

export type WeakPointKind =
  | 'RPE_CREEP'          // same load, effort trending up
  | 'MISSED_REPS'        // prescribed reps not hit in multiple sessions
  | 'LOAD_PLATEAU'       // no load progression on the same exercise over weeks
  | 'LIFT_IMBALANCE'     // one comp lift lagging another
  | 'VOLUME_DROP';       // recent weekly volume down sharply vs. trailing average

export interface WeakPointFinding {
  kind: WeakPointKind;
  lift?: Lift;
  exerciseName?: string;
  /** 0-1 confidence. */
  severity: number;
  /** One-line human-readable summary the coach can quote verbatim. */
  summary: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function linearSlope(pairs: Array<[number, number]>): number {
  // Least-squares slope for small series (x = index, y = value).
  if (pairs.length < 2) return 0;
  const n = pairs.length;
  const sumX = pairs.reduce((s, [x]) => s + x, 0);
  const sumY = pairs.reduce((s, [, y]) => s + y, 0);
  const sumXY = pairs.reduce((s, [x, y]) => s + x * y, 0);
  const sumXX = pairs.reduce((s, [x]) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export interface EnrichedExercise {
  exercise: SessionExercise;
  sets: SetLog[];
  session: TrainingSession;
}

async function loadRecentData(sinceDays = 35): Promise<EnrichedExercise[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const sessions = await db.sessions
    .where('scheduledDate').aboveOrEqual(cutoffStr)
    .filter((s) => s.status === 'COMPLETED')
    .toArray();

  if (sessions.length === 0) return [];

  const exercises = await db.exercises
    .where('sessionId').anyOf(sessions.map((s) => s.id))
    .toArray();

  const sets = await db.sets
    .where('sessionId').anyOf(sessions.map((s) => s.id))
    .toArray();

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const setsByExId = new Map<string, SetLog[]>();
  for (const set of sets) {
    const bucket = setsByExId.get(set.exerciseId) ?? [];
    bucket.push(set);
    setsByExId.set(set.exerciseId, bucket);
  }

  return exercises
    .map((ex) => ({
      exercise: ex,
      sets: setsByExId.get(ex.id) ?? [],
      session: sessionById.get(ex.sessionId)!,
    }))
    .filter((e) => e.session);
}

// ── Detectors ────────────────────────────────────────────────────────────────

export function detectRpeCreep(data: EnrichedExercise[]): WeakPointFinding[] {
  const byName = new Map<string, EnrichedExercise[]>();
  for (const ex of data) {
    if (ex.exercise.exerciseType !== 'COMPETITION') continue;
    const bucket = byName.get(ex.exercise.name) ?? [];
    bucket.push(ex);
    byName.set(ex.exercise.name, bucket);
  }

  const findings: WeakPointFinding[] = [];
  for (const [name, entries] of byName) {
    entries.sort((a, b) => a.session.scheduledDate.localeCompare(b.session.scheduledDate));
    const recent = entries.slice(-5);
    if (recent.length < 3) continue;

    // Only look at sets logged with an RPE.
    const rpeSeries: Array<[number, number]> = recent
      .map((e, i) => {
        const rpes = e.sets.map((s) => s.rpeLogged).filter((r): r is number => r !== undefined);
        return [i, avg(rpes)] as [number, number];
      })
      .filter(([, y]) => y > 0);
    if (rpeSeries.length < 3) continue;

    // Only meaningful when loads are roughly flat — otherwise RPE rising is expected.
    const loads = recent.map((e) => avg(e.sets.map((s) => s.loadKg)));
    const loadRange = Math.max(...loads) - Math.min(...loads);
    const loadMean = avg(loads);
    if (loadMean === 0 || loadRange / loadMean > 0.05) continue;

    const slope = linearSlope(rpeSeries);
    if (slope >= 0.3) {
      findings.push({
        kind: 'RPE_CREEP',
        exerciseName: name,
        severity: Math.min(1, slope),
        summary: `${name} RPE is creeping up (~+${slope.toFixed(1)}/session) at roughly the same load. Consider a dedicated deload or easing top sets for a week.`,
      });
    }
  }
  return findings;
}

export function detectMissedReps(data: EnrichedExercise[]): WeakPointFinding[] {
  const findings: WeakPointFinding[] = [];
  const byName = new Map<string, EnrichedExercise[]>();
  for (const ex of data) {
    if (ex.sets.length === 0) continue;
    const bucket = byName.get(ex.exercise.name) ?? [];
    bucket.push(ex);
    byName.set(ex.exercise.name, bucket);
  }

  for (const [name, entries] of byName) {
    entries.sort((a, b) => b.session.scheduledDate.localeCompare(a.session.scheduledDate));
    const recent = entries.slice(0, 4);
    if (recent.length < 3) continue;

    const missedSessions = recent.filter((e) => {
      const targetReps = e.exercise.reps;
      // count how many logged sets fell short of the target
      const short = e.sets.filter((s) => s.reps < targetReps);
      return short.length >= Math.ceil(e.exercise.sets / 2);
    });

    if (missedSessions.length >= 2) {
      findings.push({
        kind: 'MISSED_REPS',
        exerciseName: name,
        severity: missedSessions.length / recent.length,
        summary: `${name}: reps short of target in ${missedSessions.length}/${recent.length} recent sessions. Drop load ~5% or reduce prescribed sets.`,
      });
    }
  }
  return findings;
}

export function detectLoadPlateau(data: EnrichedExercise[]): WeakPointFinding[] {
  const byName = new Map<string, EnrichedExercise[]>();
  for (const ex of data) {
    if (ex.exercise.exerciseType !== 'COMPETITION') continue;
    const bucket = byName.get(ex.exercise.name) ?? [];
    bucket.push(ex);
    byName.set(ex.exercise.name, bucket);
  }

  const findings: WeakPointFinding[] = [];
  for (const [name, entries] of byName) {
    entries.sort((a, b) => a.session.scheduledDate.localeCompare(b.session.scheduledDate));
    if (entries.length < 4) continue;

    const tops = entries.map((e) => Math.max(0, ...e.sets.map((s) => s.loadKg)));
    const range = Math.max(...tops) - Math.min(...tops);
    const mean = avg(tops);
    if (mean === 0) continue;

    // Flat (< 2.5% spread) over ≥4 sessions and no PR in the window.
    if (range / mean < 0.025) {
      findings.push({
        kind: 'LOAD_PLATEAU',
        exerciseName: name,
        severity: 0.5,
        summary: `${name}: top load has been flat around ${Math.round(mean)} kg for ${entries.length} sessions. Consider a variation block or a peaking attempt.`,
      });
    }
  }
  return findings;
}

export function detectLiftImbalance(data: EnrichedExercise[]): WeakPointFinding[] {
  // Compare current heaviest logged set per comp lift against the others.
  const best: Record<string, number> = { SQUAT: 0, BENCH: 0, DEADLIFT: 0 };
  for (const ex of data) {
    if (ex.exercise.exerciseType !== 'COMPETITION') continue;
    const lift = ex.session.primaryLift;
    if (!(lift in best)) continue;
    const top = Math.max(0, ...ex.sets.map((s) => s.loadKg));
    best[lift] = Math.max(best[lift], top);
  }

  // Stock ratios: bench ≈ 0.62 × squat, deadlift ≈ 1.15 × squat.
  const findings: WeakPointFinding[] = [];
  if (best.SQUAT > 0 && best.BENCH > 0) {
    const ratio = best.BENCH / best.SQUAT;
    if (ratio < 0.50) {
      findings.push({
        kind: 'LIFT_IMBALANCE',
        lift: 'BENCH',
        severity: (0.62 - ratio) / 0.62,
        summary: `Bench (${Math.round(best.BENCH)}kg) is low relative to squat (${Math.round(best.SQUAT)}kg) — ratio ${ratio.toFixed(2)} vs. typical ~0.62. More upper-body volume could help.`,
      });
    }
  }
  if (best.SQUAT > 0 && best.DEADLIFT > 0) {
    const ratio = best.DEADLIFT / best.SQUAT;
    if (ratio < 1.0) {
      findings.push({
        kind: 'LIFT_IMBALANCE',
        lift: 'DEADLIFT',
        severity: (1.15 - ratio) / 1.15,
        summary: `Deadlift (${Math.round(best.DEADLIFT)}kg) is low relative to squat (${Math.round(best.SQUAT)}kg) — ratio ${ratio.toFixed(2)} vs. typical ~1.15. Hip-hinge volume or technique work likely needed.`,
      });
    }
  }
  return findings;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Run every detector and return the top findings, sorted by severity. */
export async function detectWeakPoints(limit = 3): Promise<WeakPointFinding[]> {
  const data = await loadRecentData();
  if (data.length === 0) return [];

  const findings = [
    ...detectRpeCreep(data),
    ...detectMissedReps(data),
    ...detectLoadPlateau(data),
    ...detectLiftImbalance(data),
  ];

  findings.sort((a, b) => b.severity - a.severity);
  return findings.slice(0, limit);
}

/** Pre-formatted compact string for the coach prompt. Empty when no findings. */
export async function buildWeakPointsSection(maxChars = 400): Promise<string> {
  const findings = await detectWeakPoints(3);
  if (findings.length === 0) return '';
  const lines = findings.map((f) => `- ${f.summary}`);
  const all = lines.join('\n');
  return all.length <= maxChars ? all : all.slice(0, maxChars - 1) + '…';
}
