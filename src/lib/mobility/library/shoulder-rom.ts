/**
 * Mobility — Shoulder range of motion.
 *
 * Strengthen-through-range bias. Cuban press and band dislocates do more for
 * a stiff shoulder than any cross-body stretch.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const shoulderRomMovements: MobilityMovement[] = [
  {
    id: 'band_pull_apart',
    name: 'Band Pull-Apart',
    category: 'SHOULDER_ROM',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER', 'T_SPINE'],
    reps: 20,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Light band at arms\' length. Pull band apart out wide, squeezing shoulder blades back & down. ' +
      'Slow eccentric. 15-20 reps. Cheapest insurance for bench-heavy athletes.',
    createdAt: nowIso,
  },
  {
    id: 'band_dislocate',
    name: 'Band Dislocate',
    category: 'SHOULDER_ROM',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    reps: 10,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Wide grip on a light band held in front. Pass it overhead and behind your back without ' +
      'bending elbows. Return the same way. Narrow the grip as you get stronger. 8-10 reps.',
    createdAt: nowIso,
  },
  {
    id: 'wall_angel',
    name: 'Wall Angel',
    category: 'SHOULDER_ROM',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER', 'T_SPINE'],
    reps: 10,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Back to wall, arms in goalpost. Slide arms up and down the wall — wrists, elbows, head, ' +
      'and low back stay in contact the entire time. 8-10 reps. Punishingly honest assessment.',
    createdAt: nowIso,
  },
  {
    id: 'cuban_press',
    name: 'Cuban Press (light)',
    category: 'SHOULDER_ROM',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    reps: 12,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Light DBs or empty bar. Upright row to elbow-high, then rotate up to overhead position, ' +
      'press, reverse the sequence. 8-12 reps slow. Strengthens external rotators through range.',
    createdAt: nowIso,
  },
  {
    id: 'side_lying_external_rotation',
    name: 'Side-Lying External Rotation',
    category: 'SHOULDER_ROM',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    reps: 15,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Side-lying. Top arm holds a light DB, elbow tucked to ribs, forearm across belly. ' +
      'Rotate forearm up to vertical. SLOW. 12-15 reps per side. Direct rotator-cuff work.',
    createdAt: nowIso,
  },
  {
    id: 'prone_y_t_w',
    name: 'Prone Y / T / W',
    category: 'SHOULDER_ROM',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER', 'T_SPINE'],
    reps: 24,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Prone on floor or bench. Lift arms off the floor in Y (overhead), then T (out wide), ' +
      'then W (elbows bent, hands by ears). 6-8 reps each shape. Posterior shoulder + mid-back.',
    createdAt: nowIso,
  },
];
