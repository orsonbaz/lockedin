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
