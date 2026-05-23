'use client';

/**
 * Meet route gate.
 *
 * v8 — meet planning is "powerlifting mode" but the active arc drives
 * whether it's surfaced. If the athlete's active arc doesn't list
 * COMPETITION as a priority (and isn't COMPETITION_PREP-goaled), the
 * meet routes show a friendly "you're not in a competition arc" message
 * with a link to /settings/arcs so they can either start one or activate
 * an existing one.
 *
 * Deep links still resolve — this is a soft gate, not a hard route block,
 * since athletes might be linking to a meet in their history.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, ArrowRight, Plus } from 'lucide-react';
import { getActiveArc } from '@/lib/arcs';
import { C } from '@/lib/theme';
import type { TrainingArc } from '@/lib/db/types';

function isCompetitionArc(arc: TrainingArc | null): boolean {
  if (!arc) return false;
  return arc.primaryGoal === 'COMPETITION_PREP' || arc.priorities.includes('COMPETITION');
}

export default function MeetLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [arc, setArc] = useState<TrainingArc | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = await getActiveArc();
      if (!cancelled) setArc(a);
    })();
    return () => { cancelled = true; };
  }, []);

  // Loading — keep DOM stable.
  if (arc === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: `${C.accent} transparent transparent transparent` }} />
      </div>
    );
  }

  if (isCompetitionArc(arc)) {
    return <>{children}</>;
  }

  // Soft gate — let them through with one click since deep links matter.
  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-lg mx-auto px-4 pt-12">
        <div
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        >
          <div
            className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${C.accent}1A`, color: C.accent }}
          >
            <Trophy size={22} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: C.text }}>
            Meet planning is asleep
          </p>
          <p className="text-sm leading-relaxed mb-5" style={{ color: C.muted }}>
            Your active arc isn&apos;t competition-focused. Start a new arc with
            <strong> COMPETITION</strong> in its priorities (or
            <strong> COMPETITION_PREP</strong> as its primary goal) and meet
            planning, attempt selection, and federation tools will surface
            everywhere.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push('/settings/arcs/new')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: C.accent, color: '#1a1000' }}
            >
              <Plus size={14} />
              Start an arc
            </button>
            <button
              type="button"
              onClick={() => router.push('/settings/arcs')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: C.dim, color: C.text, border: `1px solid ${C.border}` }}
            >
              View arcs
            </button>
          </div>
        </div>

        {/* Deep-link escape hatch — show the underlying page anyway when the
            athlete has been here before. */}
        <div className="mt-4 text-center">
          <details>
            <summary className="text-xs cursor-pointer" style={{ color: C.muted }}>
              I&apos;m just reviewing — show me anyway <ArrowRight size={12} className="inline align-text-bottom" />
            </summary>
            <div className="mt-3 text-left">{children}</div>
          </details>
        </div>
      </div>
    </div>
  );
}
