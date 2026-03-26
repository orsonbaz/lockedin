// ── Exercise Library Types ─────────────────────────────────────────────────────
// These types describe the static exercise catalogue (shipped in the JS bundle,
// never stored in Dexie) and the user's equipment preferences (stored in Dexie).

import type { BlockType, Lift } from '@/lib/db/types';

// ── Gym hardware (distinct from Equipment = federation class RAW/SINGLE_PLY/…) ─

export type GymEquipment =
  | 'BARBELL'
  | 'DUMBBELL'
  | 'CABLE'
  | 'BODYWEIGHT'
  | 'RINGS'
  | 'KETTLEBELL'
  | 'MACHINE'
  | 'BANDS'
  | 'TRAP_BAR';

// ── Movement taxonomy ────────────────────────────────────────────────────────

export type MovementPattern =
  | 'SQUAT'
  | 'HINGE'
  | 'HORIZONTAL_PUSH'
  | 'VERTICAL_PUSH'
  | 'HORIZONTAL_PULL'
  | 'VERTICAL_PULL'
  | 'CARRY'
  | 'CORE'
  | 'SINGLE_LEG';

// ── Muscle groups ────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'QUADS'
  | 'HAMSTRINGS'
  | 'GLUTES'
  | 'ADDUCTORS'
  | 'CALVES'
  | 'HIP_FLEXORS'
  | 'SPINAL_ERECTORS'
  | 'LATS'
  | 'TRAPS'
  | 'RHOMBOIDS'
  | 'REAR_DELTS'
  | 'FRONT_DELTS'
  | 'SIDE_DELTS'
  | 'CHEST'
  | 'TRICEPS'
  | 'BICEPS'
  | 'FOREARMS'
  | 'ABS'
  | 'OBLIQUES'
  | 'HIP_ABDUCTORS';

// ── Fatigue profile ──────────────────────────────────────────────────────────
// systemicFatigue:  CNS / whole-body drain (1 = minimal, 10 = maximal)
// localFatigue:     Target muscle group fatigue (1 = minimal, 10 = maximal)
// technicalDemand:  Skill / coordination demand (1 = simple, 10 = very complex)
// recoveryDays:     Minimum days before repeating at full intensity
// spinalLoad:       Axial/compressive loading on the spine

export type SpinalLoad = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface FatigueProfile {
  systemicFatigue:  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  localFatigue:     1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  technicalDemand:  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  recoveryDays:     1 | 2 | 3 | 4 | 5 | 6 | 7;
  spinalLoad:       SpinalLoad;
}

// ── Equipment modifiers (belt / sleeves / wraps) ─────────────────────────────

export interface EquipmentModifiers {
  /** True if a powerlifting belt meaningfully assists this exercise. */
  beltCompatible:          boolean;
  /** Fractional 1RM increase when wearing a belt, e.g. 0.07 = 7%. null = not applicable. */
  beltStrengthModifier:    number | null;
  /** True if knee sleeves provide meaningful support / warmth on this exercise. */
  kneeSleevesCompatible:   boolean;
  /** Fractional 1RM increase from sleeves, e.g. 0.03. null = not applicable. */
  kneeSleevesModifier:     number | null;
  /** True if wrist wraps provide meaningful wrist support on this exercise. */
  wristWrapsCompatible:    boolean;
  /** True for dips, pull-ups, pistol squats, etc. where the athlete's bodyweight
   *  is part of the load. estimatedLoadKg then stores ADDED load only. */
  isWeightedCalisthenics:  boolean;
}

// ── Library exercise (static, shipped in bundle) ─────────────────────────────

