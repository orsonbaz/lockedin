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
    const wasPrimary   = (s: typeof past[number]) => s.primaryLift === lift;
    const wasSecondary = (s: typeof past[number]) => (s.secondaryLifts ?? []).includes(lift);
    const wasAny       = (s: typeof past[number]) => wasPrimary(s) || wasSecondary(s);

    // Primary-only signal — drives role determination (PRIMARY / SECONDARY / ...).
    const lastPrimary = past.find(wasPrimary);
    const daysSince = lastPrimary ? daysBetween(lastPrimary.scheduledDate, onDate) : Infinity;
    const weekCount = past.filter(
      (s) => wasPrimary(s) && s.scheduledDate >= weekStart && s.scheduledDate < onDate,
    ).length;

    // Any-appearance signal — catches "bench-as-secondary yesterday" so the
    // coach has full fatigue awareness regardless of whether the lift was
    // the focus of those prior sessions.
    const lastAny = past.find(wasAny);
    const daysSinceAny = lastAny ? daysBetween(lastAny.scheduledDate, onDate) : Infinity;
    const secondaryCount = past.filter(
      (s) => wasSecondary(s) && s.scheduledDate >= weekStart && s.scheduledDate < onDate,
    ).length;

    return { lift, daysSince, weekCount, daysSinceAny, secondaryCount };
  });
}

/** Recency tag used by the recent-exposure protocol in STRUCTURE_KNOWLEDGE. */
export type RecencyTag = 'FRESH' | 'RECOVERED' | 'OVERDUE' | 'STACKED';

export function recencyTagFor(e: LiftExposure): RecencyTag {
  // FRESH / RECOVERED reflect fatigue, so they read from "any appearance"
  // — a bench-as-secondary yesterday makes today's bench NOT FRESH even if
  // the last bench-primary was 5 days ago. STACKED uses total weekly
  // exposure (primary + secondary) so the lift is flagged once it has
  // accumulated meaningful weekly volume regardless of role split.
  const daysSinceAny   = e.daysSinceAny   ?? e.daysSince;
  const secondaryCount = e.secondaryCount ?? 0;
  const totalCount     = e.weekCount + secondaryCount;

  if (!Number.isFinite(daysSinceAny))                   return 'OVERDUE';
  if (e.weekCount >= 3 || totalCount >= 4)              return 'STACKED';
  if (daysSinceAny >= 5 && totalCount <= 1)             return 'OVERDUE';
  if (daysSinceAny <= 2)                                return 'FRESH';
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
 * One line per comp lift summarising recency, weekly frequency (primary +
 * secondary appearances), the STRUCTURE_KNOWLEDGE recency tag, AND the
 * role the next appearance of this lift should play (PRIMARY / SECONDARY /
 * TERTIARY / QUATERNARY). Shared between the chat coach, session author,
 * and session advisor.
 *
 * Format adapts to whether secondary appearances exist:
 *   - No secondary exposure: "SQUAT: 3d since primary, 1× this week → RECOVERED (next = SECONDARY)"
 *   - Mixed primary + secondary: "BENCH: 1d since last (primary 5d ago), 1× primary + 1× secondary this week → FRESH (next = SECONDARY)"
 *   - Secondary-only: "BENCH: 1d since last (never primary), 0× primary + 1× secondary this week → FRESH (next = PRIMARY)"
 */
export function formatExposureLines(exposures: LiftExposure[]): string[] {
  return exposures.map((e) => {
    const daysSinceAny   = e.daysSinceAny   ?? e.daysSince;
    const secondaryCount = e.secondaryCount ?? 0;

    // Recency phrase — show "since last" only when secondary appearances
    // would otherwise hide; default to "since primary" when the two agree.
    const fmtDays = (n: number) => (Number.isFinite(n) ? `${n}d` : 'never');
    let recencyPhrase: string;
    if (secondaryCount === 0 && daysSinceAny === e.daysSince) {
      recencyPhrase = `${fmtDays(e.daysSince)} since primary`;
    } else if (Number.isFinite(e.daysSince) && e.daysSince === daysSinceAny) {
      recencyPhrase = `${fmtDays(daysSinceAny)} since last (primary day)`;
    } else if (Number.isFinite(e.daysSince)) {
      recencyPhrase = `${fmtDays(daysSinceAny)} since last (primary ${fmtDays(e.daysSince)} ago)`;
    } else {
      recencyPhrase = `${fmtDays(daysSinceAny)} since last (never primary)`;
    }

    // Count phrase — show secondary count only when it's > 0 so the noise
    // floor stays low for athletes who don't run multi-lift sessions.
    const countPhrase = secondaryCount > 0
      ? `${e.weekCount}× primary + ${secondaryCount}× secondary this week`
      : `${e.weekCount}× this week`;

    return `${e.lift}: ${recencyPhrase}, ${countPhrase} → ${recencyTagFor(e)} (next = ${nextAppearanceRoleFor(e)})`;
  });
}
