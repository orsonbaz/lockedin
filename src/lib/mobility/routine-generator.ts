/**
 * Rule-based mobility routine generator.
 *
 * Composes an ordered movement list from the library given a time budget,
 * a focus tag, active injuries, and optional weak ROM regions. Deterministic
 * (no LLM in the loop) so the same inputs always produce the same routine —
 * the LLM-driven path lives behind the coach's GENERATE_MOBILITY_FLOW action
 * and only adds cuing on top of this output.
 *
 * Pure functions throughout — easy to unit-test.
 */

import type {
  MobilityMovement,
  MobilityCategory,
  BodyRegion,
  Injury,
} from '@/lib/db/types';
import {
  MOBILITY_LIBRARY,
  MOBILITY_BY_CATEGORY,
  MOBILITY_BY_REGION,
} from './index';

// ── Focus / intent ───────────────────────────────────────────────────────────

export type MobilityFocus =
  | 'AM_RESET'
  | 'PM_DECOMPRESS'
  | 'PRE_SQUAT'
  | 'PRE_PRESS'
  | 'PRE_DEADLIFT'
  | 'DESK_RESET'
  | 'POST_SESSION'
  | 'CUSTOM';

export interface GenerateRoutineInput {
  focus: MobilityFocus;
  /** Time budget in minutes (hard cap). */
  minutes: number;
  /** Currently-active injuries — drive contraindication filtering. */
  injuries?: Injury[];
  /** ROM regions the athlete has flagged or that recent assessments show weak. */
  weakRegions?: BodyRegion[];
  /**
   * Phase C — body regions with an active/passive ROM gap > ~15°. When set,
   * the generator prepends a PAIL/RAIL sequence for the first such region
   * before filling the blueprint, so end-range work goes where the gap is.
   * Sourced from `computeActiveRomGap()` in rom-assessment.ts.
   */
  gappedRegions?: BodyRegion[];
  /** Optional explicit movement IDs to seed the routine with. */
  seedMovementIds?: string[];
}

export interface GeneratedRoutine {
  focus: MobilityFocus;
  estimatedMinutes: number;
  movementIds: string[];
  /** Movements in the order they'll be performed, hydrated for the runner. */
  movements: MobilityMovement[];
  /** Free-text note explaining why these were chosen, surfaced in the UI. */
  rationale: string;
}

// ── Estimation ───────────────────────────────────────────────────────────────

/**
 * Time estimate for a single movement. Each rep costs ~3 sec; unilateral work
 * doubles. Add 15 sec setup overhead per movement so a routine of 8 small
 * movements doesn't pretend to be 90 seconds.
 */
export function estimateMovementSeconds(m: MobilityMovement): number {
  let core = 0;
  if (m.durationSec) core += m.durationSec * (m.sides === 'UNILATERAL' ? 2 : 1);
  else if (m.reps) core += m.reps * 3;
  else core += 60;
  return core + 15; // setup
}

export function estimateRoutineMinutes(movements: MobilityMovement[]): number {
  const sec = movements.reduce((sum, m) => sum + estimateMovementSeconds(m), 0);
  return Math.round(sec / 60);
}

// ── Generator ────────────────────────────────────────────────────────────────

/**
 * Per-focus ordered template: which categories to draw from, in what order,
 * and how many movements to attempt from each. The generator iterates through
 * this skeleton, fills it with library picks (filtered by injury constraints
 * and biased toward weak regions), then trims to fit the time budget.
 */
const FOCUS_BLUEPRINTS: Record<MobilityFocus, Array<{ category: MobilityCategory; want: number }>> = {
  AM_RESET: [
    { category: 'CARS',         want: 4 },
    { category: 'GROUND_FLOW',  want: 1 },
    { category: 'HIP_OPENER',   want: 1 },
    { category: 'T_SPINE',      want: 1 },
  ],
  PM_DECOMPRESS: [
    { category: 'BREATHING',    want: 1 },
    { category: 'L_SPINE',      want: 2 },
    { category: 'HIP_OPENER',   want: 1 },
    { category: 'BREATHING',    want: 1 },
  ],
  PRE_SQUAT: [
    { category: 'CARS',         want: 2 },
    { category: 'ANKLE',        want: 2 },
    { category: 'HIP_OPENER',   want: 1 },
    { category: 'GROUND_FLOW',  want: 1 },
  ],
  PRE_DEADLIFT: [
    { category: 'CARS',         want: 1 },
    { category: 'HIP_OPENER',   want: 2 },
    { category: 'T_SPINE',      want: 1 },
    { category: 'L_SPINE',      want: 1 },
  ],
  PRE_PRESS: [
    { category: 'CARS',         want: 2 },
    { category: 'SHOULDER_ROM', want: 2 },
    { category: 'T_SPINE',      want: 1 },
  ],
  DESK_RESET: [
    { category: 'BREATHING',    want: 1 },
    { category: 'L_SPINE',      want: 2 },
    { category: 'T_SPINE',      want: 2 },
    { category: 'HIP_OPENER',   want: 2 },
    { category: 'SHOULDER_ROM', want: 1 },
  ],
  POST_SESSION: [
    { category: 'BREATHING',    want: 1 },
    { category: 'HIP_OPENER',   want: 2 },
    { category: 'L_SPINE',      want: 1 },
    { category: 'BREATHING',    want: 1 },
  ],
  CUSTOM: [
    { category: 'CARS',         want: 2 },
    { category: 'HIP_OPENER',   want: 2 },
    { category: 'T_SPINE',      want: 1 },
    { category: 'SHOULDER_ROM', want: 1 },
  ],
};

