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
 * Sessions scheduled *after* `onDate` are ignored so the caller can run this
 * for historical dates without leaking the future.
 */
export async function loadRecentLiftExposures(onDate: string): Promise<LiftExposure[]> {
  const weekStart = mondayOf(onDate);

  // Over-fetch slightly in case there are many duplicates — we only look at
  // the past 21 days.
  const sessions = await db.sessions
    .orderBy('scheduledDate')
    .reverse()
    .limit(30)
    .toArray();

  const past = sessions.filter((s) => s.scheduledDate < onDate);

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
