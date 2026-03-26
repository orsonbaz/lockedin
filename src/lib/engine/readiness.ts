/**
 * readiness.ts — Pure functions for daily readiness scoring.
 * No DB calls, no side effects, no LLM — all deterministic math.
 */

// ── HRV Calculations ──────────────────────────────────────────────────────────

/**
 * Calculate rolling 7-day HRV baseline from an array of recent HRV values.
 * Returns undefined if the array is empty.
 * Values should already be the last N days (caller controls the window).
 */
export function calcHrvBaseline(recentHrvValues: number[]): number | undefined {
  if (recentHrvValues.length === 0) return undefined;
  const sum = recentHrvValues.reduce((acc, v) => acc + v, 0);
  return sum / recentHrvValues.length;
}

/**
 * Calculate percentage deviation of today's HRV from a rolling baseline.
 * Returns positive percentage if above baseline, negative if below.
 * Safe-guards against a zero baseline (returns 0).
 */
export function calcHrvDeviation(todayHrv: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((todayHrv - baseline) / baseline) * 100;
}

// ── Readiness Score ───────────────────────────────────────────────────────────

export interface ReadinessInput {
  /** % deviation from 7-day HRV baseline (positive = above baseline) */
  hrvDeviation?: number;
  /** Total sleep in hours */
  sleepHours?: number;
  /** Subjective sleep quality 1 (terrible) – 5 (excellent) */
  sleepQuality?: number;
  /** Subjective energy level 1–5 */
  energy?: number;
  /** Subjective motivation 1–5 */
  motivation?: number;
  /** Subjective muscle soreness 1–5  (5 = very sore — NEGATIVE for readiness) */
  soreness?: number;
  /** Subjective stress level 1–5  (5 = very stressed — NEGATIVE for readiness) */
  stress?: number;
}

/**
 * Composite readiness score (0–100).
 *
 * Base = 60
 *
 * HRV component  (max ±20):
 *   deviation > +15%         → +20
 *   deviation  +5 to +15%    → +10
 *   deviation  -5 to  +5%    →   0
 *   deviation -15 to  -5%    → -10
 *   deviation < -15%         → -20
 *   No HRV data              →   0
 *
 * Sleep component (max ±15):
 *   hours ≥ 8 AND quality ≥ 4  → +15
 *   hours 7–8 OR  quality ≥ 4  →  +7
 *   hours 6–7 AND quality ≥ 3  →   0
 *   hours < 6 OR  quality ≤ 2  → -15
 *   No sleep data              →   0
 *
 * Subjective component (max ±15):
 *   raw = (energy + motivation) − (soreness + stress)
 *   raw range: -8 to +8  →  normalised to ±15
 *   Missing values default to neutral (3 = mid-point)
 *   If ALL four are absent → 0
 *
 * Final score is clamped to [0, 100] and rounded to the nearest integer.
 */
export function calcReadinessScore(input: ReadinessInput): number {
  // ── HRV component ──────────────────────────────────────────────────────────
  let hrvScore = 0;
  if (input.hrvDeviation !== undefined) {
    const d = input.hrvDeviation;
    if (d > 15)        hrvScore =  20;
    else if (d >= 5)   hrvScore =  10;
    else if (d >= -5)  hrvScore =   0;
    else if (d >= -15) hrvScore = -10;
    else               hrvScore = -20;
  }

  // ── Sleep component ────────────────────────────────────────────────────────
  let sleepScore = 0;
  const hasSleepData =
    input.sleepHours !== undefined || input.sleepQuality !== undefined;

  if (hasSleepData) {
    const hrs  = input.sleepHours  ?? 0;
    const qual = input.sleepQuality ?? 0;

    if (hrs >= 8 && qual >= 4)      sleepScore =  15;
    else if (hrs >= 7 || qual >= 4) sleepScore =   7;
    else if (hrs >= 6 && qual >= 3) sleepScore =   0;
    else                            sleepScore = -15;
  }

  // ── Subjective component ───────────────────────────────────────────────────
  let subjectiveScore = 0;
  const { energy, motivation, soreness, stress } = input;
  const hasSubjective =
    energy !== undefined ||
    motivation !== undefined ||
    soreness   !== undefined ||
    stress     !== undefined;

  if (hasSubjective) {
    // Missing values fall back to neutral midpoint (3 on a 1–5 scale)
    const e  = energy     ?? 3;
    const m  = motivation ?? 3;
    const so = soreness   ?? 3;
    const st = stress     ?? 3;

    // raw ∈ [-8, +8]  →  normalise to ±15
    const raw = (e + m) - (so + st);
    subjectiveScore = (raw / 8) * 15;
  }

  const total = 60 + hrvScore + sleepScore + subjectiveScore;
  return Math.round(Math.max(0, Math.min(100, total)));
}

// ── Readiness Label ───────────────────────────────────────────────────────────

export interface ReadinessLabelResult {
  label: 'Excellent' | 'Good' | 'Moderate' | 'Low' | 'Rest Day';
  /** Hex colour for the label / gauge */
  colour: string;
}

/**
 * Map a readiness score to a user-facing label and colour.
 *
 * 80–100 → Excellent  #22C55E (green)
 * 65–79  → Good       #E5A84B (gold)
 * 50–64  → Moderate   #D4844C (copper)
 * 30–49  → Low        #EF4444 (red)
 *  0–29  → Rest Day   #787882 (muted)
 */
export function readinessLabel(score: number): ReadinessLabelResult {
  if (score >= 80) return { label: 'Excellent', colour: '#22C55E' };
  if (score >= 65) return { label: 'Good',      colour: '#E5A84B' };
  if (score >= 50) return { label: 'Moderate',  colour: '#D4844C' };
  if (score >= 30) return { label: 'Low',        colour: '#EF4444' };
  return                   { label: 'Rest Day',  colour: '#787882' };
}
