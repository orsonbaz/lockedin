/**
 * Range-of-motion (ROM) tracking helpers.
 *
 * Two flavors of data live on `mobilityRomEntries`:
 *   1. Self-rating (0-100) — captured inline after a movement, weekly minimum.
 *   2. Measured degrees — periodic marker assessments (knee-to-wall in cm,
 *      shoulder flexion vs wall, sit-and-reach). Higher-fidelity, less
 *      frequent — once a week or so.
 *
 * Pure helpers for trend math. The page that consumes them lives at
 * /mobility (recent ROM card) and later at /health (ROM pillar of the
 * longevity score).
 */

import { db, newId, today } from '@/lib/db/database';
import type {
  MobilityRomEntry,
  BodyRegion,
  MobilitySideTag,
} from '@/lib/db/types';
import { carsMovements } from '@/lib/mobility/library/cars';

/** Record a per-movement self-rating (0-100). */
export async function logSelfRating(input: {
  movementId: string;
  region: BodyRegion;
  selfRating: number;
  side?: MobilitySideTag;
  date?: string;
}): Promise<MobilityRomEntry> {
  const entry: MobilityRomEntry = {
    id: newId(),
    date: input.date ?? today(),
    movementId: input.movementId,
    region: input.region,
    selfRating: Math.max(0, Math.min(100, Math.round(input.selfRating))),
    side: input.side,
    loggedAt: new Date().toISOString(),
  };
  await db.mobilityRomEntries.add(entry);
  return entry;
}

/**
 * Phase B — record a paired active/passive ROM assessment.
 *
 * The active/passive gap is the central FRC training target. A typical entry
 * captures the passive end-range (assisted / gravity / prop) AND the active
 * end-range (under the athlete's own muscular control). The gap surfaces in
 * `computeActiveRomGap()` and biases PAIL/RAIL routine selection.
 */
export async function logActivePassiveRom(input: {
  movementId: string;
  region: BodyRegion;
  passiveRom: number;
  activeRom: number;
  assessmentMethod?: 'SELF_RATING' | 'GONIOMETER' | 'PHOTO';
  side?: MobilitySideTag;
  date?: string;
}): Promise<MobilityRomEntry> {
  const entry: MobilityRomEntry = {
    id: newId(),
    date: input.date ?? today(),
    movementId: input.movementId,
    region: input.region,
    passiveRom: input.passiveRom,
    activeRom: input.activeRom,
    assessmentMethod: input.assessmentMethod ?? 'SELF_RATING',
    side: input.side,
    loggedAt: new Date().toISOString(),
  };
  await db.mobilityRomEntries.add(entry);
  return entry;
}

/** Record a measured marker value (degrees for joints, cm for sit-and-reach). */
export async function logMeasured(input: {
  movementId: string;
  region: BodyRegion;
  measuredDegrees: number;
  side?: MobilitySideTag;
  date?: string;
}): Promise<MobilityRomEntry> {
  const entry: MobilityRomEntry = {
    id: newId(),
    date: input.date ?? today(),
    movementId: input.movementId,
    region: input.region,
    measuredDegrees: input.measuredDegrees,
    side: input.side,
    loggedAt: new Date().toISOString(),
  };
  await db.mobilityRomEntries.add(entry);
  return entry;
}

/** Most-recent rating per (movement, side). Useful for the "Recent ROM" card. */
export async function recentRatings(limit = 12): Promise<MobilityRomEntry[]> {
  const rows = await db.mobilityRomEntries.toArray();
  // Deduplicate by movement+side, keeping newest.
  const seen = new Map<string, MobilityRomEntry>();
  rows
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .forEach((r) => {
      const key = `${r.movementId}::${r.side ?? 'BIL'}`;
      if (!seen.has(key)) seen.set(key, r);
    });
  return Array.from(seen.values()).slice(0, limit);
}

/**
 * Identify regions where the athlete's recent self-ratings are notably low.
 * Used by the routine generator to bias picks toward weak spots.
 *
 * Region is "weak" when its average self-rating over the last `windowDays`
 * is below `threshold` AND we have at least 2 data points.
 */
export async function weakRegions(
  windowDays = 30,
  threshold = 55,
): Promise<BodyRegion[]> {
  const cutoff = isoDaysAgo(windowDays);
  const rows = await db.mobilityRomEntries.where('date').above(cutoff).toArray();
  const buckets = new Map<BodyRegion, number[]>();
  for (const r of rows) {
    if (r.selfRating === undefined) continue;
    const arr = buckets.get(r.region) ?? [];
    arr.push(r.selfRating);
    buckets.set(r.region, arr);
  }
  const weak: BodyRegion[] = [];
  for (const [region, ratings] of buckets) {
    if (ratings.length < 2) continue;
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg < threshold) weak.push(region);
  }
  return weak;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Phase B: FRC-aligned helpers ─────────────────────────────────────────────
