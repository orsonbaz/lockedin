'use client';

/**
 * ArcHeaderChip — small, fixed pill in the top-right showing the active arc.
 * Click → arc detail. Long-press / tap on (?) → quick switch to /settings/arcs.
 *
 * Mounted in src/app/(app)/layout.tsx so it's present on every screen.
 * Hidden on the arc routes themselves (would be redundant).
 *
 * Reads via dexie-react-hooks so it updates automatically when the active arc
 * changes (e.g., right after a START_ARC / END_ARC coach action).
 */

import { useRouter, usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, today } from '@/lib/db/database';
import { arcDayCount } from '@/lib/arcs';
import { C } from '@/lib/theme';

export default function ArcHeaderChip() {
  const router = useRouter();
  const pathname = usePathname();

  // Hidden on arc management routes — no need to show the chip when the user
  // is already looking at the arc detail page.
  const onArcRoute = pathname?.startsWith('/settings/arcs') ?? false;

  const activeArc = useLiveQuery(async () => {
    const rows = await db.trainingArcs.where('status').equals('ACTIVE').toArray();
    if (rows.length === 0) return null;
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0];
  }, []);

  if (onArcRoute) return null;
  if (activeArc === undefined) return null; // still loading — don't flash

  const handleClick = () => {
    if (activeArc) router.push(`/settings/arcs/${activeArc.id}`);
    else router.push('/settings/arcs');
  };

  // No active arc yet → faint "Set an arc" affordance.
  if (activeArc === null) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          right: 12,
          zIndex: 40,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          onClick={handleClick}
          aria-label="Set training arc"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            backgroundColor: C.surface,
            border: `1px solid ${C.border}`,
            color: C.muted,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6, height: 6, borderRadius: 999,
              backgroundColor: C.muted, opacity: 0.6,
            }}
          />
          Set arc
        </button>
      </div>
    );
  }

  const day = arcDayCount(activeArc, today());

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        right: 12,
        zIndex: 40,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Active arc: ${activeArc.name}, day ${day}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px 4px 8px',
          borderRadius: 999,
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          color: C.text,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          maxWidth: 220,
          overflow: 'hidden',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: 999,
            backgroundColor: C.accent,
            boxShadow: `0 0 6px ${C.accent}80`,
          }}
        />
        <span
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 140,
          }}
        >
          {activeArc.name}
        </span>
        <span style={{ color: C.muted, fontWeight: 500 }}>· d{day}</span>
      </button>
    </div>
  );
}
