/**
 * Mobility — Spinal / postural decompression.
 *
 * The McGill "big three" (curl-up, side plank, bird dog) plus segmental
 * cat-cow. These build endurance for the deep spinal stabilizers — the
 * actual root of most lower-back complaints in lifters.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const spinalMovements: MobilityMovement[] = [
  {
    id: 'cat_cow',
    name: 'Cat-Cow',
    category: 'L_SPINE',
    regions: ['T_SPINE', 'L_SPINE'],
    reps: 12,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Hands & knees. Slow segmental flexion and extension of the entire spine. ' +
      'Move ONE vertebra at a time, not as a hinge. 8-12 cycles, breathe with the motion.',
    createdAt: nowIso,
  },
  {
    id: 'bird_dog',
    name: 'Bird Dog',
    category: 'L_SPINE',
    regions: ['CORE', 'L_SPINE'],
    reps: 16,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Hands & knees. Extend opposite arm and leg, hold 2-3 sec — hips and shoulders STAY SQUARE. ' +
      '8 per side. McGill #3: anti-rotation endurance for the spinal stabilizers.',
    createdAt: nowIso,
  },
  {
    id: 'mcgill_curl_up',
    name: 'McGill Curl-Up',
    category: 'L_SPINE',
    regions: ['CORE'],
    reps: 20,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'One leg bent foot flat, other leg straight. Hands under low back to preserve lordosis. ' +
      'Lift HEAD AND SHOULDERS as one unit — no spinal flexion. 10 per side, hold 5-10 sec each.',
    createdAt: nowIso,
  },
  {
    id: 'side_plank',
    name: 'Side Plank',
    category: 'L_SPINE',
    regions: ['CORE', 'L_SPINE', 'LEFT_HIP', 'RIGHT_HIP'],
    durationSec: 60,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'On forearm, body straight. Hold 20-30 sec per side, build to 60. McGill #2: lateral chain endurance. ' +
      'Modify on knees if needed.',
    createdAt: nowIso,
  },
  {
    id: 'pelvic_tilt',
    name: 'Pelvic Tilt',
    category: 'L_SPINE',
    regions: ['L_SPINE', 'CORE'],
    reps: 12,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'On back, knees bent. Tilt pelvis to flatten low back to floor (post-tilt), then arch slightly (ant-tilt). ' +
      'Small range, slow. 10-12 cycles. Restores motor control after long sitting.',
    createdAt: nowIso,
  },
  {
    id: 'jefferson_curl_eccentric',
    name: 'Jefferson Curl (light, eccentric)',
    category: 'L_SPINE',
    regions: ['L_SPINE', 'T_SPINE'],
    reps: 6,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Light DB or empty bar. Stand on a box, knees locked. Roll down ONE vertebra at a time — chin first, ' +
      'reach toward toes. 4-6 reps SLOW. Builds end-range spinal load tolerance. Skip if you have an active L-spine flare.',
    createdAt: nowIso,
  },
];
