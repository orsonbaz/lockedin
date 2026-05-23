/**
 * Mobility module — public API.
 *
 * Static library of MobilityMovement entries + 6 routine templates + a
 * rule-based routine generator. Kept separate from `src/lib/exercises/` so
 * the strength swap engine doesn't accidentally pull mobility work into a
 * strength session candidate set.
 *
 * The DB-backed equivalents (`mobilityRoutines`, `mobilitySessions`,
 * `mobilityRomEntries`) hold per-athlete custom rows and runtime state.
 * Built-in templates here are seeded on first access via `ensureSeeded`.
 */

import { db, newId, today } from '@/lib/db/database';
import type {
  MobilityMovement,
  MobilityRoutine,
  MobilitySession,
  MobilityCategory,
  BodyRegion,
} from '@/lib/db/types';

import { carsMovements }          from './library/cars';
import { hipOpenerMovements }     from './library/hip-opener';
import { tSpineMovements }        from './library/t-spine';
import { shoulderRomMovements }   from './library/shoulder-rom';
import { ankleMovements }         from './library/ankle';
import { spinalMovements }        from './library/spinal';
import { neuralGlideMovements }   from './library/neural-glides';
import { breathingMovements }     from './library/breathing';
import { groundFlowMovements }    from './library/ground-flow';
import { TEMPLATE_ROUTINES }      from './routines';

export { TEMPLATE_ROUTINES } from './routines';

// ── Aggregated library ───────────────────────────────────────────────────────

export const MOBILITY_LIBRARY: MobilityMovement[] = [
  ...carsMovements,
  ...hipOpenerMovements,
  ...tSpineMovements,
  ...shoulderRomMovements,
  ...ankleMovements,
  ...spinalMovements,
  ...neuralGlideMovements,
  ...breathingMovements,
  ...groundFlowMovements,
];

export const MOBILITY_BY_ID = new Map<string, MobilityMovement>(
  MOBILITY_LIBRARY.map((m) => [m.id, m]),
);

export const MOBILITY_BY_CATEGORY = new Map<MobilityCategory, MobilityMovement[]>();
for (const m of MOBILITY_LIBRARY) {
  const bucket = MOBILITY_BY_CATEGORY.get(m.category) ?? [];
  bucket.push(m);
  MOBILITY_BY_CATEGORY.set(m.category, bucket);
}

export const MOBILITY_BY_REGION = new Map<BodyRegion, MobilityMovement[]>();
for (const m of MOBILITY_LIBRARY) {
  for (const r of m.regions) {
    const bucket = MOBILITY_BY_REGION.get(r) ?? [];
    bucket.push(m);
    MOBILITY_BY_REGION.set(r, bucket);
  }
}

// ── UI labels ────────────────────────────────────────────────────────────────

export const MOBILITY_CATEGORY_LABELS: Record<MobilityCategory, string> = {
  CARS:          'CARs (joint rotations)',
  HIP_OPENER:    'Hip openers',
  T_SPINE:       'Thoracic spine',
  L_SPINE:       'Lumbar / core',
  SHOULDER_ROM:  'Shoulder ROM',
  ANKLE:         'Ankle',
  WRIST_FOREARM: 'Wrist / forearm',
  NEURAL_GLIDE:  'Neural glides',
  BREATHING:     'Breathing',
  SOFT_TISSUE:   'Soft tissue',
  GROUND_FLOW:   'Ground flow',
};

// ── Lookup helpers (used by pages + coach) ───────────────────────────────────

export function getMovement(id: string): MobilityMovement | undefined {
  return MOBILITY_BY_ID.get(id);
}

export async function getRoutine(id: string): Promise<MobilityRoutine | undefined> {
  // Try DB first (custom routines and seeded templates land here), then fall
  // back to the static template list when the seed hasn't run yet.
  const fromDb = await db.mobilityRoutines.get(id);
  if (fromDb) return fromDb;
  return TEMPLATE_ROUTINES.find((r) => r.id === id);
}

export async function listRoutines(): Promise<MobilityRoutine[]> {
  // Merge DB rows with template rows, preferring DB rows on id collision.
  await ensureSeeded();
  const dbRows = await db.mobilityRoutines.toArray();
  const dbIds = new Set(dbRows.map((r) => r.id));
  const templates = TEMPLATE_ROUTINES.filter((r) => !dbIds.has(r.id));
  return [...dbRows, ...templates]
    .filter((r) => !r.archivedAt)
    .sort((a, b) => a.durationMin - b.durationMin);
}

/**
 * Seed the built-in template routines into Dexie on first launch.
 * Idempotent — re-running is a no-op once the templates exist. We never
 * overwrite existing rows, so an athlete's edits to a seeded template are
 * preserved across reloads.
 */
export async function ensureSeeded(): Promise<void> {
  const existing = new Set(
    (await db.mobilityRoutines.toCollection().primaryKeys()) as string[],
  );
  const newRoutines = TEMPLATE_ROUTINES.filter((r) => !existing.has(r.id));
  if (newRoutines.length > 0) {
    await db.mobilityRoutines.bulkAdd(newRoutines);
  }
}

// ── Session lifecycle ────────────────────────────────────────────────────────

export async function startSession(routineId: string): Promise<MobilitySession> {
  const session: MobilitySession = {
    id: newId(),
    routineId,
    date: today(),
    completedAt: undefined,
    totalMinutes: undefined,
  };
  await db.mobilitySessions.add(session);
  return session;
}

export async function completeSession(
  sessionId: string,
  totalMinutes: number,
  note?: string,
): Promise<void> {
  await db.mobilitySessions.update(sessionId, {
    completedAt: new Date().toISOString(),
    totalMinutes,
    note,
  });
}

/** Sessions completed in the last `days` days, newest first. */
export async function recentCompletedSessions(days: number): Promise<MobilitySession[]> {
  const cutoff = isoDaysAgo(days);
  const rows = await db.mobilitySessions.where('date').above(cutoff).toArray();
  return rows
    .filter((s) => s.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
