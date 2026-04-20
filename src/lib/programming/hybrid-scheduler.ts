/**
 * hybrid-scheduler.ts — Assign disciplines to days of a week.
 *
 * Given an `EffectiveWeekPlan` (from `engine/schedule.ts`) and the athlete's
 * active disciplines, produce a `HybridPlan` that names what each trainable
 * day should be: a powerlifting focus lift, a street-lift pulling or dipping
 * session, a calisthenics skill day, or rest.
 *
 * Pure function. No DB writes, no LLM. Deterministic given inputs.
 *
 * Placement rules:
 *   1. Powerlifting sessions get first priority (they're the backbone).
 *      Standard rotations mirror `engine/session.ts::selectPrimaryLift`.
 *   2. High-systemic PL days (SQUAT, DEADLIFT) cannot be paired with
 *      high-demand calisthenic pulls (street-lift pull, heavy pulls).
 *      Rule of thumb: avoid stacking systemicFatigue ≥ 8 exercises on
 *      the same day.
 *   3. With ≥4 training days/wk, each discipline gets a dedicated day.
 *      With 3 training days/wk, a calisthenics skill block rides on a PL
 *      day that doesn't collide (e.g. skill pulls with a bench day).
 *   4. Days marked unavailable (minutes === null) are always REST.
 *   5. Very short days (< 30 min) get a calisthenics skill block rather
 *      than a full PL session.
 */

import type { DayBudget, EffectiveWeekPlan } from '@/lib/engine/schedule';
import type { AthleteProfile, Discipline, Lift } from '@/lib/db/types';

// ── Types ────────────────────────────────────────────────────────────────────

export type HybridSlotKind =
  | 'POWERLIFTING'
  | 'STREET_LIFT_PULL'
  | 'STREET_LIFT_DIP'
  | 'CALISTHENICS_SKILL'
  | 'REST';

export interface HybridAssignment {
  date: string;
  dayOfWeek: number;
  kind: HybridSlotKind;
  /** For POWERLIFTING: which comp lift is primary. */
  primaryLift?: Lift;
  /** Optional skill/pulling theme for non-PL slots. */
  theme?: string;
  /** Budget carried over from the resolver. */
  minutes: number | null | undefined;
  reason?: string;
}

export interface HybridPlan {
  weekStart: string;
  assignments: HybridAssignment[];   // length 7, Mon→Sun
  plSessions: number;
  streetLiftSessions: number;
  calisthenicsSessions: number;
  restDays: number;
}

