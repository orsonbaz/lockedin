'use client';

/**
 * SegmentedControl — reusable segmented button group.
 *
 * Replaces inline tab/toggle button groups used across the app
 * (unit system KG/LBS in settings, and any future tab patterns).
 *
 * Props:
 *   options   — array of { value, label } items
 *   value     — currently selected value
 *   onChange  — called with new value on selection
 *   size      — 'sm' | 'md' (default 'md')
 */

import { C } from '@/lib/theme';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options:  SegmentOption<T>[];
  value:    T;
  onChange: (value: T) => void;
  size?:    'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  const padding = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  const fontSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      className="flex gap-1 rounded-xl overflow-hidden border"
      style={{ borderColor: C.border }}
      role="group"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`${padding} ${fontSize} font-semibold transition-all`}
            style={{
              backgroundColor: active ? C.accent : C.dim,
              color:           active ? '#fff'    : C.muted,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