export interface LibraryExercise {
  /** Stable snake_case identifier, e.g. 'competition_squat'. Never changes. */
  id:                  string;
  /** Display name shown in the UI. */
  name:                string;
  /** Alternative name / cue athletes commonly use. */
  alias?:              string;
  /** Hardware required. Multiple entries = any of these work. */
  equipment:           GymEquipment[];
  /** Primary movement taxonomy bucket. */
  movementPattern:     MovementPattern;
  /** Which competition lift this directly trains. null = general strength. */
  primaryLiftTarget:   Lift | null;
  /**
   * Competition specificity: how closely this trains the competition lift.
   * 5 = competition movement itself
   * 4 = close variation (slight modification, e.g. pause squat)
   * 3 = moderate variation (different bar position, box squat, etc.)
   * 2 = general pattern (goblet squat, front squat for a back squatter)
   * 1 = GPP / bodybuilding accessory
   */
  specificity:         1 | 2 | 3 | 4 | 5;
  primaryMuscles:      MuscleGroup[];
  secondaryMuscles:    MuscleGroup[];
  fatigue:             FatigueProfile;
  modifiers:           EquipmentModifiers;
  /** Coaching tip displayed alongside the exercise in the UI. */
  coachingNotes?:      string;
  /**
   * Swap group IDs this exercise belongs to.
   * Multiple groups = can swap into any of those categories.
   * Defined as constants in swap-groups.ts.
   */
  swapGroups:          string[];
  /** Discriminant for LibraryExercise | CustomExercise union narrowing. */
  isCustom:            false;
}

// ── Custom exercise (athlete-authored, stored in Dexie) ──────────────────────

export interface CustomExercise {
  id:              string;
  name:            string;
  movementPattern: MovementPattern;
  primaryMuscles:  MuscleGroup[];
  fatigue:         FatigueProfile;
  modifiers:       EquipmentModifiers;
  equipment:       GymEquipment[];
  specificity:     1 | 2 | 3 | 4 | 5;
  swapGroups:      string[];
  /** Discriminant for LibraryExercise | CustomExercise union narrowing. */
  isCustom:        true;
  createdAt:       string;
}

export type Exercise = LibraryExercise | CustomExercise;

// ── User's gym equipment + gear profile (singleton in Dexie, id = 'me') ───────

export interface UserEquipmentProfile {
  /** Always 'me' — single-user app. */
  id:                 'me';
  /** Gym hardware the athlete has access to. */
  availableEquipment: GymEquipment[];
  /** Does the athlete own and use a powerlifting belt? */
  hasBelt:            boolean;
  /** Does the athlete own and use knee sleeves? */
  hasKneeSleeves:     boolean;
  /** Does the athlete own and use wrist wraps? */
  hasWristWraps:      boolean;
  updatedAt:          string;
}

// ── Swap system types ─────────────────────────────────────────────────────────

export interface SwapContext {
  blockType:          BlockType;
  /** Equipment the athlete has available right now. */
  availableEquipment: GymEquipment[];
  /** Gear being worn today. */
  wearingBelt:        boolean;
  wearingKneeSleeves: boolean;
  wearingWristWraps:  boolean;
  /** Current session fatigue budget (used for budgetScore). */
  remainingSystemic:  number;
  remainingLocal:     number;
}

export interface SwapCandidate {
  exercise:                Exercise;
  /** 0–100 composite match score. */
  score:                   number;
  /** Human-readable explanation of why this is a good swap. */
  reason:                  string;
  /** True if the candidate needs gear the athlete didn't mark as available. */
  requiresEquipmentChange: boolean;
  /**
   * Multiplier to apply to the original exercise's prescribed load.
   * 1.0 = same load, 0.80 = use 80% as a starting point.
   */
  loadAdjustmentFactor:    number;
}

export interface SessionFatigueBudget {
  /** Max systemic fatigue units the session can accumulate. */
  systemicCap:     number;
  /** Max local fatigue units the session can accumulate. */
  localCap:        number;
  /** Units already used by exercises before the candidate. */
  systemicUsed:    number;
  localUsed:       number;
  systemicRemaining: number;
  localRemaining:    number;
}

// ── Gear context (used by effectiveMax in equipment-modifiers.ts) ─────────────

export interface GearContext {
  usingBelt:        boolean;
  usingKneeSleeves: boolean;
  usingWristWraps:  boolean;
}
