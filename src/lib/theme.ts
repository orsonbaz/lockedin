/**
 * Shared design tokens — single source of truth for all UI colors.
 *
 * Palette: warm charcoal dark theme with copper/amber accent.
 * Clean, minimal, gym-app aesthetic without the gaming look.
 */

export const C = {
  // Backgrounds
  bg:        '#111113',    // near-black, warm
  surface:   '#1C1C1F',    // card/panel backgrounds
  dim:       '#252529',    // input backgrounds, subtle fills
  border:    '#2E2E33',    // subtle borders

  // Accent — warm copper/amber
  accent:    '#D4844C',    // primary action color (warm copper)
  gold:      '#E5A84B',    // secondary accent (gold)

  // Text
  text:      '#ECECEF',    // primary text (warm off-white)
  muted:     '#787882',    // secondary text

  // Semantic
  green:     '#4ADE80',    // success, positive
  greenDeep: '#22C55E',    // readiness good
  blue:      '#60A5FA',    // informational, charts
  red:       '#EF4444',    // destructive, danger
  greenDim:  '#14532D',
  redDim:    '#451A1A',
  yellowDim: '#422006',
} as const;
