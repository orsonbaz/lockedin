/**
 * Mobility — Ankle.
 *
 * Ankle dorsiflexion is the rate-limiter for squat depth and goblet-squat
 * fluency. Knee-to-wall is both the assessment and the corrective.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const ankleMovements: MobilityMovement[] = [
  {
    id: 'ankle_knee_to_wall',
    name: 'Knee-to-Wall',
    category: 'ANKLE',
    regions: ['LEFT_ANKLE', 'RIGHT_ANKLE'],
    reps: 12,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Foot one fist-width from wall. Drive knee forward over toes to TOUCH the wall — heel stays glued down. ' +
      'Step back if too easy, in if too hard. 8-12 reps per side. Measure distance heel-to-wall when assessing.',
    createdAt: nowIso,
  },
  {
    id: 'banded_ankle_distraction',
    name: 'Banded Ankle Distraction',
    category: 'ANKLE',
    regions: ['LEFT_ANKLE', 'RIGHT_ANKLE'],
    durationSec: 60,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Loop a heavy band around the front of the ankle, anchored low behind you. Lunge forward with that ' +
      'foot — band pulls the talus back. Drive knee over toes. 45-60 sec per side, then go straight into knee-to-wall.',
    createdAt: nowIso,
  },
  {
    id: 'calf_eccentric_step',
    name: 'Calf Eccentric Off Step',
    category: 'ANKLE',
    regions: ['LEFT_ANKLE', 'RIGHT_ANKLE'],
    reps: 12,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'On a step. Rise on both feet, lower SLOWLY on one (3-5 sec eccentric) below the step. 8-12 per side. ' +
      'Heavy slow resistance is the answer for cranky achilles — not stretching.',
    createdAt: nowIso,
  },
  {
    id: 'toe_yoga',
    name: 'Toe Yoga',
    category: 'ANKLE',
    regions: ['LEFT_ANKLE', 'RIGHT_ANKLE'],
    reps: 10,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Seated or standing. Lift only the big toe while keeping other 4 down. Then lift only the other 4. ' +
      '5-10 each. Wakes up intrinsic foot muscles — pays off for single-leg balance and squat groove.',
    createdAt: nowIso,
  },
];
