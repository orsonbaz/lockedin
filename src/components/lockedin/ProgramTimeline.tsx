'use client';

/**
 * ProgramTimeline — Visualises the athlete's macrocycle position.
 *
 * Two variants:
 *   • compact — single segmented bar + one-line caption (for /home)
 *   • full    — bar + per-block legend + countdown stats (for /progress)
 *
 * Pure presentation: caller supplies a ProgramProgress (built from cycle +
 * blocks via buildProgramProgress). When the cycle is missing or has no
 * blocks, renders nothing — the caller decides on the fallback.
 */

import { C } from '@/lib/theme';
import {
  blockLabel, blockCaption, type ProgramProgress,
} from '@/lib/engine/program-progress';
import type { BlockType } from '@/lib/db/types';

const BLOCK_COLOURS: Record<BlockType, string> = {
  ACCUMULATION:    C.blue,
  INTENSIFICATION: C.gold,
  REALIZATION:     C.accent,
  DELOAD:          C.muted,
  PIVOT:           '#8B5CF6',
  MAINTENANCE:     C.green,
};

interface Props {
  progress: ProgramProgress;
  variant?: 'compact' | 'full';
  className?: string;
}

export function ProgramTimeline({ progress, variant = 'compact', className }: Props) {
  const {
    cycle, segments, currentWeek, currentBlock, nextBlock,
    weeksRemaining, weeksToNextBlock, daysToPeak, daysToMeet, realizationBlock,
  } = progress;

  if (segments.length === 0) return null;

  const currentColour = currentBlock
    ? BLOCK_COLOURS[currentBlock.blockType]
    : C.accent;

  // Position of the "today" marker as a percentage along the bar.
  // currentWeek is 1-indexed; place marker at the middle of that week.
  const markerPct = ((currentWeek - 0.5) / cycle.totalWeeks) * 100;

  const headline = currentBlock
    ? blockLabel(currentBlock.blockType)
    : 'Cycle';

  // Pick the most informative pacing line.
  const pacing = (() => {
    if (daysToMeet !== null && daysToMeet >= 0) {
      return `${daysToMeet} day${daysToMeet === 1 ? '' : 's'} to meet`;
    }
    if (daysToPeak !== null && daysToPeak > 0 && realizationBlock) {
      return `${daysToPeak} day${daysToPeak === 1 ? '' : 's'} to peak`;
    }
    if (nextBlock && weeksToNextBlock > 0) {
      return `${weeksToNextBlock} wk to ${blockLabel(nextBlock.blockType)}`;
    }
    if (weeksRemaining > 0) {
      return `${weeksRemaining} wk left in cycle`;
    }
    return 'Cycle complete';
  })();

  return (
    <div className={className}>
      {/* Header line */}
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: currentColour }}>
          {headline}
          <span style={{ color: C.muted, fontWeight: 500 }}>
            {' · '}Week {currentWeek} of {cycle.totalWeeks}
          </span>
        </p>
        <p
          className="text-xs font-semibold"
          style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}
        >
          {pacing}
        </p>
      </div>

      {/* Segmented bar */}
      <div
        className="relative w-full rounded-full overflow-hidden flex"
        style={{ height: variant === 'full' ? 12 : 8, backgroundColor: C.dim }}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={cycle.totalWeeks}
        aria-valuenow={currentWeek}
        aria-label={`Week ${currentWeek} of ${cycle.totalWeeks}`}
      >
        {segments.map((seg, i) => {
          const colour = BLOCK_COLOURS[seg.block.blockType];
          // Past blocks: full-saturation. Current: full + glow.
          // Future: dim.
          const opacity = seg.isCurrent ? 1 : seg.isPast ? 0.85 : 0.35;
          return (
            <div
              key={seg.block.id || i}
              style={{
                width: `${seg.fraction * 100}%`,
                backgroundColor: colour,
                opacity,
                borderRight: i < segments.length - 1 ? `1px solid ${C.bg}` : 'none',
              }}
              title={`${blockLabel(seg.block.blockType)} · weeks ${seg.block.weekStart}–${seg.block.weekEnd}`}
            />
          );
        })}

        {/* "Today" marker */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `calc(${markerPct}% - 1px)`,
            width: 2,
            backgroundColor: C.text,
            boxShadow: `0 0 4px ${C.text}`,
          }}
          aria-hidden
        />
      </div>

      {variant === 'full' && (
        <>
          {/* Caption under bar */}
          {currentBlock && (
            <p className="text-xs mt-2.5" style={{ color: C.muted }}>
              {blockCaption(currentBlock.blockType)}
            </p>
          )}

          {/* Legend — only the block types actually present in this cycle */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
            {[...new Set(segments.map((s) => s.block.blockType))].map((bt) => (
              <div key={bt} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: BLOCK_COLOURS[bt] }}
                />
                <span className="text-xs" style={{ color: C.muted }}>
                  {blockLabel(bt)}
                </span>
              </div>
            ))}
          </div>

          {/* Countdown stats grid */}
          <div
            className="grid grid-cols-3 gap-2 mt-4 pt-3"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <Stat label="Week" value={`${currentWeek}/${cycle.totalWeeks}`} />
            <Stat
              label={nextBlock ? `Until ${blockLabel(nextBlock.blockType).toLowerCase()}` : 'Block left'}
              value={`${weeksToNextBlock} wk`}
            />
            <Stat
              label={daysToMeet !== null ? 'Meet' : daysToPeak !== null ? 'Peak' : 'Cycle ends'}
              value={
                daysToMeet !== null
                  ? `${daysToMeet}d`
                  : daysToPeak !== null
                  ? `${daysToPeak}d`
                  : `${weeksRemaining}wk`
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p
        className="text-base font-bold"
        style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: C.muted }}
      >
        {label}
      </p>
    </div>
  );
}
