/**
 * Mobility — Thoracic spine.
 *
 * Pre-bench / pre-overhead staples. Most "shoulder mobility" issues are
 * actually t-spine extension issues; address the spine first.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const tSpineMovements: MobilityMovement[] = [
  {
    id: 'open_book',
    name: 'Open Book',
    category: 'T_SPINE',
    regions: ['T_SPINE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    reps: 12,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Side-lying, knees stacked & bent at 90°, arms straight out. Open the top arm across to the other side ' +
      'of the body, following with your gaze. Knees stay glued together. 6 slow reps per side.',
    createdAt: nowIso,
  },
  {
    id: 'quadruped_t_rotation',
    name: 'Quadruped T-Rotation',
    category: 'T_SPINE',
    regions: ['T_SPINE'],
    reps: 12,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'On hands & knees, one hand behind head. Drive elbow under the body toward the opposite knee, ' +
      'then rotate up to the ceiling. Follow with eyes. 6 per side.',
    createdAt: nowIso,
  },
  {
    id: 'foam_roller_t_extension',
    name: 'Foam Roller T-Extension',
    category: 'T_SPINE',
    regions: ['T_SPINE'],
    reps: 8,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Foam roller perpendicular to spine, just below shoulder blades. Hands behind head, lift hips slightly. ' +
      'Drape backward over the roller, pause, return. Inch up the spine 2 cm and repeat. 6-8 reps total.',
    createdAt: nowIso,
  },
  {
    id: 'wall_slide_t_extension',
    name: 'Wall Slide + T-Extension',
    category: 'T_SPINE',
    regions: ['T_SPINE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    reps: 10,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Back against the wall, arms in goalpost. Slide arms overhead while keeping wrists, elbows, ' +
      'AND lower back in contact with the wall. If you lose contact, that\'s your end range — don\'t cheat it. 8-10 reps.',
    createdAt: nowIso,
  },
  {
    id: 'sphinx_press_up',
    name: 'Sphinx Press-Up',
    category: 'T_SPINE',
    regions: ['T_SPINE', 'L_SPINE'],
    reps: 8,
    sides: 'BILATERAL',
    isCustom: false,
    hasRomAssessment: false,
    cueShort:
      'Prone. Press chest up, arms straight, hips stay GLUED to floor. McKenzie-style spinal extension. ' +
      '6-8 reps, hold the top 2 sec each. Good for desk-dominant athletes.',
    createdAt: nowIso,
  },
];