/**
 * Filter a candidate pool by active-injury constraints. The injury system's
 * hard contraindications live on the strength side (swap groups + movement
 * patterns); mobility filtering is more conservative — we drop movements that
 * touch contraindicated regions only when the injury is ACUTE/SUBACUTE.
 *
 * Side note on intent: this is intentionally permissive. Mobility work is
 * usually corrective; preserving access to it is more valuable than blocking
 * by default. The runner will surface the symptom log so the athlete can
 * skip a problem movement live.
 */
function filterForInjuries(
  candidates: MobilityMovement[],
  injuries: Injury[],
): MobilityMovement[] {
  if (injuries.length === 0) return candidates;

  // Build a set of regions that should be avoided entirely (acute/subacute
  // injuries with PAIN_FREE_RANGE_ONLY or NO_OVERHEAD-style constraints).
  const blockedRegions = new Set<BodyRegion>();
  for (const inj of injuries) {
    if (inj.status !== 'ACUTE' && inj.status !== 'SUBACUTE') continue;
    if (
      inj.constraints.includes('PAIN_FREE_RANGE_ONLY') ||
      inj.severity >= 4
    ) {
      for (const r of inj.regions) blockedRegions.add(r);
    }
  }
  if (blockedRegions.size === 0) return candidates;

  return candidates.filter((m) => !m.regions.some((r) => blockedRegions.has(r)));
}

/**
 * Score a candidate movement higher when it serves a weak region. Used as a
 * tiebreaker within a category pool — keeps the routine consistent
 * (same focus + same weak regions = same picks).
 */
function scoreCandidate(m: MobilityMovement, weakRegions: BodyRegion[]): number {
  let score = 0;
  for (const r of m.regions) {
    if (weakRegions.includes(r)) score += 2;
  }
  if (m.hasRomAssessment) score += 1;       // ROM-trackable movements pay double duty
  return score;
}

