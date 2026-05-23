/**
 * Mobility — Breathing / parasympathetic resets.
 *
 * Down-regulators that pair nicely with PM routines and post-session
 * cooldowns. Box breathing is also useful as a pre-heavy-set ritual.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const breathingMovements: MobilityMovement[] = [
  {
    id: 'box_breathing',
    name: 'Box Breathing (4-4-4-4)',
    category: 'BREATHING',
    regions: ['CORE'],
    durationSec: 240,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Inhale 4 sec, hold 4, exhale 4, hold 4. Repeat for 3-4 minutes. ' +
      'Down-regulates the nervous system. Also useful as a pre-heavy-set focus drill.',
    createdAt: nowIso,
  },
  {
    id: 'crocodile_breathing',
    name: 'Crocodile Breathing',
    category: 'BREATHING',
    regions: ['CORE', 'L_SPINE'],
    durationSec: 180,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Prone, forehead on hands. Breathe into the belly so the floor pushes back into you ' +
      '— ribcage expands 360°. 2-3 min. Restores diaphragm dominance over neck breathing.',
    createdAt: nowIso,
  },
  {
    id: 'extended_exhale',
    name: 'Extended Exhale (4-8)',
    category: 'BREATHING',
    regions: ['CORE'],
    durationSec: 180,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Inhale through nose 4 sec, exhale through pursed lips 8 sec. 3 min. ' +
      'Parasympathetic dominance — use evening or after stressful days.',
    createdAt: nowIso,
  },
];
