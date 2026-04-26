'use client';

/**
 * GoalProgressCard — Surfaces the athlete's training goal on /home and
 * /progress. Two variants:
 *   compact  — single row + thin progress bar, used on /home
 *   full     — header + bar + caption + deadline banner, used on /progress
 *
 * Renders nothing when buildGoalProgress returns null (no goal/deadline set).
 */

import { useRouter } from 'next/navigation';
import { Target, ChevronRight } from 'lucide-react';
import type { GoalProgress } from '@/lib/engine/goal-progress';
import { C } from '@/lib/theme';

interface Props {
  progress: GoalProgress;
  variant?: 'compact' | 'full';
}

export function GoalProgressCard({ progress, variant = 'compact' }: Props) {
  const router = useRouter();
  const {
    rawText, parsed, fraction, daysLeft, overdue, achieved, caption, deadline,
  } = progress;

  // Bar fill: clamp the visual at 100% even when fraction overshoots 1.0,
  // so the "achieved" state shows a full bar with a trophy.
  const barPct = fraction === null ? 0 : Math.min(1, fraction) * 100;

  const accent = achieved ? C.green : overdue ? C.accent : C.gold;
  const headline = achieved ? 'Goal hit' : overdue ? 'Goal overdue' : 'Goal';

  function go() {
    router.push('/goals');
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={go}
        className="w-full rounded-2xl p-4 active:scale-[0.99] transition-transform"
        style={{
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          textAlign: 'left',
        }}
        aria-label="Edit goal"
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accent}20` }}
          >
            <Target size={16} color={accent} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
              {headline}
              {daysLeft !== null && (
                <span style={{ color: C.muted, fontWeight: 500 }}>
                  {' · '}{daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </span>
              )}
            </p>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: C.text }}
            >
              {rawText || (deadline ? 'Set a target' : '')}
            </p>
          </div>
          <ChevronRight size={16} color={C.muted} />
        </div>

        {fraction !== null && (
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: 6, backgroundColor: C.dim }}
          >
            <div
              style={{
                width: `${barPct}%`,
                height: '100%',
                backgroundColor: accent,
                transition: 'width 600ms ease',
              }}
            />
          </div>
        )}
        {caption && (
          <p
            className="text-xs mt-2 tabular-nums"
            style={{ color: C.muted }}
          >
            {caption}
          </p>
        )}
      </button>
    );
  }

  // FULL variant — used on /progress
  return (
    <div
      className="rounded-3xl p-5"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}20` }}
        >
          <Target size={18} color={accent} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
            {headline}
          </p>
          <p className="text-base font-bold" style={{ color: C.text }}>
            {rawText || 'No target set'}
          </p>
        </div>
        <button
          type="button"
          onClick={go}
          className="text-xs px-2.5 py-1 rounded-lg transition-all active:scale-95"
          style={{ color: C.muted, backgroundColor: C.dim }}
        >
          Edit
        </button>
      </div>

      {fraction !== null && (
        <>
          <div
            className="w-full rounded-full overflow-hidden mt-2"
            style={{ height: 10, backgroundColor: C.dim }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(barPct)}
          >
            <div
              style={{
                width: `${barPct}%`,
                height: '100%',
                backgroundColor: accent,
                transition: 'width 600ms ease',
              }}
            />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-xs tabular-nums" style={{ color: C.muted }}>
              {caption}
            </p>
            <p className="text-xs font-bold tabular-nums" style={{ color: accent }}>
              {Math.round((fraction ?? 0) * 100)}%
            </p>
          </div>
        </>
      )}

      {parsed.kind === 'NARRATIVE' && rawText && (
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          Set a measurable target like &ldquo;200 kg squat&rdquo; to track progress automatically.
        </p>
      )}

      {(daysLeft !== null || overdue) && (
        <div
          className="mt-3 pt-3 flex items-center justify-between"
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: C.muted }}>
            Deadline
          </span>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: overdue ? C.accent : C.text }}
          >
            {overdue
              ? 'Past due'
              : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          </span>
        </div>
      )}
    </div>
  );
}
