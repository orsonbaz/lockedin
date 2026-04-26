/**
 * intra-session.ts — Real-time RPE deviation detection and load adjustment.
 *
 * After each logged set, the app calls computeSetAdjustment() with the actual
 * vs. prescribed RPE. It uses the same Tuchscherer RPE table that generated
 * the session to derive the corrected load — not a flat percentage nudge.
 *
 * The result is also used by buildSystemPrompt() in coach.ts so the AI coach
 * has live awareness of how the session is going and can suggest mid-session
 * changes without the athlete having to describe it in chat.
 */

import { prescribeLoad, roundLoad } from './calc';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One logged set, compared against its prescription. */
export interface SetFeedback {
  exerciseName:  string;
  setNumber:     number;   // 1-based
  totalSets:     number;
  targetRpe:     number;
  targetReps:    number;
  targetLoadKg:  number;
  actualRpe:     number;
  actualLoadKg:  number;
  actualReps:    number;   // reps completed (may differ from target on a miss)
}

export type AdjustmentStatus = 'ON_TARGET' | 'REDUCE' | 'INCREASE' | 'ABORT';

export interface SetAdjustment {
  status:           AdjustmentStatus;
  /** actualRpe − targetRpe. Positive = heavier than expected. */
  deviation:        number;
  /** Corrected load rounded to 2.5 kg. Omitted when ON_TARGET. */
  suggestedLoadKg?: number;
  /** suggestedLoadKg − targetLoadKg. Signed. */
  changeKg?:        number;
  remainingSets:    number;
  /** Coaching message shown in the UI or injected into the LLM prompt. */
  message:          string;
}

// ── Session-level aggregation for the coach prompt ────────────────────────────

export interface SessionRpeState {
  completedSets:    number;
  /** Mean (actualRpe − targetRpe) across all logged sets. */
  avgDeviation:     number;
  trend:            'STABLE' | 'RISING' | 'SPIKING';
  latestAdjustment: SetAdjustment | null;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** ≥ this much over target: stop the exercise entirely. */
const ABORT_THRESHOLD   =  2.0;
/** ≥ this much over target: reduce load for remaining sets. */
const OVER_THRESHOLD    =  0.75;
/** ≥ this much under target: cautiously increase load. */
const UNDER_THRESHOLD   = -0.75;
/** Cap any recommended load increase at this fraction of current load. */
const MAX_INCREASE_FRAC =  0.05;

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Given a logged set, compute whether the load should change for the remaining
 * sets of that exercise.
 *
 * The corrected load is derived from the athlete's actual 1RM estimate (using
 * the Tuchscherer table inverse) re-prescribed at the original RPE target —
 * the same math that produced the session prescription in the first place.
 */
export function computeSetAdjustment(fb: SetFeedback): SetAdjustment {
  const deviation     = fb.actualRpe - fb.targetRpe;
  const remainingSets = Math.max(0, fb.totalSets - fb.setNumber);

  // ── Abort ─────────────────────────────────────────────────────────────────
  if (deviation >= ABORT_THRESHOLD) {
    return {
      status: 'ABORT',
      deviation,
      remainingSets,
      message:
        `Stop here — that was RPE ${fb.actualRpe} against a target of ${fb.targetRpe}. ` +
        `A ${deviation.toFixed(1)}-point overshoot means continuing will only accumulate ` +
        `recovery debt with no extra stimulus. Mark remaining sets skipped and note the load.`,
    };
  }

  // ── On target ─────────────────────────────────────────────────────────────
  if (deviation > UNDER_THRESHOLD && deviation < OVER_THRESHOLD) {
    const setWord = remainingSets === 1 ? 'set' : 'sets';
    return {
      status: 'ON_TARGET',
      deviation,
      remainingSets,
      message:
        remainingSets > 0
          ? `On target. Continue with ${fb.targetLoadKg} kg for the remaining ${remainingSets} ${setWord}.`
          : 'Session complete — RPE was on target throughout.',
    };
  }

  // ── Estimate the athlete's current true 1RM from the actual set ───────────
  const trueMaxKg = estimateMaxFromRpe(fb.actualLoadKg, fb.actualReps, fb.actualRpe);

  if (deviation >= OVER_THRESHOLD) {
    // ── Reduce ───────────────────────────────────────────────────────────────
    const corrected = roundLoad(prescribeLoad(trueMaxKg, fb.targetRpe, fb.targetReps));
    const changeKg  = corrected - fb.targetLoadKg;

    // If rounding collapses the difference below 2.5 kg, treat as on target.
    if (Math.abs(changeKg) < 2.5) {
      return {
        status: 'ON_TARGET',
        deviation,
        remainingSets,
        message:
          `Slightly over target (RPE ${fb.actualRpe} vs ${fb.targetRpe}) but the ` +
          `adjustment rounds to < 2.5 kg — stay at ${fb.targetLoadKg} kg.`,
      };
    }

    const setWord = remainingSets === 1 ? 'set' : 'sets';
    return {
      status:          'REDUCE',
      deviation,
      suggestedLoadKg: corrected,
      changeKg,
      remainingSets,
      message:
        `RPE ${fb.actualRpe} vs target ${fb.targetRpe}. ` +
        `Drop to ${corrected} kg (${Math.abs(changeKg).toFixed(1)} kg less) for the remaining ` +
        `${remainingSets} ${setWord}. Estimated current max: ~${Math.round(trueMaxKg)} kg.`,
    };
  }

  // ── Increase (under target) ───────────────────────────────────────────────
  // Conservative: cap at +5% to avoid overcorrecting early in the session
  // when the athlete may still be warming into it.
  const rawIncrease   = roundLoad(prescribeLoad(trueMaxKg, fb.targetRpe, fb.targetReps));
  const cappedIncrease = roundLoad(fb.targetLoadKg * (1 + MAX_INCREASE_FRAC));
  const corrected      = Math.min(rawIncrease, cappedIncrease);
  const changeKg       = corrected - fb.targetLoadKg;

  if (changeKg < 2.5) {
    return {
      status: 'ON_TARGET',
      deviation,
      remainingSets,
      message:
        `Slightly under target — stay at ${fb.targetLoadKg} kg. ` +
        `You may still be warming into the session; re-evaluate after the next set.`,
    };
  }

  const setWord = remainingSets === 1 ? 'set' : 'sets';
  return {
    status:          'INCREASE',
    deviation,
    suggestedLoadKg: corrected,
    changeKg,
    remainingSets,
    message:
      `RPE ${fb.actualRpe} vs target ${fb.targetRpe} — you have more in the tank. ` +
      `Move up to ${corrected} kg (+${changeKg.toFixed(1)} kg) for the remaining ${remainingSets} ${setWord}.`,
  };
}