export interface SchedulerInputs {
  weekPlan: EffectiveWeekPlan;
  profile: Pick<AthleteProfile, 'weeklyFrequency' | 'disciplines' | 'primaryDiscipline'>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SHORT_MINUTES_THRESHOLD = 30;

function rotationFor(freq: number): Lift[] {
  // Mirrors session.ts::selectPrimaryLift rotations so the hybrid scheduler
  // stays consistent with the single-discipline default.
  const f = Math.min(6, Math.max(1, freq));
  switch (f) {
    case 1: return ['SQUAT'];
    case 2: return ['SQUAT', 'BENCH'];
    case 3: return ['SQUAT', 'BENCH', 'DEADLIFT'];
    case 4: return ['SQUAT', 'BENCH', 'DEADLIFT', 'BENCH'];
    case 5: return ['SQUAT', 'BENCH', 'DEADLIFT', 'BENCH', 'SQUAT'];
    case 6: return ['SQUAT', 'BENCH', 'DEADLIFT', 'BENCH', 'SQUAT', 'DEADLIFT'];
    default: return ['SQUAT', 'BENCH', 'DEADLIFT', 'BENCH'];
  }
}

function isHighSystemic(lift: Lift | undefined): boolean {
  return lift === 'SQUAT' || lift === 'DEADLIFT';
}

function makeRest(day: DayBudget, reason: string): HybridAssignment {
  return {
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    kind: 'REST',
    minutes: day.minutes,
    reason,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function scheduleWeek(inputs: SchedulerInputs): HybridPlan {
  const { weekPlan, profile } = inputs;
  const disciplines: Discipline[] = profile.disciplines?.length
    ? profile.disciplines
    : ['POWERLIFTING'];
  const wantsStreetLift = disciplines.includes('STREET_LIFT') || disciplines.includes('HYBRID');
  const wantsCalisthenics = disciplines.includes('CALISTHENICS') || disciplines.includes('HYBRID');

  const trainableDays = weekPlan.days.filter((d) => d.minutes !== null);
  const trainableCount = trainableDays.length;

  // Decide how many sessions each discipline gets. The primary discipline
  // takes most of the slots; the rest are split among the others. PL is
  // clamped by trainable day count; calisthenics is kept at its target
  // because the pairing fallback can fit it onto a bench day when no open
  // slot remains.
  const primary = profile.primaryDiscipline ?? disciplines[0];
  let plTarget = primary === 'POWERLIFTING' || primary === 'HYBRID'
    ? Math.min(profile.weeklyFrequency ?? 4, trainableCount)
    : 0;
  let streetLiftTarget = wantsStreetLift ? Math.max(1, Math.floor(trainableCount / 3)) : 0;
  const caliTarget = wantsCalisthenics ? 1 : 0;

  // Street-lift days need their own slot (no pairing fallback), so if the
  // week is too tight, shed street-lift days first, then PL.
  while (plTarget + streetLiftTarget > trainableCount) {
    if (streetLiftTarget > 0) streetLiftTarget -= 1;
    else if (plTarget > 1) plTarget -= 1;
    else break;
  }

  const plRotation = rotationFor(plTarget || (profile.weeklyFrequency ?? 3));
  const plLifts = plRotation.slice(0, plTarget);

  // Build assignments.
  const assignments: HybridAssignment[] = weekPlan.days.map((day) => {
    if (day.minutes === null) return makeRest(day, 'Unavailable');
    return makeRest(day, 'Open slot');
  });

  // Indices of trainable days in calendar order.
  const trainableIdx = weekPlan.days
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.minutes !== null);

  // Pass 1: place PL sessions on longer days first, evenly spaced.
  const longEnoughIdx = trainableIdx.filter(({ d }) =>
    d.minutes === undefined || (d.minutes ?? 0) >= SHORT_MINUTES_THRESHOLD,
  );
  const pickedPlSlots: number[] = [];
  if (plLifts.length > 0 && longEnoughIdx.length > 0) {
    // Spread: take indices spaced through the available trainable days.
    const n = longEnoughIdx.length;
    const step = Math.max(1, Math.floor(n / plLifts.length));
    for (let k = 0; k < plLifts.length && k * step < n; k++) {
      pickedPlSlots.push(longEnoughIdx[k * step].i);
    }
    // If we picked fewer than planned (rounding), fill from remaining.
    const remaining = longEnoughIdx.map((x) => x.i).filter((i) => !pickedPlSlots.includes(i));
    while (pickedPlSlots.length < plLifts.length && remaining.length > 0) {
      pickedPlSlots.push(remaining.shift()!);
    }
    pickedPlSlots.sort((a, b) => a - b);
    pickedPlSlots.forEach((idx, k) => {
      const lift = plLifts[k];
      const day = weekPlan.days[idx];
      assignments[idx] = {
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        kind: 'POWERLIFTING',
        primaryLift: lift,
        minutes: day.minutes,
        reason: `PL rotation slot ${k + 1}/${plLifts.length}`,
      };
    });
  }

  // Pass 2: street-lift pulls. Avoid days adjacent to deadlift (too much
  // pulling overlap) and never on the same day as a heavy squat/DL session.
  const usedDeadliftIdxs = assignments
    .map((a, i) => (a.kind === 'POWERLIFTING' && a.primaryLift === 'DEADLIFT' ? i : -1))
    .filter((i) => i >= 0);

  const adjacent = (i: number) => usedDeadliftIdxs.some((dl) => Math.abs(dl - i) <= 1);

  let streetLiftLeft = streetLiftTarget;
  if (streetLiftLeft > 0) {
    // Prefer open (REST w/ 'Open slot') trainable days that aren't adjacent to DL.
    const candidates = weekPlan.days
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) =>
        d.minutes !== null &&
        assignments[i].kind === 'REST' && assignments[i].reason === 'Open slot' &&
        !adjacent(i),
      );
    let theme: 'PULL' | 'DIP' = 'PULL';
    for (const { d, i } of candidates) {
      if (streetLiftLeft === 0) break;
      assignments[i] = {
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        kind: theme === 'PULL' ? 'STREET_LIFT_PULL' : 'STREET_LIFT_DIP',
        theme: theme === 'PULL' ? 'Weighted pull-ups / muscle-up work' : 'Weighted dips / bench lockout carryover',
        minutes: d.minutes,
        reason: 'Street-lift day',
      };
      theme = theme === 'PULL' ? 'DIP' : 'PULL';
      streetLiftLeft -= 1;
    }
    // If nothing fit, relax the adjacency rule.
    if (streetLiftLeft > 0) {
      const relaxed = weekPlan.days
        .map((d, i) => ({ d, i }))
        .filter(({ d, i }) =>
          d.minutes !== null &&
          assignments[i].kind === 'REST' && assignments[i].reason === 'Open slot',
        );
      for (const { d, i } of relaxed) {
        if (streetLiftLeft === 0) break;
        assignments[i] = {
          date: d.date,
          dayOfWeek: d.dayOfWeek,
          kind: 'STREET_LIFT_PULL',
          theme: 'Weighted pull-ups / muscle-up work',
          minutes: d.minutes,
          reason: 'Street-lift day (tight week)',
        };
        streetLiftLeft -= 1;
      }
    }
  }

