/**
 * Mobility — Hip openers.
 *
 * Heavy bias toward strengthen-through-range (modern evidence) over passive
 * stretching. Couch stretch and pigeon stay in the library but are flagged
 * for post-training only — pre-training they reduce squat strength.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const hipOpenerMovements: MobilityMovement[] = [
  {
    id: 'cossack_squat',
    name: 'Cossack Squat',
    category: 'HIP_OPENER',
    regions: ['LEFT_HIP', 'RIGHT_HIP', 'LEFT_ANKLE', 'RIGHT_ANKLE'],
    reps: 8,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Wide stance, shift weight side to side, dropping into a deep one-leg squat as the other leg ' +
      'stays long. Heels stay down on both sides. 6-10 reps total — slow, controlled, the bottom is the goal.',
    createdAt: nowIso,
  },
  {
    id: 'dead_bug',
    name: 'Dead Bug',
    category: 'HIP_OPENER',
    regions: ['CORE', 'LEFT_HIP', 'RIGHT_HIP', 'L_SPINE'],
    reps: 16,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'On your back, arms up, knees over hips. Lower opposite arm and leg slowly while ' +
      'keeping low back FLAT to the floor. The lower-back contact is the entire point. ' +
      '6-8 reps per side. Better than couch stretch for tight hip flexors.',
    createdAt: nowIso,
  },
  {
    id: 'standing_band_hip_flexion',
    name: 'Standing Band Hip Flexion',
    category: 'HIP_OPENER',
    regions: ['LEFT_HIP', 'RIGHT_HIP'],
    reps: 16,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Light band around one ankle, anchored low. Pull knee up high against the band ' +
      'with control. Strengthens the hip flexor through full range — what tight hip flexors ' +
      'actually need. 8 reps per side.',
    createdAt: nowIso,
  },
  {
    id: 'glute_bridge',
    name: 'Glute Bridge',
    category: 'HIP_OPENER',
    regions: ['LEFT_HIP', 'RIGHT_HIP', 'L_SPINE'],
    reps: 15,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'On back, knees bent, feet flat. Squeeze glutes HARD to lift hips — ribs stay down, ' +
      'no overarching. 2 sec pause at the top. 12-15 reps. Reciprocal inhibition for tight hip flexors.',
    createdAt: nowIso,
  },
  {
    id: 'world_greatest_stretch',
    name: "World's Greatest Stretch",
    category: 'HIP_OPENER',
    regions: ['LEFT_HIP', 'RIGHT_HIP', 'T_SPINE', 'LEFT_ANKLE', 'RIGHT_ANKLE'],
    reps: 6,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Lunge with front foot. Drop opposite elbow to floor inside the front foot, then rotate ' +
      'and reach the same-side hand to the ceiling. Pause, return, switch. 3 reps per side. Hips + t-spine in one.',
    createdAt: nowIso,
  },
  {
    id: 'couch_stretch',
    name: 'Couch Stretch (post-training only)',
    category: 'HIP_OPENER',
    regions: ['LEFT_HIP', 'RIGHT_HIP'],
    durationSec: 60,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'POST-TRAINING ONLY. Back foot up on couch, front knee bent. Squeeze glute, tuck pelvis, ' +
      'lift torso. 45-60 sec per side. Skip pre-training — passive stretching cuts strength for ~60 min.',
    createdAt: nowIso,
  },
  {
    id: 'frog_stretch',
    name: 'Frog Stretch',
    category: 'HIP_OPENER',
    regions: ['LEFT_HIP', 'RIGHT_HIP'],
    durationSec: 60,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'On hands & knees, knees wide. Sit hips back toward heels. Rock slowly. ' +
      'Targets adductors and inner-hip rotation. 60 sec at the back-most position.',
    createdAt: nowIso,
  },
];
