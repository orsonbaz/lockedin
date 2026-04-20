import type { Progression } from './types';

/**
 * Pistol squat progression.
 *
 * Unilateral single-leg squat. Excellent accessory for squatters with
 * asymmetries and a natural fit for powerlifters who also do calisthenics.
 * Progression uses depth and stability, then added load.
 */
export const pistolSquatProgression: Progression = {
  id: 'pistol_squat',
  name: 'Pistol Squat',
  category: 'LOWER',
  levels: [
    {
      id: 'pistol_l1_assisted_box',
      name: 'Box Pistol (assisted)',
      level: 1,
      criterion: 'REPS',
      target: 8,
      coachingCue: 'Sit back to a box, hold a post or TRX for balance. Both legs equal depth.',
    },
    {
      id: 'pistol_l2_box_bw',
      name: 'Box Pistol (bodyweight)',
      level: 2,
      criterion: 'REPS',
      target: 8,
      coachingCue: 'Tap the box, stand up. No hand assist. Box roughly at knee height.',
      prerequisiteId: 'pistol_l1_assisted_box',
    },
    {
      id: 'pistol_l3_partial',
      name: 'Partial Pistol (above parallel)',
      level: 3,
      criterion: 'REPS',
      target: 6,
      coachingCue: 'Free-standing, descend until thigh is just above parallel. Controlled.',
      prerequisiteId: 'pistol_l2_box_bw',
    },
    {
      id: 'pistol_l4_full',
      name: 'Full Pistol Squat',
      level: 4,
      criterion: 'REPS',
      target: 5,
      coachingCue: 'Hamstring to calf contact, no bounce, extended leg clears the floor.',
      prerequisiteId: 'pistol_l3_partial',
    },
    {
      id: 'pistol_l5_sets',
      name: 'Pistol Squat Sets',
      level: 5,
      criterion: 'REPS',
      target: 8,
      coachingCue: 'Clean reps in a single set, each leg. Weighted work next.',
      prerequisiteId: 'pistol_l4_full',
    },
    {
      id: 'pistol_l6_weighted',
      name: 'Weighted Pistol Squat',
      level: 6,
      criterion: 'WEIGHTED',
      target: 5,
      coachingCue: 'Goblet or plate in front for counterbalance. Watch the knee track over the toes.',
      prerequisiteId: 'pistol_l5_sets',
    },
  ],
};