  // Pass 3: calisthenics skill. Can ride on short days, or pair with a
  // non-squat/DL PL day if we're out of open slots.
  let caliLeft = caliTarget;
  if (caliLeft > 0) {
    // Prefer short open days first (they're a bad fit for PL anyway).
    const openShort = weekPlan.days
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) =>
        d.minutes !== null &&
        assignments[i].kind === 'REST' && assignments[i].reason === 'Open slot' &&
        typeof d.minutes === 'number' && d.minutes < SHORT_MINUTES_THRESHOLD,
      );
    for (const { d, i } of openShort) {
      if (caliLeft === 0) break;
      assignments[i] = {
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        kind: 'CALISTHENICS_SKILL',
        theme: 'Front lever / planche / handstand skill work',
        minutes: d.minutes,
        reason: 'Short day — skill block',
      };
      caliLeft -= 1;
    }
    // Next: any remaining open slot.
    if (caliLeft > 0) {
      const openAny = weekPlan.days
        .map((d, i) => ({ d, i }))
        .filter(({ d, i }) =>
          d.minutes !== null &&
          assignments[i].kind === 'REST' && assignments[i].reason === 'Open slot',
        );
      for (const { d, i } of openAny) {
        if (caliLeft === 0) break;
        assignments[i] = {
          date: d.date,
          dayOfWeek: d.dayOfWeek,
          kind: 'CALISTHENICS_SKILL',
          theme: 'Front lever / planche / handstand skill work',
          minutes: d.minutes,
          reason: 'Skill block',
        };
        caliLeft -= 1;
      }
    }
    // Fallback: pair with a bench PL day (low systemic conflict). Never
    // pair with squat or deadlift days — that breaks the systemic rule.
    if (caliLeft > 0) {
      const benchIdx = assignments.findIndex(
        (a) => a.kind === 'POWERLIFTING' && !isHighSystemic(a.primaryLift),
      );
      if (benchIdx >= 0) {
        assignments[benchIdx] = {
          ...assignments[benchIdx],
          theme: 'Bench + skill work (pair day)',
          reason: `${assignments[benchIdx].reason} + skill work`,
        };
        caliLeft -= 1;
      }
    }
  }

  // Finalize rest reasons: any remaining "Open slot" stays as REST w/ a
  // nicer label.
  for (let i = 0; i < assignments.length; i++) {
    if (assignments[i].kind === 'REST' && assignments[i].reason === 'Open slot') {
      assignments[i] = { ...assignments[i], reason: 'Rest day' };
    }
  }

  const plSessions = assignments.filter((a) => a.kind === 'POWERLIFTING').length;
  const streetLiftSessions = assignments.filter(
    (a) => a.kind === 'STREET_LIFT_PULL' || a.kind === 'STREET_LIFT_DIP',
  ).length;
  const calisthenicsSessions = assignments.filter((a) => a.kind === 'CALISTHENICS_SKILL').length;
  const restDays = assignments.filter((a) => a.kind === 'REST').length;

  return {
    weekStart: weekPlan.weekStart,
    assignments,
    plSessions,
    streetLiftSessions,
    calisthenicsSessions,
    restDays,
  };
}

/** Compact one-line summary for logs / the coach prompt. */
export function describeHybridPlan(plan: HybridPlan): string {
  const parts: string[] = [];
  if (plan.plSessions) parts.push(`${plan.plSessions} PL`);
  if (plan.streetLiftSessions) parts.push(`${plan.streetLiftSessions} street-lift`);
  if (plan.calisthenicsSessions) parts.push(`${plan.calisthenicsSessions} skill`);
  if (plan.restDays) parts.push(`${plan.restDays} rest`);
  return parts.join(' · ');
}
