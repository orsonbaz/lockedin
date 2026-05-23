'use client';

/**
 * /mobility/library — browse all movements by category.
 *
 * Each row expands inline to show the full cue and dose. Tap movement to
 * open it in a single-movement "runner" (just shows the timer/reps for that
 * one move — useful for spot checks during the day).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Activity } from 'lucide-react';
import {
  MOBILITY_BY_CATEGORY,
  MOBILITY_CATEGORY_LABELS,
} from '@/lib/mobility';
import { C } from '@/lib/theme';
import type { MobilityCategory, MobilityMovement } from '@/lib/db/types';

const CATEGORY_ORDER: MobilityCategory[] = [
  'CARS',
  'HIP_OPENER',
  'T_SPINE',
  'L_SPINE',
  'SHOULDER_ROM',
  'ANKLE',
  'WRIST_FOREARM',
  'NEURAL_GLIDE',
  'GROUND_FLOW',
  'BREATHING',
  'SOFT_TISSUE',
];

export default function MobilityLibraryPage() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: C.bg, color: C.text }}>
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b"
        style={{ backgroundColor: C.bg, borderColor: C.border }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm"
          style={{ color: C.muted }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-base font-semibold">Movement Library</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {CATEGORY_ORDER.map((cat) => {
          const list = MOBILITY_BY_CATEGORY.get(cat) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={cat}>
              <p
                className="text-xs font-semibold uppercase tracking-widest px-1 mb-2"
                style={{ color: C.muted }}
              >
                {MOBILITY_CATEGORY_LABELS[cat]}
              </p>
              <div
                className="rounded-2xl overflow-hidden divide-y"
                style={{
                  backgroundColor: C.surface,
                  border: `1px solid ${C.border}`,
                  borderColor: C.border,
                }}
              >
                {list.map((m) => (
                  <MovementRow
                    key={m.id}
                    movement={m}
                    isOpen={expanded === m.id}
                    onToggle={() => setExpanded((cur) => (cur === m.id ? null : m.id))}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MovementRow({
  movement,
  isOpen,
  onToggle,
}: {
  movement: MobilityMovement;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const dose = doseLabel(movement);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity active:opacity-70"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: C.text }}>{movement.name}</p>
          <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>
            {dose}
            {movement.hasRomAssessment && ' · ROM-tracked'}
          </p>
        </div>
        {movement.hasRomAssessment && (
          <Activity size={14} style={{ color: C.accent, opacity: 0.6 }} aria-label="ROM-tracked" />
        )}
        <ChevronRight
          size={14}
          style={{
            color: C.muted,
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 text-xs leading-relaxed" style={{ color: C.muted }}>
          {movement.cueShort}
          <p className="mt-2 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
            Regions: {movement.regions.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

function doseLabel(m: MobilityMovement): string {
  const sides = m.sides === 'UNILATERAL' ? ' / side' : '';
  if (m.durationSec && m.reps) return `${m.durationSec}s · ${m.reps} reps${sides}`;
  if (m.durationSec) return `${m.durationSec}s${sides}`;
  if (m.reps) return `${m.reps} reps${sides}`;
  return 'Free time';
}
