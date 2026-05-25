/**
 * macrocycle.ts — Generate a complete training macrocycle structure.
 * Pure function: no DB calls, no side effects.
 */

import type {
  AthleteProfile,
  ArcPriority,
  TrainingCycle,
  TrainingBlock,
  BlockType,
} from '@/lib/db/types';
import { blockToIntensity } from './calc';

// ── Public Interfaces ──────────────────────────────────────────────────────────

export interface MacrocycleInput {
  profile: AthleteProfile;
  meetDate?: string;   // ISO date string — if provided, work backwards
  startDate: string;   // ISO date string
  totalWeeks?: number; // defaults: 12 (with meet) | 8 (no meet)
  /**
   * Active arc priorities. When provided and the list does NOT include
   * `COMPETITION`, the macrocycle uses a sustainable longevity rhythm
   * (HEALTH_BASE/DELOAD, no realization peak). Omit (or include COMPETITION)
   * to fall back to powerlifting-style accumulation → intensification →
   * realization phasing.
   */
  priorities?: ArcPriority[];
}

export interface GeneratedMacrocycle {
  cycle: Omit<TrainingCycle, 'id'>;
  /** cycleId is '' — caller must set it after inserting the cycle to the DB. */
  blocks: Omit<TrainingBlock, 'id'>[];
}

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateMacrocycle(input: MacrocycleInput): GeneratedMacrocycle {
  const { meetDate, startDate, priorities } = input;

  // A meet date is itself a competition signal — even if priorities omitted
  // it, the athlete has a date on the platform, so honor the linear macrocycle.
  const competitionMode =
    meetDate !== undefined ||
    priorities === undefined ||
    priorities.includes('COMPETITION');

  const totalWeeks = input.totalWeeks ?? (meetDate ? 12 : 8);

  const blocks: Omit<TrainingBlock, 'id'>[] = competitionMode
    ? meetDate
      ? buildMeetBlocks(totalWeeks)
      : buildGeneralBlocks(totalWeeks)
    : buildLongevityBlocks(totalWeeks);

  const cycle: Omit<TrainingCycle, 'id'> = {
    name: cycleName(totalWeeks, meetDate, competitionMode),
    startDate,
    meetId:       undefined,
    totalWeeks,
    currentWeek:  1,
    status:       'ACTIVE',
    createdAt:    new Date().toISOString(),
  };

  return { cycle, blocks };
}

function cycleName(
  totalWeeks: number,
  meetDate: string | undefined,
  competitionMode: boolean,
): string {
  if (meetDate) return `${totalWeeks}-Week Meet Prep`;
  if (competitionMode) return `${totalWeeks}-Week Training Block`;
  return `${totalWeeks}-Week Longevity Block`;
}

// ── Block Builders ─────────────────────────────────────────────────────────────

/**
 * Meet-prep layout — working backwards from the competition:
 *   REALIZATION is always the final block (1–4 weeks).
 *   DELOAD weeks are inserted before REALIZATION and between
 *   ACCUMULATION/INTENSIFICATION for cycles ≥ 8 weeks.
 *
 * 12 weeks → ACCUM(3) → DELOAD(1) → INTENS(3) → DELOAD(1) → REAL(4)
 * 10 weeks → ACCUM(2) → DELOAD(1) → INTENS(3) → REAL(4)
 *  8 weeks → ACCUM(1) → DELOAD(1) → INTENS(2) → REAL(4)
 *  4 weeks → REAL(4)  (no room for prep or deloads)
 */
function buildMeetBlocks(totalWeeks: number): Omit<TrainingBlock, 'id'>[] {
  const realWeeks = Math.max(1, Math.min(4, totalWeeks));
  const remaining = totalWeeks - realWeeks;

  const blocks: Omit<TrainingBlock, 'id'>[] = [];
  let cursor = 1;

  if (remaining >= 7) {
    // Long prep: two deloads
    const accumWeeks = 3;
    const intensWeeks = remaining - accumWeeks - 2; // minus 2 deload weeks

    blocks.push(makeBlock('ACCUMULATION', cursor, cursor + accumWeeks - 1));
    cursor += accumWeeks;
    blocks.push(makeBlock('DELOAD', cursor, cursor));
    cursor += 1;
    blocks.push(makeBlock('INTENSIFICATION', cursor, cursor + intensWeeks - 1));
    cursor += intensWeeks;
    blocks.push(makeBlock('DELOAD', cursor, cursor));
    cursor += 1;
  } else if (remaining >= 4) {
    // Medium prep: one deload between accum and intens
    const accumWeeks  = Math.floor((remaining - 1) / 2);
    const intensWeeks = remaining - 1 - accumWeeks;

    if (accumWeeks > 0) {
      blocks.push(makeBlock('ACCUMULATION', cursor, cursor + accumWeeks - 1));
      cursor += accumWeeks;
    }
    blocks.push(makeBlock('DELOAD', cursor, cursor));
    cursor += 1;
    if (intensWeeks > 0) {
      blocks.push(makeBlock('INTENSIFICATION', cursor, cursor + intensWeeks - 1));
      cursor += intensWeeks;
    }
  } else if (remaining > 0) {
    // Short prep: no room for deloads
    const intensWeeks = Math.min(remaining, 4);
    const accumWeeks  = remaining - intensWeeks;

    if (accumWeeks > 0) {
      blocks.push(makeBlock('ACCUMULATION', cursor, cursor + accumWeeks - 1));
      cursor += accumWeeks;
    }
    if (intensWeeks > 0) {
      blocks.push(makeBlock('INTENSIFICATION', cursor, cursor + intensWeeks - 1));
      cursor += intensWeeks;
    }
  }

  blocks.push(makeBlock('REALIZATION', cursor, totalWeeks));
  return blocks;
}

