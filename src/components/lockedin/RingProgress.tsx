'use client';

/**
 * RingProgress — reusable circular progress ring.
 *
 * Consolidates the inline SVG ring implementations used across:
 *   - home/page.tsx  (ReadinessRing)
 *   - checkin/page.tsx (ReadinessGauge)
 *
 * Props:
 *   score        — 0–100 fill percentage
 *   size         — outer diameter in px (default 120)
 *   strokeWidth  — arc stroke in px (default 10)
 *   color        — arc fill color
 *   animate      — animate fill from 0 on mount, spring easing (default false)
 *   label        — optional text below the ring
 *   hasData      — if false, shows '--' and dims the ring (default true)
 *   ariaLabel    — aria-label override for the svg
 */

import { useState, useEffect, useRef } from 'react';
import { C } from '@/lib/theme';

interface RingProgressProps {
  score:        number;
  size?:        number;
  strokeWidth?: number;
  color:        string;
  animate?:     boolean;
  label?:       string;
  hasData?:     boolean;
  ariaLabel?:   string;
}

export function RingProgress({
  score,
  size        = 120,
  strokeWidth = 10,
  color,
  animate     = false,
  label,
  hasData     = true,
  ariaLabel,
}: RingProgressProps) {
  // Ring geometry: r sized so arc fits exactly within the viewBox
  const c    = size / 2;
  const r    = (size * 5) / 12;      // ≈ 50 for size=120 — matches original rings
  const circ = 2 * Math.PI * r;

  const arcColor   = hasData ? color : C.dim;
  const targetOffset = circ * (1 - score / 100);

  // Mount animation: start fully empty, then animate to target on next tick
  const [offset, setOffset]     = useState(animate ? circ : targetOffset);
  const animatedRef              = useRef(false);

  useEffect(() => {
    if (!animate || animatedRef.current) return;
    animatedRef.current = true;
    const t = setTimeout(() => setOffset(targetOffset), 80);
    return () => clearTimeout(t);
  }, [animate, targetOffset]);

  // When score changes in non-animated mode, track it
  useEffect(() => {
    if (!animate) setOffset(targetOffset);
  }, [animate, targetOffset]);

  const easing = animate
    ? 'stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1)'
    : 'stroke-dashoffset 0.35s ease, stroke 0.35s ease';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)' }}
          aria-label={ariaLabel ?? `Score ${score} out of 100`}
        >
          {/* Track */}
          <circle
            cx={c} cy={c} r={r}
            fill="none"
            stroke={C.dim}
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={c} cy={c} r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: easing }}
          />
        </svg>

        {/* Center score overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 2 }}>
          <span
            className="font-black"
            style={{
              fontSize:              size * 0.267,   // ≈ 32px at size=120
              lineHeight:            1,
              color:                 hasData ? arcColor : C.muted,
              textShadow:            hasData ? `0 0 20px ${arcColor}60` : 'none',
              fontVariantNumeric:    'tabular-nums',
            }}
          >
            {hasData ? score : '--'}
          </span>
          <span className="text-xs font-semibold" style={{ color: C.muted }}>/100</span>
        </div>
      </div>

      {label !== undefined && (
        <p
          className="text-xs font-bold uppercase tracking-widest mt-2"
          style={{ color: hasData ? arcColor : C.muted }}
        >
          {hasData ? label : 'No check-in'}
        </p>
      )}
    </div>
  );
}
