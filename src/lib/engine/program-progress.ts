/**
 * program-progress.ts — Summarize where the athlete is in their macrocycle.
 *
 * Pure function over { cycle, blocks, meet? }: returns the data the UI needs
 * to draw the program timeline (current week, current block, days to next
 * block boundary, days to peak / meet). No DB calls — caller fetches.
 */

import type { TrainingCycle, TrainingBlock, BlockType, Meet } from '@/lib/db/types';
import { daysUntil } from '@/lib/date-utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProgramSegment {
  block: TrainingBlock;
  /** Weeks in the segment (inclusive). */
  weeks: number;
  /** 0-1 fraction of the cycle this segment occupies. */
  fraction: number;
  /** Whether `currentWeek` falls in this segment. */
  isCurrent: boolean;
  /** Whether the segment ended before `currentWeek`. */
  isPast: boolean;
}

export interface ProgramProgress {
  cycle: TrainingCycle;
  blocks: TrainingBlock[];
  segments: ProgramSegment[];
  /** Current 1-indexed week. Clamped to [1, totalWeeks]. */
  currentWeek: number;
  /** Block the athlete is currently in, if any. */
  currentBlock: TrainingBlock | null;
  /** Block immediately after the current one in the schedule. */
  nextBlock: TrainingBlock | null;
  /** Weeks remaining (from end of currentWeek to end of cycle). */
  weeksRemaining: number;
  /** Weeks until the next block starts. 0 if currently in the final block. */
  weeksToNextBlock: number;
  /** Days until the realization block starts. null if no realization. */
  daysToPeak: number | null;
  /** First realization block in the schedule, if any. */
  realizationBlock: TrainingBlock | null;
  /** Days until the linked meet (if any & in future). */
  daysToMeet: number | null;
  /** 0-1 fraction of cycle elapsed (by week count). */
  cycleFraction: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BLOCK_LABELS: Record<BlockType, string> = {
  ACCUMULATION:    'Accumulation',
  INTENSIFICATION: 'Intensification',
  REALIZATION:     'Peak',
  DELOAD:          'Deload',
  PIVOT:           'Pivot',
  MAINTENANCE:     'Maintenance',
};

export function blockLabel(type: BlockType): string {
  return BLOCK_LABELS[type];
}

/** Short caption explaining the block's role in plain language. */
export function blockCaption(type: BlockType): string {
  switch (type) {
    case 'ACCUMULATION':    return 'Build volume — drive adaptation.';
    case 'INTENSIFICATION': return 'Heavier loads, lower volume.';
    case 'REALIZATION':     return 'Peak — express your strength.';
    case 'DELOAD':          return 'Recover so the next block lands.';
    case 'PIVOT':           return 'Shift focus mid-cycle.';
    case 'MAINTENANCE':     return 'Hold gains during constraints.';
  }
}

/** Calendar date when the cycle's `weekIndex` (1-based) starts. */
export function weekStartDate(cycle: TrainingCycle, weekIndex: number): Date {
  const start = new Date(cycle.startDate + 'T12:00:00');
  start.setDate(start.getDate() + (weekIndex - 1) * 7);
  return start;
}

// ── Main builder ─────────────────────────────────────────────────────────────

export function buildProgramProgress(
  cycle: TrainingCycle,
  blocks: TrainingBlock[],
  meet?: Meet | null,
): ProgramProgress {
  const sorted = [...blocks].sort((a, b) => a.weekStart - b.weekStart);
  const totalWeeks = Math.max(1, cycle.totalWeeks);
  const currentWeek = Math.min(totalWeeks, Math.max(1, cycle.currentWeek));

  const segments: ProgramSegment[] = sorted.map((block) => {
    const weeks = Math.max(1, block.weekEnd - block.weekStart + 1);
    return {
      block,
      weeks,
      fraction: weeks / totalWeeks,
      isCurrent: currentWeek >= block.weekStart && currentWeek <= block.weekEnd,
      isPast: block.weekEnd < currentWeek,
    };
  });

  const currentBlock = segments.find((s) => s.isCurrent)?.block ?? null;

  const currentIdx = currentBlock
    ? sorted.findIndex((b) => b.id === currentBlock.id)
    : -1;
  const nextBlock = currentIdx >= 0 && currentIdx < sorted.length - 1
    ? sorted[currentIdx + 1]
    : null;

  const weeksRemaining = Math.max(0, totalWeeks - currentWeek);
  const weeksToNextBlock = currentBlock
    ? Math.max(0, currentBlock.weekEnd - currentWeek + 1)
    : 0;

  const realizationBlock = sorted.find((b) => b.blockType === 'REALIZATION') ?? null;
  let daysToPeak: number | null = null;
  if (realizationBlock && realizationBlock.weekStart > currentWeek) {
    const peakStart = weekStartDate(cycle, realizationBlock.weekStart);
    daysToPeak = Math.max(0, Math.ceil(
      (peakStart.getTime() - Date.now()) / 86_400_000,
    ));
  }

  const daysToMeet = meet ? daysUntil(meet.date) : null;

  return {
    cycle,
    blocks: sorted,
    segments,
    currentWeek,
    currentBlock,
    nextBlock,
    weeksRemaining,
    weeksToNextBlock,
    daysToPeak,
    realizationBlock,
    daysToMeet,
    cycleFraction: currentWeek / totalWeeks,
  };
}
