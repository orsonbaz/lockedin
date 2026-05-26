import type { LibraryExercise } from '../types';
import { SWAP_GROUPS } from '../swap-groups';

export const singleLegExercises: LibraryExercise[] = [
  {
    id: 'bulgarian_split_squat',
    name: 'Bulgarian Split Squat',
    alias: 'RFESS',
    equipment: ['BARBELL', 'DUMBBELL', 'KETTLEBELL', 'BODYWEIGHT'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: 'SQUAT',
    specificity: 2,
    primaryMuscles: ['QUADS', 'GLUTES'],
    secondaryMuscles: ['HAMSTRINGS', 'ADDUCTORS', 'HIP_FLEXORS'],
    fatigue: {
      systemicFatigue: 6,
      localFatigue: 8,
      technicalDemand: 7,
      recoveryDays: 3,
      spinalLoad: 'MEDIUM',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Rear foot elevated on a bench. Front shin vertical. One of the most effective single-leg exercises for powerlifters. Highly transferable to the squat.',
    swapGroups: [SWAP_GROUPS.SINGLE_LEG_LUNGE],
    tags: ['UNILATERAL', 'LENGTHENED_BIAS'],
    isCustom: false,
  },

  {
    id: 'walking_lunge',
    name: 'Walking Lunge',
    equipment: ['BARBELL', 'DUMBBELL', 'BODYWEIGHT'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['QUADS', 'GLUTES'],
    secondaryMuscles: ['HAMSTRINGS', 'ADDUCTORS', 'CALVES'],
    fatigue: {
      systemicFatigue: 5,
      localFatigue: 7,
      technicalDemand: 5,
      recoveryDays: 2,
      spinalLoad: 'MEDIUM',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Long stride to target glutes; shorter stride shifts to quads. Hold dumbbells or barbell on back.',
    swapGroups: [SWAP_GROUPS.SINGLE_LEG_LUNGE],
    tags: ['UNILATERAL', 'LENGTHENED_BIAS'],
    isCustom: false,
  },

  {
    id: 'reverse_lunge',
    name: 'Reverse Lunge',
    equipment: ['BARBELL', 'DUMBBELL', 'BODYWEIGHT'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['QUADS', 'GLUTES'],
    secondaryMuscles: ['HAMSTRINGS', 'ADDUCTORS'],
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 6,
      technicalDemand: 5,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Step back rather than forward — lower knee demand. Good for athletes with knee sensitivity.',
    swapGroups: [SWAP_GROUPS.SINGLE_LEG_LUNGE],
    tags: ['UNILATERAL'],
    isCustom: false,
  },

  {
    id: 'step_up',
    name: 'Step-Up',
    equipment: ['BARBELL', 'DUMBBELL', 'BODYWEIGHT'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['QUADS', 'GLUTES'],
    secondaryMuscles: ['HAMSTRINGS', 'CALVES'],
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 6,
      technicalDemand: 4,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes: 'Drive through the heel of the elevated foot. Don\'t use the back leg to push off. Box height ~90 degrees of knee flexion.',
    swapGroups: [SWAP_GROUPS.SINGLE_LEG_STEPUP, SWAP_GROUPS.SINGLE_LEG_LUNGE],
    tags: ['UNILATERAL'],
    isCustom: false,
  },

  {
    id: 'pistol_squat',
    name: 'Pistol Squat',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['QUADS', 'GLUTES'],
    secondaryMuscles: ['HAMSTRINGS', 'HIP_ABDUCTORS', 'ABS'],
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 6,
      technicalDemand: 9,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: true,
    },
    coachingNotes: 'Full single-leg squat to the bottom. Demands excellent ankle mobility. Progress from box pistols before going freestanding.',
    swapGroups: [SWAP_GROUPS.SINGLE_LEG_PISTOL, SWAP_GROUPS.CALISTHENICS_SKILL],
    tags: ['UNILATERAL', 'LENGTHENED_BIAS'],
    isCustom: false,
  },

  {
    id: 'hip_thrust',
    name: 'Hip Thrust',
    equipment: ['BARBELL', 'MACHINE'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: 'DEADLIFT',
    specificity: 1,
    primaryMuscles: ['GLUTES'],
    secondaryMuscles: ['HAMSTRINGS', 'ABS'],
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 7,
      technicalDemand: 4,
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
    coachingNotes: 'Upper back on a bench, drive the hips up hard. Best loaded glute exercise. Use pad on the bar for comfort.',
    swapGroups: [SWAP_GROUPS.SINGLE_LEG_LUNGE, SWAP_GROUPS.HINGE_HIP_DOMINANT],
    isCustom: false,
  },

  // ── Phase C — Knees-Over-Toes + tendon-iso progressions ───────────────────
  // Load-bearing extension of FRC. Where FRC opens the door on knee/hip
  // end-range, these exercises walk the joint through it under weight.
  // Surfaced first when the active arc favors LONGEVITY / MOBILITY_REBUILD,
  // or when knee/ankle injuries are active.

  {
    id: 'atg_split_squat',
    name: 'ATG Split Squat',
    alias: 'KOT Split Squat',
    equipment: ['BODYWEIGHT', 'DUMBBELL'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['QUADS', 'GLUTES'],
    secondaryMuscles: ['HAMSTRINGS', 'ADDUCTORS', 'CALVES'],
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 7,
      technicalDemand: 6,
      recoveryDays: 2,
      spinalLoad: 'LOW',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes:
      'Deep front-knee-over-toe split squat — front heel stays planted, back knee taps the floor. ' +
      'Builds end-range knee tolerance, VMO, and hip mobility under load. Start bodyweight; add ' +
      'dumbbells once full depth is honest.',
    swapGroups: [SWAP_GROUPS.SINGLE_LEG_LUNGE],
    tags: ['UNILATERAL', 'KOT', 'LENGTHENED_BIAS'],
    isCustom: false,
  },

  {
    id: 'backwards_sled',
    name: 'Backwards Sled Drag',
    alias: 'Reverse Sled',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['QUADS'],
    secondaryMuscles: ['GLUTES', 'CALVES'],
    // Concentric-only quad work — gentler than ATG split squats but real
    // systemic cost from loaded pulling. systemicFatigue 4 prevents it from
    // looking artificially "free" to the accessory scorer.
    fatigue: {
      systemicFatigue: 4,
      localFatigue: 6,
      technicalDemand: 2,
      recoveryDays: 1,
      spinalLoad: 'NONE',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes:
      'Drag a loaded sled backwards in short bouts (50–100 ft × 3-5). Concentric-only quad work ' +
      'with VMO + patellar tendon emphasis. Bulletproofs knees pre-injury and rebuilds them ' +
      'post-injury. Cement walks, parking lots, or anywhere flat works.',
    // Not a Bulgarian replacement — its own thing. CARRY_LOADED keeps it
    // adjacent to other loaded locomotion work without crowding the lunge group.
    swapGroups: [SWAP_GROUPS.CARRY_LOADED],
    tags: ['KOT'],
    isCustom: false,
  },

  {
    id: 'tibialis_raise',
    name: 'Tibialis Raise',
    alias: 'Tib Raise',
    equipment: ['BODYWEIGHT', 'MACHINE'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['CALVES'],
    secondaryMuscles: [],
    fatigue: {
      systemicFatigue: 3,
      localFatigue: 5,
      technicalDemand: 2,
      recoveryDays: 1,
      spinalLoad: 'NONE',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: false,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes:
      'Stand back against a wall, heels ~12" from wall. Lift toes UP toward shins, slow lower. ' +
      'Trains the anterior shin — protects the knee, prevents shin splints, improves ankle ' +
      'dorsiflexion. 2-3 sets of 20-30 reps to failure.',
    // Surfaced via the KOT tag — its own niche, doesn't compete with main
    // accessories. Bump systemic fatigue to be honest about real cost.
    swapGroups: [SWAP_GROUPS.CARRY_LOADED],
    tags: ['KOT'],
    isCustom: false,
  },

  {
    id: 'nordic_curl',
    name: 'Nordic Hamstring Curl',
    alias: 'Nordic',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'HINGE',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['HAMSTRINGS'],
    secondaryMuscles: ['GLUTES', 'CALVES'],
    // Brutal eccentric loading. systemicFatigue 5 reflects the real recovery
    // cost (24-48h hamstring soreness is the norm) — prevents the selector
    // from picking it over more session-appropriate accessories.
    fatigue: {
      systemicFatigue: 5,
      localFatigue: 9,
      technicalDemand: 6,
      recoveryDays: 3,
      spinalLoad: 'NONE',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: true,
    },
    coachingNotes:
      'Anchor heels under a support; lower body forward under control, catch with hands at the ' +
      'bottom and push back up. Heavy eccentric hamstring loading — prevents strains, builds ' +
      'short-head hamstring under length. Brutal — start with band assistance.',
    swapGroups: [SWAP_GROUPS.HINGE_HAMSTRING],
    tags: ['KOT', 'LENGTHENED_BIAS'],
    isCustom: false,
  },

  {
    id: 'spanish_squat_iso',
    name: 'Spanish Squat Isometric',
    alias: 'Heavy Iso Squat',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'SQUAT',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['QUADS'],
    secondaryMuscles: ['GLUTES'],
    fatigue: {
      systemicFatigue: 2,
      localFatigue: 6,
      technicalDemand: 3,
      recoveryDays: 1,
      spinalLoad: 'NONE',
    },
    modifiers: {
      beltCompatible: false,
      beltStrengthModifier: null,
      kneeSleevesCompatible: true,
      kneeSleevesModifier: null,
      wristWrapsCompatible: false,
      isWeightedCalisthenics: false,
    },
    coachingNotes:
      'Loop a band around something solid behind the knees, lean back into it, sit into a deep ' +
      'squat and HOLD. 5 × 30s holds at the heaviest band tension you can sustain. Heavy ' +
      'isometric tendon work — patellar tendinopathy prevention. Finisher.',
    swapGroups: [SWAP_GROUPS.SQUAT_MACHINE],
    tags: ['TENDON_ISO'],
    isCustom: false,
  },

  {
    id: 'copenhagen_plank',
    name: 'Copenhagen Plank',
    alias: 'Adductor Plank',
    equipment: ['BODYWEIGHT'],
    movementPattern: 'SINGLE_LEG',
    primaryLiftTarget: null,
    specificity: 1,
    primaryMuscles: ['ADDUCTORS'],
    secondaryMuscles: ['ABS', 'GLUTES'],
    fatigue: {
      systemicFatigue: 2,
      localFatigue: 6,
      technicalDemand: 5,
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
    coachingNotes:
      'Side plank with top leg supported on a bench, bottom leg hovering. Builds adductor ' +
      'strength + length — groin strain prevention. 3-4 sets, 20-40 sec holds. Progress from ' +
      'knee-supported variant if needed.',
    swapGroups: [SWAP_GROUPS.CORE_ANTI_FLEX],
    tags: ['TENDON_ISO', 'UNILATERAL'],
    isCustom: false,
  },
];
