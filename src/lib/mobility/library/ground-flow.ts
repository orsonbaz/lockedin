/**
 * Mobility — Ground flow / locomotion.
 *
 * Crawls, rolls, and transitions. High return on time — hits whole-body
 * coordination, shoulder + hip + core in one. Great anchor for an AM reset.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const groundFlowMovements: MobilityMovement[] = [
  {
    id: 'crab_reach',
    name: 'Crab Reach',
    category: 'GROUND_FLOW',
    regions: ['T_SPINE', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    reps: 10,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Reverse tabletop. Push hips up, drive opposite hand overhead and rotate to look at it — chest opens to ceiling. ' +
      'Return, switch. 5 per side, slow.',
    createdAt: nowIso,
  },
  {
    id: 'beast_to_crab',
    name: 'Beast → Crab',
    category: 'GROUND_FLOW',
    regions: ['T_SPINE', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'CORE'],
    reps: 8,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Bear position (knees off floor, 1 inch hover). Drop hips through and rotate into reverse tabletop. ' +
      'Return through bear. 4-6 transitions per side, fluid and slow.',
    createdAt: nowIso,
  },
  {
    id: 'deep_squat_hold',
    name: 'Deep Squat Hold',
    category: 'GROUND_FLOW',
    regions: ['LEFT_HIP', 'RIGHT_HIP', 'LEFT_ANKLE', 'RIGHT_ANKLE', 'T_SPINE'],
    durationSec: 120,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Heels down, knees out, chest up. Hold 60-120 sec. Use elbows to gently pry knees out. ' +
      'Rock side to side, reach for the floor between feet. Anchor of the AM reset.',
    createdAt: nowIso,
  },
  {
    id: 'pigeon_to_arch',
    name: 'Pigeon → Reverse Arch',
    category: 'GROUND_FLOW',
    regions: ['LEFT_HIP', 'RIGHT_HIP', 'T_SPINE'],
    reps: 6,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Pigeon position. Without lifting front leg, reach back and grab back foot — pull into thoracic extension. ' +
      'Slow flow between the two positions. 3 cycles per side.',
    createdAt: nowIso,
  },
];
