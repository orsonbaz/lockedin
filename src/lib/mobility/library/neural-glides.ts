/**
 * Mobility — Neural glides.
 *
 * Sciatic and median nerve "flossing" for athletes who tend to feel nerve-y
 * tightness in hamstrings or forearms. Low intensity, never push into pain.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const neuralGlideMovements: MobilityMovement[] = [
  {
    id: 'sciatic_glide',
    name: 'Sciatic Nerve Glide',
    category: 'NEURAL_GLIDE',
    regions: ['L_SPINE', 'LEFT_HIP', 'RIGHT_HIP'],
    reps: 16,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Seated, leg extended. As you extend the knee and dorsiflex the ankle, simultaneously ' +
      'EXTEND the neck (look up). As knee bends, flex neck (look down). 8 reps per side. ' +
      'Never push into pain — this is gentle.',
    createdAt: nowIso,
  },
  {
    id: 'median_nerve_glide',
    name: 'Median Nerve Glide',
    category: 'NEURAL_GLIDE',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_WRIST', 'RIGHT_WRIST'],
    reps: 16,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Arm out to side, palm up. Extend wrist back, then SIDE-BEND head away from the arm. ' +
      'Return. 8 reps per side. For wrist/forearm tightness that doesn\'t resolve with grip work.',
    createdAt: nowIso,
  },
];
