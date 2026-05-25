'use client';

/**
 * ArcHeaderChip — small, fixed pill in the top-right showing the active arc.
 *
 * Defaults to a single colored dot to avoid covering page-level action
 * buttons. Tap the dot to expand into the full pill (arc name + day).
 * Tap the expanded pill to navigate to the arc detail page; otherwise it
 * auto-collapses after a few seconds.
 *
 * Mounted in src/app/(app)/layout.tsx so it's present on every screen.
 * Hidden on the arc routes themselves (would be redundant).
 *
 * Reads via dexie-react-hooks so it updates automatically when the active arc
 * changes (e.g., right after a START_ARC / END_ARC coach action).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, today } from '@/lib/db/database';
import { arcDayCount } from '@/lib/arcs';
import { C } from '@/lib/theme';

const COLLAPSE_AFTER_MS = 4000;

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

  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapse on every route change so the dot never lingers expanded
  // across navigation.
  useEffect(() => {
    setExpanded(false);
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, [pathname]);

  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
  }, []);

  if (onArcRoute) return null;
  if (activeArc === undefined) return null; // still loading — don't flash

  const expand = () => {
    setExpanded(true);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_AFTER_MS);
  };

  const navigate = () => {
    if (activeArc) router.push(`/settings/arcs/${activeArc.id}`);
    else router.push('/settings/arcs');
  };

  // No active arc yet → faint dot that expands to "Set arc".
  if (activeArc === null) {
    return (
      <ChipShell>
        {expanded ? (
          <button
            type="button"
            onClick={navigate}
            aria-label="Set training arc"
            style={pillStyle({ color: C.muted, dotColor: C.muted, dotOpacity: 0.6 })}
          >
            <Dot color={C.muted} opacity={0.6} />
            Set arc
          </button>
        ) : (
          <DotButton
            color={C.muted}
            opacity={0.6}
            ariaLabel="Show training arc indicator"
            onClick={expand}
          />
        )}
      </ChipShell>
    );
  }

  const day = arcDayCount(activeArc, today());

  return (
    <ChipShell>
      {expanded ? (
        <button
          type="button"
          onClick={navigate}
          aria-label={`Active arc: ${activeArc.name}, day ${day}`}
          style={pillStyle({ color: C.text, dotColor: C.accent })}
        >
          <Dot color={C.accent} glow />
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
      ) : (
        <DotButton
          color={C.accent}
          glow
          ariaLabel={`Show active arc: ${activeArc.name}`}
          onClick={expand}
        />
      )}
    </ChipShell>
  );
}

// ── Internal building blocks ──────────────────────────────────────────────────

function ChipShell({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  );
}

function pillStyle({
  color,
  dotColor: _dotColor,
  dotOpacity: _dotOpacity,
}: {
  color: string;
  dotColor: string;
  dotOpacity?: number;
}): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px 4px 8px',
    borderRadius: 999,
    backgroundColor: C.surface,
    border: `1px solid ${C.border}`,
    color,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    backdropFilter: 'blur(6px)',
    maxWidth: 220,
    overflow: 'hidden',
  };
}

function Dot({
  color,
  opacity = 1,
  glow = false,
}: { color: string; opacity?: number; glow?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        backgroundColor: color,
        opacity,
        boxShadow: glow ? `0 0 6px ${color}80` : undefined,
      }}
    />
  );
}

// Tappable dot — larger hit area (28px) than visual dot (10px) so it stays
// finger-friendly without covering content.
function DotButton({
  color,
  opacity = 1,
  glow = false,
  ariaLabel,
  onClick,
}: {
  color: string;
  opacity?: number;
  glow?: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 28,
        height: 28,
        padding: 0,
        border: 'none',
        background: 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: color,
          opacity,
          boxShadow: glow ? `0 0 8px ${color}A0` : undefined,
        }}
      />
    </button>
  );
}
