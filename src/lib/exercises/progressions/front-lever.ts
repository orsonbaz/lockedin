import type { Progression } from './types';

/**
 * Front lever progression.
 *
 * Isometric hold built on scap depression + straight-arm lat strength.
 * Targets are in seconds (or reps of slow raises for the transition levels).
 * A carryover benefit: the lat and core engagement directly improves
 * deadlift bracing.
 */
export const frontLeverProgression: Progression = {
  id: 'front_lever',
  name: 'Front Lever',
  category: 'CORE',
  levels: [
    {
      id: 'front_lever_l1_tuck_hold',
      name: 'Tuck Front Lever Hold',
      level: 1,
      criterion: 'HOLD',
      target: 20,
      coachingCue: 'Knees to chest, back horizontal, arms straight. Depress the scaps hard — this is the foundation.',
    },
    {
      id: 'front_lever_l2_advanced_tuck',
      name: 'Advanced Tuck Front Lever',
      level: 2,
      criterion: 'HOLD',
      target: 15,
      coachingCue: 'Hips extended, knees still bent at ~90°. Chest stays parallel to the floor.',
      prerequisiteId: 'front_lever_l1_tuck_hold',
    },
    {
      id: 'front_lever_l3_single_leg',
      name: 'Single-Leg Front Lever',
      level: 3,
      criterion: 'HOLD',
      target: 10,
      coachingCue: 'One leg fully extended, one tucked. Alternate legs between sets.',
      prerequisiteId: 'front_lever_l2_advanced_tuck',
    },
    {
      id: 'front_lever_l4_straddle',
      name: 'Straddle Front Lever',
      level: 4,
      criterion: 'HOLD',
      target: 8,
      coachingCue: 'Legs wide apart, both extended. The wider the straddle the easier the hold.',
      prerequisiteId: 'front_lever_l3_single_leg',
    },
    {
      id: 'front_lever_l5_full',
      name: 'Full Front Lever',
      level: 5,
      criterion: 'HOLD',
      target: 5,
      coachingCue: 'Legs together, body straight, parallel to the ground. Tight glutes, tight abs.',
      prerequisiteId: 'front_lever_l4_straddle',
    },
    {
      id: 'front_lever_l6_full_long',
      name: 'Front Lever Long Hold',
      level: 6,
      criterion: 'HOLD',
      target: 15,
      coachingCue: 'Same position, 15s hold. Next: pulls.',
      prerequisiteId: 'front_lever_l5_full',
    },
    {
      id: 'front_lever_l7_pull',
      name: 'Front Lever Pull',
      level: 7,
      criterion: 'REPS',
      target: 3,
      coachingCue: 'Straight-arm pull from dead hang to full lever. Absurdly strong lats.',
      prerequisiteId: 'front_lever_l6_full_long',
    },
  ],
};