// ── Session-level aggregation ─────────────────────────────────────────────────

/**
 * Aggregates set feedback entries into a session-level RPE state.
 * Injected into the AI coach system prompt so the LLM has live awareness of
 * intra-session fatigue without the athlete needing to describe it in chat.
 */
export function summariseSessionRpeState(feedbacks: SetFeedback[]): SessionRpeState | null {
  if (feedbacks.length === 0) return null;

  const deviations = feedbacks.map((f) => f.actualRpe - f.targetRpe);
  const avg = deviations.reduce((a, b) => a + b, 0) / deviations.length;

  // Trend: split into early / late halves and compare means.
  let trend: SessionRpeState['trend'] = 'STABLE';
  if (deviations.length >= 3) {
    const mid   = Math.floor(deviations.length / 2);
    const early = deviations.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const late  = deviations.slice(mid).reduce((a, b) => a + b, 0) / (deviations.length - mid);
    const delta = late - early;
    if (delta >= 1.0)      trend = 'SPIKING';
    else if (delta >= 0.4) trend = 'RISING';
  }

  const latest = computeSetAdjustment(feedbacks[feedbacks.length - 1]);

  return { completedSets: feedbacks.length, avgDeviation: avg, trend, latestAdjustment: latest };
}

/**
 * Renders the session RPE state as a compact string for the system prompt.
 * Kept terse — this section lives inside the 700-char `session` cap.
 */
export function formatSessionRpeStateForPrompt(state: SessionRpeState): string {
  const sign  = state.avgDeviation >= 0 ? '+' : '';
  const lines = [
    `Live session — ${state.completedSets} sets logged. Avg RPE deviation: ${sign}${state.avgDeviation.toFixed(2)} (positive = heavier than prescribed). Trend: ${state.trend}.`,
  ];
  if (state.latestAdjustment && state.latestAdjustment.status !== 'ON_TARGET') {
    lines.push(`Latest load recommendation: ${state.latestAdjustment.message}`);
  }
  return lines.join('\n');
}

// ── Inverse RPE load estimation ───────────────────────────────────────────────

/**
 * Estimate current 1RM from a logged set using the Tuchscherer RPE table.
 *
 * prescribeLoad(maxKg, rpe, reps) = maxKg × pct
 * → prescribeLoad(1,   rpe, reps) = pct            (pct is the table lookup)
 * → maxKg = actualLoad / pct
 *
 * This is more accurate for moderate-rep sets than the raw Epley formula
 * because it uses the same table that produced the original prescription.
 */
function estimateMaxFromRpe(loadKg: number, reps: number, rpe: number): number {
  const clampedRpe  = Math.max(5, Math.min(10, rpe));
  const clampedReps = Math.max(1, Math.min(10, Math.round(reps)));
  const pct = prescribeLoad(1, clampedRpe, clampedReps);
  return pct > 0 ? loadKg / pct : loadKg;
}
