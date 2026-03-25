/**
 * Shared design tokens — single source of truth for all UI colors.
 *
 * Import `C` in any page/component instead of defining inline `const C = { … }`.
 */

export const C = {
  bg:        '#1A1A2E',
  surface:   '#0F3460',
  accent:    '#E94560',
  gold:      '#F5A623',
  text:      '#E8E8F0',
  muted:     '#9AA0B4',
  dim:       '#2A2A4A',
  border:    '#1E3A5F',
  green:     '#22C55E',
  greenDeep: '#1A7A4A',
  blue:      '#3B82F6',
  red:       '#DC2626',
  greenDim:  '#14532D',
  redDim:    '#450A0A',
  yellowDim: '#422006',
} as const;
