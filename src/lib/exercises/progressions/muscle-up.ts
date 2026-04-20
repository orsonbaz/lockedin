import type { Progression } from './types';

/**
 * Muscle-up progression.
 *
 * Path: hold-based scap work → explosive chest-to-bar → false-grip work →
 * assisted muscle-up → single rep → sets. Targets are conservative — most
 * intermediates stall for months on the transition, so "clean" means strict
 * with no kip unless the level explicitly allows one.
 */
export const muscleUpProgression: Progression = {
  id: 'muscle_up',
  name: 'Bar Muscle-Up',
  category: 'UPPER_PULL',
  levels: [
    {
      id: 'muscle_up_l1_scap_pullup',
      name: 'Scapular Pull-Ups',
      level: 1,
      criterion: 'REPS',
      target: 12,
      coachingCue: 'Dead hang. Retract scaps without bending the elbows. Builds the scap control the muscle-up requires.',
    },
    {
      id: 'muscle_up_l2_strict_pullup',
      name: 'Strict Pull-Up',
      level: 2,
      criterion: 'REPS',
      target: 10,
      coachingCue: 'Pronated grip, full dead-hang, chin clears the bar. Non-negotiable before moving on.',
      prerequisiteId: 'muscle_up_l1_scap_pullup',
    },
    {
      id: 'muscle_up_l3_chest_to_bar',
      name: 'Chest-to-Bar Pull-Up',
      level: 3,
      criterion: 'REPS',
      target: 6,
      coachingCue: 'Pull until your sternum touches the bar. Develops the pull height needed for the transition.',
      prerequisiteId: 'muscle_up_l2_strict_pullup',
    },
    {
      id: 'muscle_up_l4_explosive_pullup',
      name: 'Explosive Pull-Up (hands leave bar)',
      level: 4,
      criterion: 'REPS',
      target: 5,
      coachingCue: 'Pull fast enough that your hands can briefly leave the bar at the top. Accelerate through the full pull.',
      prerequisiteId: 'muscle_up_l3_chest_to_bar',
    },
    {
      id: 'muscle_up_l5_negative',
      name: 'Muscle-Up Negative',
      level: 5,
      criterion: 'REPS',
      target: 3,
      coachingCue: 'Jump to the top, lower slowly under control (3s). Builds the transition-to-dip strength.',
      prerequisiteId: 'muscle_up_l4_explosive_pullup',
    },
    {
      id: 'muscle_up_l6_single',
      name: 'Strict Muscle-Up (1 rep)',
      level: 6,
      criterion: 'REPS',
      target: 1,
      coachingCue: 'No kip. False grip or straight bar. Celebrate — most lifters take 6-12 months to get here.',
      prerequisiteId: 'muscle_up_l5_negative',
    },
    {
      id: 'muscle_up_l7_sets',
      name: 'Muscle-Up for Reps',
      level: 7,
      criterion: 'REPS',
      target: 5,
      coachingCue: 'Strict reps in a single set. Next: weighted.',
      prerequisiteId: 'muscle_up_l6_single',
    },
    {
      id: 'muscle_up_l8_weighted',
      name: 'Weighted Muscle-Up',
      level: 8,
      criterion: 'WEIGHTED',
      target: 5,
      coachingCue: 'Belt + plate/chain. Street-lifters live here — great lockout builder for bench.',
      prerequisiteId: 'muscle_up_l7_sets',
    },
  ],
};
