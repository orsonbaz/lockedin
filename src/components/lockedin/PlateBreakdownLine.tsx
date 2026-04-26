'use client';

/**
 * PlateBreakdownLine — Single-line "plates per side" hint for the load input.
 *
 * Shows e.g. "20kg bar · 25 + 25 + 10 / side". Renders a subtle warning when
 * the requested load isn't achievable with the default plate set.
 */

import { plateBreakdown, formatPlateBreakdown } from '@/lib/engine/plate-math';
import { C } from '@/lib/theme';

interface Props {
  loadKg: number;
  barKg?: number;
}

export function PlateBreakdownLine({ loadKg, barKg = 20 }: Props) {
  if (!Number.isFinite(loadKg) || loadKg <= 0) return null;
  const b = plateBreakdown(loadKg, { barKg });
  const text = formatPlateBreakdown(b);
  const off = Math.abs(b.remainderKg) > 1e-3;

  return (
    <p
      className="text-[11px] leading-tight font-mono text-center"
      style={{
        color: off ? C.gold : C.muted,
        fontVariantNumeric: 'tabular-nums',
      }}
      aria-label={`Plates per side: ${text}`}
    >
      {b.barKg}kg bar · <span style={{ color: off ? C.gold : C.text }}>{text}</span>
      <span style={{ color: C.muted }}> / side</span>
      {off && (
        <span style={{ color: C.gold }}>
          {' '}
          (off by {b.remainderKg > 0 ? '+' : ''}
          {b.remainderKg}kg)
        </span>
      )}
    </p>
  );
}
