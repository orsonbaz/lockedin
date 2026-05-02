/**
 * lift-exposures.ts — Build the per-lift recency signal consumed by the
 * adaptive primary-lift selector in `session.ts`.
 *
 * Reads the last 21 days of sessions so the adaptive generator can answer:
 *   - How long has it been since this lift was primary?
 *   - How many times has it been primary this ISO week?
 *
 * Kept separate from `session.ts` so the generator stays a pure function.
 */

import { db } from '@/lib/db/database';
import type { LiftExposure } from './session';
import type { Lift } from '@/lib/db/types';

const COMP_LIFTS: Lift[] = ['SQUAT', 'BENCH', 'DEADLIFT'];

function mondayOf(dateStr: string): string {
  const d   = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Returns per-lift exposure for SQUAT / BENCH / DEADLIFT relative to `onDate`.
 * Only COMPLETED sessions count — a SCHEDULED or MODIFIED session the athlete
 * never actually did should not steal exposure credit. Sessions scheduled
 * *after* `onDate` are ignored so the caller can run this for historical
 * dates without leaking the future.
 */
export async function loadRecentLiftExposures(onDate: string): Promise<LiftExposure[]> {
  const weekStart = mondayOf(onDate);

  // Over-fetch to survive any number of recent skipped/scheduled rows, then
  // filter by status. We read more than we need so the filter leaves at
  // least a couple of weeks of real history for each lift.
  const sessions = await db.sessions
    .orderBy('scheduledDate')
    .reverse()
    .limit(60)
    .toArray();

  const past = sessions.filter(
    (s) => s.scheduledDate < onDate && s.status === 'COMPLETED',
  );

  return COMP_LIFTS.map<LiftExposure>((lift) => {
    const matching = past.filter((s) => s.primaryLift === lift);
    const last = matching[0];
    const daysSince = last ? daysBetween(last.scheduledDate, onDate) : Infinity;
    const weekCount = past.filter(
      (s) => s.primaryLift === lift && s.scheduledDate >= weekStart && s.scheduledDate < onDate,
    ).length;
    return { lift, daysSince, weekCount };
  });
}

/** Recency tag used by the recent-exposure protocol in STRUCTURE_KNOWLEDGE. */
export type RecencyTag = 'FRESH' | 'RECOVERED' | 'OVERDUE' | 'STACKED';

export function recencyTagFor(e: LiftExposure): RecencyTag {
  if (!Number.isFinite(e.daysSince))                    return 'OVERDUE';
  if (e.weekCount >= 3)                                 return 'STACKED';
  if (e.daysSince >= 5 && e.weekCount <= 1)             return 'OVERDUE';
  if (e.daysSince <= 2)                                 return 'FRESH';
  return 'RECOVERED';
}

/**
 * Role the *next* appearance of this lift this week should play, per the
 * MULTI_FREQUENCY_KNOWLEDGE module. Drives session shape: PRIMARY = comp +
 * top-set, SECONDARY = variation -0.5 RPE, TERTIARY = skill/positional,
 * QUATERNARY = speed/skip-candidate. The chat coach, session author, and
 * session advisor all consume this so they pick the right role for today
 * instead of cloning the primary day.
 */
export type AppearanceRole = 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | 'QUATERNARY';

export function nextAppearanceRoleFor(e: LiftExposure): AppearanceRole {
  if (e.weekCount === 0) return 'PRIMARY';
  if (e.weekCount === 1) return 'SECONDARY';
  if (e.weekCount === 2) return 'TERTIARY';
  return 'QUATERNARY';
}

/**
 * One line per comp lift summarising recency, weekly frequency, the
 * STRUCTURE_KNOWLEDGE recency tag, AND the role the next appearance of
 * this lift should play (PRIMARY / SECONDARY / TERTIARY / QUATERNARY).
 * Shared between the chat coach, session author, and session advisor so
 * all three pick session shape from the same prediction.
 *
 *   SQUAT: 3d since primary, 2× this week → RECOVERED (next = TERTIARY)
 *   BENCH: never primary, 0× this week    → OVERDUE (next = PRIMARY)
 *   DEADLIFT: 1d since primary, 1× this week → FRESH (next = SECONDARY)
 */
export function formatExposureLines(exposures: LiftExposure[]): string[] {
  return exposures.map((e) => {
    const days = Number.isFinite(e.daysSince) ? `${e.daysSince}d since primary` : 'never primary';
    return `${e.lift}: ${days}, ${e.weekCount}× this week → ${recencyTagFor(e)} (next = ${nextAppearanceRoleFor(e)})`;
  });
}
