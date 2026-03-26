// ── Exercise Swap Engine ───────────────────────────────────────────────────────
// Given a source exercise and a swap context (block type, available equipment,
// worn gear, and remaining session fatigue budget), returns a ranked list of
// candidate swaps from the library.
//
// Scoring weights (sum = 1.0):
//   movementPattern   0.25  — same movement pattern is non-negotiable
//   muscleOverlap     0.25  — primary muscles must substantially overlap
//   fatigueProximity  0.20  — apples-to-apples fatigue load
//   equipmentFit      0.15  — athlete has the required hardware
//   specificityMatch  0.10  — appropriate specificity for the block type
//   budgetFit         0.05  — fits within remaining session fatigue budget

import type { Exercise, SwapCandidate, SwapContext, GymEquipment } from './types';
import type { BlockType } from '@/lib/db/types';
import { EXERCISE_LIBRARY, EXERCISES_BY_SWAP_GROUP } from './index';
import { computeSessionBudget, budgetHeadroom } from './fatigue-budget';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns up to 8 ranked swap candidates for `source`, filtered to exercises
 * that score ≥ 30/100. Excludes the source exercise itself.
 */
export function suggestSwaps(
  source: Exercise,
  context: SwapContext,
  /** Additional custom exercises to include in the candidate pool. */
  customExercises: Exercise[] = [],
): SwapCandidate[] {
  // ── Build candidate pool ──────────────────────────────────────────────────
  // Start with exercises from the same swap groups, then fall back to the
  // same movement pattern if the pool is thin.

  const seen = new Set<string>();
  const candidates: Exercise[] = [];

  for (const group of source.swapGroups) {
    const bucket = EXERCISES_BY_SWAP_GROUP.get(group) ?? [];
    for (const ex of bucket) {
      if (ex.id === source.id) continue;
      if (!seen.has(ex.id)) {
        seen.add(ex.id);
        candidates.push(ex);
      }
    }
  }

  // Add custom exercises that share a swap group.
  for (const ex of customExercises) {
    if (ex.id === source.id) continue;
    const hasGroup = ex.swapGroups.some((g) => source.swapGroups.includes(g));
    if (hasGroup && !seen.has(ex.id)) {
      seen.add(ex.id);
      candidates.push(ex);
    }
  }

  // If < 4 candidates, widen to same movement pattern.
  if (candidates.length < 4) {
    for (const ex of EXERCISE_LIBRARY) {
      if (ex.id === source.id) continue;
      if (seen.has(ex.id)) continue;
      if (ex.movementPattern === source.movementPattern) {
        seen.add(ex.id);
        candidates.push(ex);
      }
    }
  }

  // ── Compute the session budget from the context ───────────────────────────
  const budget = computeSessionBudget(context.blockType, []);
  // Reduce budget by the source exercise's own contribution (we're replacing it,
  // so its fatigue has NOT been committed yet — start from a clean slate but
  // leave room for other exercises in the session by using the context values).
  const adjustedBudget = {
    ...budget,
    systemicRemaining: context.remainingSystemic,
    localRemaining:    context.remainingLocal,
  };

  // ── Score each candidate ──────────────────────────────────────────────────
  const scored: SwapCandidate[] = [];

  for (const candidate of candidates) {
    // 1. Movement pattern score (0 or 1 — binary)
    const patternScore = candidate.movementPattern === source.movementPattern ? 1 : 0.3;

    // 2. Muscle overlap score (Jaccard-like)
    const srcPrimary = new Set(source.primaryMuscles);
    const overlap = candidate.primaryMuscles.filter((m) => srcPrimary.has(m)).length;
    const union   = new Set([...source.primaryMuscles, ...candidate.primaryMuscles]).size;
    const muscleScore = union > 0 ? overlap / union : 0;

    // 3. Fatigue proximity score (inverted normalised distance)
    const systemicDelta = Math.abs(
      candidate.fatigue.systemicFatigue - source.fatigue.systemicFatigue,
    );
    const localDelta = Math.abs(
      candidate.fatigue.localFatigue - source.fatigue.localFatigue,
    );
    // Max possible delta on a 1–10 scale is 9; normalise to 0–1 and invert.
    const fatigueScore = 1 - (systemicDelta + localDelta) / 18;

    // 4. Equipment availability score
    // Check which equipment options the candidate requires that the athlete has.
    const hasBodyweight = candidate.equipment.includes('BODYWEIGHT');
    const nonBW = candidate.equipment.filter(
      (e): e is GymEquipment => e !== 'BODYWEIGHT',
    );
    const missingNonBW = nonBW.filter(
      (e) => !context.availableEquipment.includes(e),
    );
    const equipScore =
      hasBodyweight || missingNonBW.length === 0
        ? 1
        : missingNonBW.length < nonBW.length
          ? 0.5     // at least one equipment option available
          : 0;      // all required equipment missing

    // 5. Specificity match score
    const idealSpecificity = blockTypeToSpecificityWindow(context.blockType);
    const specDelta = Math.abs(candidate.specificity - idealSpecificity);
    const specificityScore = 1 - specDelta / 4;  // max delta = 4 on a 1-5 scale

    // 6. Budget fit score
    const defaultSets = 3;  // conservative estimate for the swap
    const bScore = budgetHeadroom(candidate, defaultSets, adjustedBudget);

    // ── Composite score ───────────────────────────────────────────────────
    const score =
      patternScore     * 0.25 +
      muscleScore      * 0.25 +
      fatigueScore     * 0.20 +
      equipScore       * 0.15 +
      specificityScore * 0.10 +
      bScore           * 0.05;

    const normalised = Math.round(score * 100);

    const loadFactor = computeLoadAdjustmentFactor(source, candidate);
    const reason = buildSwapReason(
      source,
      candidate,
      { patternScore, muscleScore, fatigueScore, equipScore, specificityScore, budgetScore: bScore },
      context,
    );

    scored.push({
      exercise:                candidate,
      score:                   normalised,
      reason,
      requiresEquipmentChange: missingNonBW.length > 0 && !hasBodyweight,
      loadAdjustmentFactor:    loadFactor,
    });
  }

  // Sort descending; discard scores below 30 (poor matches); cap at 8.
  return scored
    .filter((c) => c.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function blockTypeToSpecificityWindow(blockType: BlockType): number {
  const map: Record<BlockType, number> = {
    REALIZATION:     5,
    INTENSIFICATION: 4,
    ACCUMULATION:    3,
    DELOAD:          3,
    PIVOT:           2,
    MAINTENANCE:     3,
  };
  return map[blockType];
}

function computeLoadAdjustmentFactor(
  source: Exercise,
  candidate: Exercise,
): number {
  const specDelta = source.specificity - candidate.specificity;
  if (specDelta <= 0) return 1.0;
  if (specDelta === 1) return 0.90;
  if (specDelta === 2) return 0.80;
  if (specDelta === 3) return 0.70;
  return 0.60;
}

function buildSwapReason(
  source: Exercise,
  candidate: Exercise,
  scores: Record<string, number>,
  context: SwapContext,
): string {
  const parts: string[] = [];

  if (scores.muscleScore >= 0.8) {
    parts.push(`targets the same primary movers (${source.primaryMuscles.join(', ').toLowerCase().replace(/_/g, ' ')})`);
  } else if (scores.muscleScore >= 0.5) {
    parts.push('good muscle overlap');
  } else {
    parts.push('partial muscle overlap');
  }

  const systemicDelta =
    candidate.fatigue.systemicFatigue - source.fatigue.systemicFatigue;
  if (systemicDelta === 0) {
    parts.push('identical systemic fatigue load');
  } else if (systemicDelta < 0) {
    parts.push(`lower CNS demand (${Math.abs(systemicDelta)} point${Math.abs(systemicDelta) > 1 ? 's' : ''} less)`);
  } else {
    parts.push(`higher CNS demand (${systemicDelta} point${systemicDelta > 1 ? 's' : ''} more) — monitor fatigue`);
  }

  if (scores.specificityScore >= 0.9) {
    parts.push(`ideal specificity for ${context.blockType.toLowerCase()} block`);
  }

  if (candidate.modifiers.beltCompatible && context.wearingBelt) {
    parts.push('belt-compatible');
  }

  if (candidate.modifiers.isWeightedCalisthenics) {
    parts.push('bodyweight + added load');
  }

  return parts.join('; ') + '.';
}