//
// CARs streak and active/passive ROM gap are the two new mobility metrics
// surfaced in Phase B. They feed scoreMobility() in longevity.ts and the
// PAIL/RAIL routine bias in Phase C.

/** Movement IDs in the static library that count as CARs ("CARS" category). */
const CARS_MOVEMENT_IDS: ReadonlySet<string> = new Set(
  carsMovements.map((m) => m.id),
);

/**
 * Compute the athlete's CAR streak.
 *
 * A "CAR day" = a calendar date with at least one completed mobility session
 * whose routine includes any CAR movement. Streak = consecutive calendar
 * days back from `asOf` where a CAR was logged.
 *
 * Cheap to compute: bounded by the small set of CAR movement IDs and the
 * last 30 days of mobility sessions.
 *
 * @param asOf  Reference date (YYYY-MM-DD). Defaults to today.
 */
export async function computeCarStreak(
  asOf: string = today(),
): Promise<{ current: number; longest: number; daysWithCarsLast7: number }> {
  // Pull recent completed mobility sessions (60 days is plenty for streak math).
  const cutoff = isoDaysAgo(60);
  const sessions = await db.mobilitySessions
    .filter((s) => Boolean(s.completedAt) && s.date >= cutoff && s.date <= asOf)
    .toArray();

  if (sessions.length === 0) {
    return { current: 0, longest: 0, daysWithCarsLast7: 0 };
  }

  // Map routineId → "does this routine contain a CAR?" (cached).
  const routineHasCar = new Map<string, boolean>();
  for (const s of sessions) {
    if (routineHasCar.has(s.routineId)) continue;
    const routine = await db.mobilityRoutines.get(s.routineId);
    const hasCar = Boolean(
      routine && routine.movementIds.some((id) => CARS_MOVEMENT_IDS.has(id)),
    );
    routineHasCar.set(s.routineId, hasCar);
  }

  // Build the set of dates with a CAR completed.
  const carDates = new Set<string>();
  for (const s of sessions) {
    if (routineHasCar.get(s.routineId)) carDates.add(s.date);
  }

  // Last 7 days
  const sevenAgo = isoDaysAgo(7);
  let daysWithCarsLast7 = 0;
  for (const d of carDates) {
    if (d > sevenAgo && d <= asOf) daysWithCarsLast7++;
  }

  // Current streak: walk back from asOf while every consecutive day is in
  // carDates. Stops at the first miss.
  let current = 0;
  let cursor = asOf;
  while (carDates.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Longest streak: scan sorted dates for max consecutive run.
  const sorted = Array.from(carDates).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev !== null && d === addDays(prev, 1)) run++;
    else run = 1;
    if (run > longest) longest = run;
    prev = d;
  }

  return { current, longest, daysWithCarsLast7 };
}

/**
 * Most-recent active vs passive ROM measurement for a body region.
 *
 * The active/passive gap is the central FRC metric. Returns the absolute
 * gap in degrees (passive minus active) plus the raw measurements when
 * available. Returns null when no entry for that region has both fields.
 *
 * @param region  Body region to query.
 * @param asOf    Optional date upper bound (YYYY-MM-DD). Defaults to today.
 */
export async function computeActiveRomGap(
  region: BodyRegion,
  asOf: string = today(),
): Promise<{ passive: number; active: number; gapDeg: number } | null> {
  const rows = await db.mobilityRomEntries
    .where('region')
    .equals(region)
    .toArray();
  // Newest first; only entries with both fields qualify.
  rows.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  for (const r of rows) {
    if (r.date > asOf) continue;
    if (r.passiveRom !== undefined && r.activeRom !== undefined) {
      return {
        passive: r.passiveRom,
        active: r.activeRom,
        gapDeg: r.passiveRom - r.activeRom,
      };
    }
  }
  return null;
}

/**
 * Weekly trend in the active/passive ROM gap, averaged across regions.
 *
 * Returns the change in average gap between the last 7 days and the prior
 * 7 days. Negative = gap closing (good — active ROM is catching up). Positive
 * = gap widening. Null when there isn't enough data to compute.
 *
 * Used by scoreMobility() as a gap-closure trend signal.
 */
export async function computeRomGapClosureDelta(
  asOf: string = today(),
): Promise<number | null> {
  const sevenAgo = isoDaysAgo(7);
  const fourteenAgo = isoDaysAgo(14);
  const rows = await db.mobilityRomEntries
    .where('date')
    .above(fourteenAgo)
    .toArray();

  const recent: number[] = [];
  const prior: number[] = [];
  for (const r of rows) {
    if (r.passiveRom === undefined || r.activeRom === undefined) continue;
    if (r.date > asOf) continue;
    const gap = r.passiveRom - r.activeRom;
    if (r.date > sevenAgo) recent.push(gap);
    else prior.push(gap);
  }
  if (recent.length === 0 || prior.length === 0) return null;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  return recentAvg - priorAvg;
}

/** Add `n` days (can be negative) to a YYYY-MM-DD date string. */
function addDays(date: string, n: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
