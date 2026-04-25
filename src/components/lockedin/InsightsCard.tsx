'use client';

/**
 * InsightsCard — Single highest-severity weak-point finding on /home.
 *
 * Reads from detectWeakPoints() (RPE creep, missed reps, plateau, imbalance)
 * and shows the top one. Tapping the card opens /coach with a pre-filled
 * prompt so the athlete can ask about it. Renders nothing when there are no
 * findings — keeps the home screen clean for new athletes.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, Sparkles } from 'lucide-react';
import { detectWeakPoints, type WeakPointFinding } from '@/lib/engine/weak-points';
import { C } from '@/lib/theme';

const KIND_LABEL: Record<WeakPointFinding['kind'], string> = {
  RPE_CREEP:      'RPE creep',
  MISSED_REPS:    'Missed reps',
  LOAD_PLATEAU:   'Plateau',
  LIFT_IMBALANCE: 'Imbalance',
  VOLUME_DROP:    'Volume drop',
};

export function InsightsCard() {
  const router = useRouter();
  const [finding, setFinding] = useState<WeakPointFinding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    detectWeakPoints(1)
      .then((findings) => {
        if (cancelled) return;
        setFinding(findings[0] ?? null);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('[InsightsCard] detectWeakPoints failed:', err);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading || !finding) return null;

  // High-severity findings warrant the warning palette; mild ones get the
  // neutral "insight" palette so we don't cry wolf every session.
  const isUrgent = finding.severity >= 0.6;
  const accent = isUrgent ? C.accent : C.gold;
  const Icon = isUrgent ? AlertTriangle : Sparkles;

  function handleOpen() {
    router.push('/coach');
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="w-full rounded-2xl p-4 mb-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${accent}40`,
        textAlign: 'left',
      }}
      aria-label="Discuss this insight with coach"
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${accent}20` }}
      >
        <Icon size={18} color={accent} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: accent }}>
          Insight · {KIND_LABEL[finding.kind]}
        </p>
        <p
          className="text-sm leading-snug"
          style={{
            color: C.text,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {finding.summary}
        </p>
      </div>
      <ChevronRight size={18} color={C.muted} />
    </button>
  );
}
