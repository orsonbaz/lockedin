// ── Fatigue Budget System ──────────────────────────────────────────────────────
// Every exercise has a FatigueProfile. A session has a cumulative fatigue cap
// based on its block type. The budget system answers: "how much fatigue headroom
// is left before we hit the cap?"
//
// Fatigue unit = systemicFatigue × sets (for systemic cap)
//             = localFatigue   × sets (for local cap)
//
// These are rough proxies, not precise physiology. The goal is consistent
// relative comparisons so the swap engine can assess apples-to-apples fit.

import type { BlockType } from '@/lib/db/types';
import type { Exercise, SessionFatigueBudget } from './types';

// ── Per-block systemic fatigue caps ───────────────────────────────────────────
// Higher = more cumulative CNS load is acceptable.

const SYSTEMIC_CAPS: Record<BlockType, number> = {
  ACCUMULATION:    180,  // High volume, moderate loads
  INTENSIFICATION: 140,  // Lower volume, heavier loads
  REALIZATION:      80,  // Near-meet — volume drops sharply
  DELOAD:           60,  // Recovery week — minimal load
  PIVOT:           120,  // GPP / off-season general prep
  MAINTENANCE:     120,  // Maintain fitness between cycles
};

// Local fatigue caps are more generous than systemic (can trash a muscle group
// more than the whole CNS in one session).
const LOCAL_CAPS: Record<BlockType, number> = {
  ACCUMULATION:    220,
  INTENSIFICATION: 170,
  REALIZATION:     100,
  DELOAD:           80,
  PIVOT:           160,
  MAINTENANCE:     160,
};

// ── Budget calculation ────────────────────────────────────────────────────────

/**
 * Computes the fatigue budget for a session given its block type and the
 * exercises already in the session (with their set counts).
 *
 * `existingExercises` is a sparse list: pass only the exercises BEFORE the
 * candidate slot. The result tells the swap engine how much room is left.
 */
export function computeSessionBudget(
  blockType: BlockType,
  existingExercises: Array<{ exercise: Exercise; sets: number }>,
): SessionFatigueBudget {
  const systemicCap = SYSTEMIC_CAPS[blockType];
  const localCap    = LOCAL_CAPS[blockType];

  let systemicUsed = 0;
  let localUsed    = 0;

  for (const { exercise, sets } of existingExercises) {
    systemicUsed += exercise.fatigue.systemicFatigue * sets;
    localUsed    += exercise.fatigue.localFatigue    * sets;
  }

  return {
    systemicCap,
    localCap,
    systemicUsed,
    localUsed,
    systemicRemaining: Math.max(0, systemicCap - systemicUsed),
    localRemaining:    Math.max(0, localCap    - localUsed),
  };
}

/**
 * Returns a 0–1 score representing how well a candidate exercise fits
 * within the remaining budget.
 *
 * 1.0 = uses ≤ 50% of remaining headroom (great fit)
 * 0.5 = uses 100% of remaining headroom (tight but doable)
 * 0.0 = exceeds remaining headroom (blows the budget)
 */
export function budgetHeadroom(
  candidate: Exercise,
  sets: number,
  budget: SessionFatigueBudget,
): number {
  const systemic = candidate.fatigue.systemicFatigue * sets;
  const local    = candidate.fatigue.localFatigue    * sets;

  // If either dimension blows the budget, return 0.
  if (systemic > budget.systemicRemaining) return 0;
  if (local    > budget.localRemaining)    return 0;

  // Higher score = more headroom remaining after adding this exercise.
  const systemicUsageRatio =
    budget.systemicRemaining > 0 ? systemic / budget.systemicRemaining : 1;
  const localUsageRatio =
    budget.localRemaining > 0 ? local / budget.localRemaining : 1;

  // Worst (highest) usage ratio drives the score.
  const worstRatio = Math.max(systemicUsageRatio, localUsageRatio);

  // Linear: 0% usage → 1.0, 100% usage → 0.5, >100% → 0.0
  return Math.max(0, 1 - worstRatio * 0.5);
}
