/**
 * macrocycle.ts — Generate a complete training macrocycle structure.
 * Pure function: no DB calls, no side effects.
 */

import type {
  AthleteProfile,
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
}

export interface GeneratedMacrocycle {
  cycle: Omit<TrainingCycle, 'id'>;
  /** cycleId is '' — caller must set it after inserting the cycle to the DB. */
  blocks: Omit<TrainingBlock, 'id'>[];
}

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateMacrocycle(input: MacrocycleInput): GeneratedMacrocycle {
  const { meetDate, startDate } = input;
  const totalWeeks = input.totalWeeks ?? (meetDate ? 12 : 8);

  const blocks: Omit<TrainingBlock, 'id'>[] = meetDate
    ? buildMeetBlocks(totalWeeks)
    : buildGeneralBlocks(totalWeeks);

  const cycle: Omit<TrainingCycle, 'id'> = {
    name: meetDate
      ? `${totalWeeks}-Week Meet Prep`
      : `${totalWeeks}-Week Training Block`,
    startDate,
    meetId:       undefined,
    totalWeeks,
    currentWeek:  1,
    status:       'ACTIVE',
    createdAt:    new Date().toISOString(),
  };

  return { cycle, blocks };
}

// ── Block Builders ─────────────────────────────────────────────────────────────

/**
 * Meet-prep layout — working backwards from the competition:
 *   Last 4 weeks  → REALIZATION (weeks 9–12 in a 12-week plan)
 *   Next 4 weeks  → INTENSIFICATION
 *   Remaining     → ACCUMULATION
 *
 * For shorter preps the INTENSIFICATION and ACCUMULATION periods shrink
 * proportionally; REALIZATION is never less than 1 week.
 */
function buildMeetBlocks(totalWeeks: number): Omit<TrainingBlock, 'id'>[] {
  const realizationWeeks = Math.max(1, Math.min(4, totalWeeks));
  const intensWeeks      = Math.max(0, Math.min(4, totalWeeks - realizationWeeks));
  const accumWeeks       = Math.max(0, totalWeeks - realizationWeeks - intensWeeks);

  const blocks: Omit<TrainingBlock, 'id'>[] = [];
  let cursor = 1;

  if (accumWeeks > 0) {
    blocks.push(makeBlock('ACCUMULATION', cursor, cursor + accumWeeks - 1));
    cursor += accumWeeks;
  }

  if (intensWeeks > 0) {
    blocks.push(makeBlock('INTENSIFICATION', cursor, cursor + intensWeeks - 1));
    cursor += intensWeeks;
  }

  blocks.push(makeBlock('REALIZATION', cursor, totalWeeks));
  return blocks;
}

/**
 * General (no meet) layout:
 *   Weeks 1–(n-2) → ACCUMULATION  (all but last 2)
 *   Last 2 weeks   → INTENSIFICATION
 *
 * For ≤ 2 total weeks, produces a single INTENSIFICATION block.
 */
function buildGeneralBlocks(totalWeeks: number): Omit<TrainingBlock, 'id'>[] {
  const intensWeeks = Math.min(2, totalWeeks);
  const accumWeeks  = Math.max(0, totalWeeks - intensWeeks);

  const blocks: Omit<TrainingBlock, 'id'>[] = [];

  if (accumWeeks > 0) {
    blocks.push(makeBlock('ACCUMULATION', 1, accumWeeks));
  }

  blocks.push(
    makeBlock('INTENSIFICATION', accumWeeks + 1, totalWeeks),
  );

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
  };
  return map[blockType];
}
