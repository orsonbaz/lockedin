/**
 * Mobility — Controlled Articular Rotations (CARs).
 *
 * FRC-style full-ROM joint rotations. The athlete uses 30-50% effort and
 * moves through the LARGEST possible circle at every joint. CARs are the
 * "morning brush-your-teeth" of joint health — short, daily, no warm-up
 * required. Self-assessment value is high: if a circle is small or skips a
 * portion of the arc, that's the joint asking for attention.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const carsMovements: MobilityMovement[] = [
  {
    id: 'cars_shoulder',
    name: 'Shoulder CAR',
    category: 'CARS',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    durationSec: 90,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Stand tall, opposite arm braced across chest. Lift arm forward, externally rotate ' +
      'palm-up, draw the biggest circle you can backward. 2-3 reps per side, 30-50% effort. ' +
      'Notice any "skips" in the arc — those are your weak spots.',
    createdAt: nowIso,
  },
  {
    id: 'cars_hip',
    name: 'Hip CAR',
    category: 'CARS',
    regions: ['LEFT_HIP', 'RIGHT_HIP'],
    durationSec: 90,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'On hands & knees or standing. Lift one knee out to the side, drive it forward to the chest, ' +
      'around to the back, and down. Move through the largest circle possible. 2-3 reps each direction per side.',
    createdAt: nowIso,
  },
  {
    id: 'cars_tspine',
    name: 'Thoracic CAR',
    category: 'CARS',
    regions: ['T_SPINE'],
    durationSec: 60,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Quadruped. Hand behind head, drive elbow toward ceiling — rotate just the upper back, ' +
      'not the lower. Reverse direction. 3-5 reps per side. Look at the moving elbow throughout.',
    createdAt: nowIso,
  },
  {
    id: 'cars_neck',
    name: 'Neck CAR',
    category: 'CARS',
    regions: ['CERVICAL_SPINE', 'NECK'],
    durationSec: 60,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Seated tall. Chin to chest, ear to shoulder, head back, other ear to shoulder, chin to chest. ' +
      'Slow, smooth circle — never crank the neck. 2-3 reps each direction.',
    createdAt: nowIso,
  },
  {
    id: 'cars_wrist',
    name: 'Wrist CAR',
    category: 'CARS',
    regions: ['LEFT_WRIST', 'RIGHT_WRIST'],
    durationSec: 60,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Arm extended. Make a loose fist, draw biggest circles at the wrist. 5 reps each direction per side. ' +
      'Essential before any pressing or front-rack work.',
    createdAt: nowIso,
  },
  {
    id: 'cars_ankle',
    name: 'Ankle CAR',
    category: 'CARS',
    regions: ['LEFT_ANKLE', 'RIGHT_ANKLE'],
    durationSec: 60,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Seated or standing on one leg. Draw biggest possible circles with the foot — point hard, ' +
      'roll to the inside, dorsiflex hard, roll to the outside. 5 reps each direction per side.',
    createdAt: nowIso,
  },
];