/**
 * General (no meet) layout:
 *   INTENSIFICATION is always the last 2 weeks.
 *   A DELOAD week is inserted when the ACCUMULATION block is ≥ 4 weeks.
 *
 * 8 weeks → ACCUM(5) → DELOAD(1) → INTENS(2)
 * 6 weeks → ACCUM(3) → DELOAD(1) → INTENS(2)
 * 4 weeks → ACCUM(2) → INTENS(2)   (too short for a deload)
 * 2 weeks → INTENS(2)
 */
function buildGeneralBlocks(totalWeeks: number): Omit<TrainingBlock, 'id'>[] {
  const intensWeeks = Math.min(2, totalWeeks);
  const remaining   = totalWeeks - intensWeeks;

  const blocks: Omit<TrainingBlock, 'id'>[] = [];
  let cursor = 1;

  if (remaining >= 4) {
    // Room for a deload
    const accumWeeks = remaining - 1;
    blocks.push(makeBlock('ACCUMULATION', cursor, cursor + accumWeeks - 1));
    cursor += accumWeeks;
    blocks.push(makeBlock('DELOAD', cursor, cursor));
    cursor += 1;
  } else if (remaining > 0) {
    blocks.push(makeBlock('ACCUMULATION', cursor, cursor + remaining - 1));
    cursor += remaining;
  }

  blocks.push(makeBlock('INTENSIFICATION', cursor, totalWeeks));
  return blocks;
}

/**
 * Longevity rhythm — open-ended 3:1 work:deload pattern with no peak.
 *
 * Used for arcs whose priorities do not include COMPETITION. Every working
 * block is HEALTH_BASE (sustainable intensity, full ROM, tempo bias); no
 * REALIZATION block is ever emitted, because there's nothing to realize
 * toward.
 *
 * 12 weeks → HB(3) → DL(1) → HB(3) → DL(1) → HB(3) → DL(1)
 *  8 weeks → HB(3) → DL(1) → HB(3) → DL(1)
 *  5 weeks → HB(3) → DL(1) → HB(1)
 *  4 weeks → HB(3) → DL(1)
 *  3 weeks → HB(3)                       (too short to earn a deload)
 *  1 week  → HB(1)
 */
function buildLongevityBlocks(totalWeeks: number): Omit<TrainingBlock, 'id'>[] {
  const blocks: Omit<TrainingBlock, 'id'>[] = [];
  let cursor = 1;
  let remaining = totalWeeks;

  while (remaining >= 4) {
    blocks.push(makeBlock('HEALTH_BASE', cursor, cursor + 2));
    cursor += 3;
    blocks.push(makeBlock('DELOAD', cursor, cursor));
    cursor += 1;
    remaining -= 4;
  }

  if (remaining > 0) {
    blocks.push(makeBlock('HEALTH_BASE', cursor, cursor + remaining - 1));
  }

  return blocks;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeBlock(
  blockType: BlockType,
  weekStart: number,
  weekEnd: number,
): Omit<TrainingBlock, 'id'> {
  return {
    cycleId:         '',        // caller populates after cycle insert
    blockType,
    weekStart,
    weekEnd,
    volumeTarget:    blockToVolumeTarget(blockType),
    intensityTarget: blockToIntensity(blockType),
  };
}

/** Volume target (relative multiplier) per block type. */
function blockToVolumeTarget(blockType: BlockType): number {
  const map: Record<BlockType, number> = {
    ACCUMULATION:    1.1,
    INTENSIFICATION: 0.9,
    REALIZATION:     0.65,
    DELOAD:          0.5,
    PIVOT:           0.8,
    MAINTENANCE:     0.75,
    HEALTH_BASE:     0.85, // moderate volume — full ROM eats into capacity
  };
  return map[blockType];
}
