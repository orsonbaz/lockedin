import type { LibraryExercise } from '../types';
import { SWAP_GROUPS } from '../swap-groups';

/**
 * Calisthenics / street-lift library.
 *
 * These entries are the exercises the coach actually prescribes — the
 * progression *ladders* (muscle-up L1→L8 etc.) live in progressions/.
 * Each entry here represents a single concrete exercise that might show
 * up in a session.
 */
export const calisthenicsExercises: LibraryExercise[] = [
  // ── Weighted street-lift pulls ──────────────────────────────────────────
  {
    id: 'weighted_muscle_up',
    name: 'Weighted Muscle-Up',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'VERTICAL_PULL',
    primaryLiftTarget: null,
    specificity: 2,
    primaryMuscles: ['LATS', 'TRICEPS', 'CHEST'],
    secondaryMuscles: ['BICEPS', 'REAR_DELTS', 'ABS'],
    fatigue: {
      systemicFatigue: 7,
      localFatigue: 9,
      technicalDemand: 9,
      recoveryDays: 3,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: true,
      isWeightedCalisthenics: true,
    },
    coachingNotes: 'Explosive pull, fast transition. Dip belt + plate for added load. Full street-lift competition standard.',
    swapGroups: [SWAP_GROUPS.STREET_LIFT_PULL, SWAP_GROUPS.CALISTHENICS_SKILL],
    isCustom: false,
  },

  {
    id: 'archer_pull_up',
    name: 'Archer Pull-Up',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'VERTICAL_PULL',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['LATS', 'BICEPS'],
    secondaryMuscles: ['RHOMBOIDS', 'CHEST'],
    fatigue: {
      systemicFatigue: 5,
      localFatigue: 8,
      technicalDemand: 7,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: true,
    },
    coachingNotes: 'One arm pulls, the other stays extended and assists. Best lat-asymmetry corrector in the library.',
    swapGroups: [SWAP_GROUPS.PULL_V_PULLUP, SWAP_GROUPS.CALISTHENICS_SKILL],
    isCustom: false,
  },

  // ── Weighted dips ──────────────────────────────────────────────────────
  {
    id: 'weighted_ring_dip',
    name: 'Weighted Ring Dip',
    equipment: ['BODYWEIGHT', 'RINGS'],
    movementPattern: 'HORIZONTAL_PUSH',
    primaryLiftTarget: 'BENCH',
    specificity: 2,
    primaryMuscles: ['CHEST', 'TRICEPS'],
    secondaryMuscles: ['FRONT_DELTS'],
    fatigue: {
      systemicFatigue: 6,
      localFatigue: 8,
      technicalDemand: 7,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: true,
      isWeightedCalisthenics: true,
    },
    coachingNotes: 'Rings turn out at the top (RTO). Depth: shoulders below elbows. Direct bench lockout carryover.',
    swapGroups: [SWAP_GROUPS.STREET_LIFT_DIP, SWAP_GROUPS.PUSH_H_TRICEP],
    isCustom: false,
  },

  {
    id: 'weighted_bar_dip',
    name: 'Weighted Bar Dip',
    equipment: ['BODYWEIGHT'],
    primaryLiftTarget: 'BENCH',
    movementPattern: 'HORIZONTAL_PUSH',
    specificity: 2,
    primaryMuscles: ['CHEST', 'TRICEPS'],
    secondaryMuscles: ['FRONT_DELTS'],
    fatigue: {
      systemicFatigue: 5,
      localFatigue: 8,
      technicalDemand: 4,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: true,
      isWeightedCalisthenics: true,
    },
    coachingNotes: 'Lean slightly forward for more chest, stay vertical for more tricep. Add load via dip belt once 10 BW reps are easy.',
    swapGroups: [SWAP_GROUPS.STREET_LIFT_DIP, SWAP_GROUPS.PUSH_H_TRICEP, SWAP_GROUPS.PUSH_H_CHEST],
    isCustom: false,
  },

  // ── Isometric skills ───────────────────────────────────────────────────
  {
    id: 'front_lever_hold',
    name: 'Front Lever Hold',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'CORE',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['LATS', 'ABS'],
    secondaryMuscles: ['RHOMBOIDS', 'OBLIQUES', 'GLUTES'],
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 8,
      technicalDemand: 8,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Scapula depressed. Prescribed by progression level — tuck, single-leg, straddle, full. Brutal lat isometric.',
    swapGroups: [SWAP_GROUPS.CALISTHENICS_HOLD, SWAP_GROUPS.CORE_ANTI_FLEX],
    isCustom: false,
  },

  {
    id: 'l_sit_hold',
    name: 'L-Sit Hold',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'CORE',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['ABS', 'HIP_FLEXORS'],
    secondaryMuscles: ['QUADS', 'TRICEPS'],
    fatigue: {
      systemicFatigue: 3,
      localFatigue: 7,
      technicalDemand: 6,
      recoveryDays: 1,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Legs extended, hips open. Straight arms, scaps depressed. Accumulate total seconds across sets.',
    swapGroups: [SWAP_GROUPS.CALISTHENICS_HOLD, SWAP_GROUPS.CORE_FLEX],
    isCustom: false,
  },

  {
    id: 'planche_lean',
    name: 'Planche Lean',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'HORIZONTAL_PUSH',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['FRONT_DELTS', 'CHEST'],
    secondaryMuscles: ['ABS', 'TRICEPS', 'SIDE_DELTS'],
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 8,
      technicalDemand: 7,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: true,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Top of a push-up, protract scaps, shift shoulders forward of hands. Straight arms. Builds the planche foundation.',
    swapGroups: [SWAP_GROUPS.CALISTHENICS_HOLD],
    isCustom: false,
  },

  // ── Dynamic bodyweight skills ──────────────────────────────────────────
  // (pistol_squat lives in library/single-leg.ts — the CALISTHENICS_SKILL
  //  swap group is added to it there so we don't duplicate the entry.)

  {
    id: 'handstand_push_up',
    name: 'Handstand Push-Up',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'VERTICAL_PUSH',
    primaryLiftTarget: null,
    specificity: 2,
    primaryMuscles: ['FRONT_DELTS', 'TRICEPS'],
    secondaryMuscles: ['SIDE_DELTS', 'CHEST', 'ABS'],
    fatigue: {
      systemicFatigue: 6,
      localFatigue: 8,
      technicalDemand: 8,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: true,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Wall-supported first, free-standing when strong. Press strict — no kip. Direct overhead press carryover.',
    swapGroups: [SWAP_GROUPS.PUSH_V_OVERHEAD, SWAP_GROUPS.CALISTHENICS_SKILL],
    isCustom: false,
  },
];