export function generateRoutine(input: GenerateRoutineInput): GeneratedRoutine {
  const {
    focus,
    minutes,
    injuries = [],
    weakRegions = [],
    gappedRegions = [],
    seedMovementIds = [],
  } = input;
  const blueprint = FOCUS_BLUEPRINTS[focus];

  // Build the candidate pool per blueprint slot. We use a two-pass fill so
  // every blueprint category gets at least one movement before we start
  // doubling up — this prevents tight time budgets from accidentally dropping
  // entire categories (e.g. PRE_PRESS ending up with zero shoulder work).
  const slotPicks: MobilityMovement[][] = blueprint.map((slot) => {
    const pool = filterForInjuries(MOBILITY_BY_CATEGORY.get(slot.category) ?? [], injuries);
    pool.sort((a, b) => scoreCandidate(b, weakRegions) - scoreCandidate(a, weakRegions));
    return pool;
  });

  const picked: MobilityMovement[] = [];
  const seen = new Set<string>();

  // Seed first — explicit IDs always win.
  for (const id of seedMovementIds) {
    const m = MOBILITY_LIBRARY.find((x) => x.id === id);
    if (m && !seen.has(m.id)) {
      picked.push(m);
      seen.add(m.id);
    }
  }

  // Phase C — prepend up to 2 PAIL/RAIL movements for any gapped region.
  // End-range isometric loading goes WHERE the active/passive ROM gap is.
  // Filtered by injuries like everything else; counts against the time budget
  // and will be trimmed by the budget logic below if it overruns.
  if (gappedRegions.length > 0) {
    const pailRailPool = filterForInjuries(
      MOBILITY_BY_CATEGORY.get('PAILS_RAILS') ?? [],
      injuries,
    );
    let inserted = 0;
    for (const region of gappedRegions) {
      if (inserted >= 2) break;
      const candidate = pailRailPool.find(
        (m) => m.regions.includes(region) && !seen.has(m.id),
      );
      if (candidate) {
        picked.push(candidate);
        seen.add(candidate.id);
        inserted++;
      }
    }
  }

  // Track which movements came from which slot so trimming can preserve at
  // least one per category.
  const slotIndexOf = new Map<string, number>();

  // Pass 1: take the top candidate from each slot in order.
  blueprint.forEach((_slot, slotIdx) => {
    const pool = slotPicks[slotIdx];
    const first = pool.find((m) => !seen.has(m.id));
    if (first) {
      picked.push(first);
      seen.add(first.id);
      slotIndexOf.set(first.id, slotIdx);
    }
  });

  // Pass 2: fulfill the remaining `want` counts.
  blueprint.forEach((slot, slotIdx) => {
    const pool = slotPicks[slotIdx];
    let taken = 1; // first pick from pass 1
    for (const m of pool) {
      if (taken >= slot.want) break;
      if (seen.has(m.id)) continue;
      picked.push(m);
      seen.add(m.id);
      slotIndexOf.set(m.id, slotIdx);
      taken++;
    }
  });

  // Trim to fit time budget. Strategy: drop the LAST movement of whichever
  // slot has more than one entry. Repeat until under budget or every slot is
  // down to one. Only then dip below one-per-slot, dropping from the back.
  let estMin = estimateRoutineMinutes(picked);
  while (picked.length > 1 && estMin > minutes) {
    const dropIdx = findDropIndex(picked, slotIndexOf);
    if (dropIdx === -1) break;
    const [dropped] = picked.splice(dropIdx, 1);
    seen.delete(dropped.id);
    estMin = estimateRoutineMinutes(picked);
  }

  // If still over budget, fall back to popping from the end (now we're
  // shedding the last category — accept that as an inevitable trade-off).
  while (picked.length > 1 && estMin > minutes) {
    const dropped = picked.pop()!;
    seen.delete(dropped.id);
    estMin = estimateRoutineMinutes(picked);
  }

  // Backfill if we're way under budget — bias toward weak regions.
  if (estMin < minutes - 2) {
    const extras = filterForInjuries(MOBILITY_LIBRARY, injuries)
      .filter((m) => !seen.has(m.id));
    extras.sort((a, b) => scoreCandidate(b, weakRegions) - scoreCandidate(a, weakRegions));
    for (const m of extras) {
      const projected = estMin + estimateMovementSeconds(m) / 60;
      if (projected > minutes) continue;
      picked.push(m);
      seen.add(m.id);
      estMin = projected;
      if (estMin >= minutes - 1) break;
    }
  }

  const rationaleParts: string[] = [
    `${prettyFocus(focus)} flow, ${minutes} min budget.`,
  ];
  if (injuries.length > 0) {
    const hot = injuries.filter((i) => i.status === 'ACUTE' || i.status === 'SUBACUTE');
    if (hot.length > 0) {
      rationaleParts.push(`Filtered out movements touching active injury regions (${hot.length}).`);
    }
  }
  if (weakRegions.length > 0) {
    rationaleParts.push(`Biased toward weak ROM in: ${weakRegions.join(', ')}.`);
  }
  if (gappedRegions.length > 0) {
    rationaleParts.push(
      `PAIL/RAIL work added for active-ROM gap in: ${gappedRegions.join(', ')}.`,
    );
  }

  return {
    focus,
    estimatedMinutes: estimateRoutineMinutes(picked),
    movementIds: picked.map((m) => m.id),
    movements: picked,
    rationale: rationaleParts.join(' '),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the index of the next movement to drop during trim. Returns the last
 * movement belonging to whichever slot is over-represented (>1 entry). Returns
 * -1 when every slot is down to exactly one — callers then dip into the
 * fallback strategy.
 */
function findDropIndex(
  picked: readonly MobilityMovement[],
  slotIndexOf: Map<string, number>,
): number {
  // Count picks per slot.
  const countsPerSlot = new Map<number, number>();
  for (const m of picked) {
    const idx = slotIndexOf.get(m.id);
    if (idx === undefined) continue;
    countsPerSlot.set(idx, (countsPerSlot.get(idx) ?? 0) + 1);
  }
  // Walk picked in reverse — first match in an over-represented slot wins.
  for (let i = picked.length - 1; i >= 0; i--) {
    const slot = slotIndexOf.get(picked[i].id);
    if (slot === undefined) continue;
    if ((countsPerSlot.get(slot) ?? 0) > 1) return i;
  }
  return -1;
}

function prettyFocus(f: MobilityFocus): string {
  switch (f) {
    case 'AM_RESET':       return 'AM reset';
    case 'PM_DECOMPRESS':  return 'PM decompress';
    case 'PRE_SQUAT':      return 'Pre-squat prep';
    case 'PRE_PRESS':      return 'Pre-press prep';
    case 'PRE_DEADLIFT':   return 'Pre-deadlift prep';
    case 'DESK_RESET':     return 'Desk reset';
    case 'POST_SESSION':   return 'Post-session cooldown';
    case 'CUSTOM':         return 'Custom';
  }
}

// Re-export the by-region map so callers that only need regional groupings
// don't have to reach into ./index.
export { MOBILITY_BY_REGION };
