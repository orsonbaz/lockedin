/**
 * Mobility — PAILs / RAILs (Progressive / Regressive Angular Isometric Loading).
 *
 * The central FRC mechanic for closing the active-ROM gap. Each sequence
 * follows the same shape:
 *
 *   1. Move into PASSIVE end-range (assistance, gravity, or prop). Hold ~60–90s.
 *   2. PAIL — ramp an isometric contraction INTO the stretch (push the
 *      restraining tissue), 20% → 100% over ~10s.
 *   3. RAIL — ramp an isometric contraction OUT of the stretch (active opposing
 *      muscle pulls deeper), 20% → 100% over ~10s.
 *   4. Active expand — try to move 1–3 reps into the new range without help.
 *
 * Dosing: 1–2 cycles per session, weekly per joint, on the joint(s) with the
 * largest active/passive ROM gap. Not a daily input — that's what CARs are for.
 *
 * The routine generator biases these toward body regions where
 * `computeActiveRomGap(region).gapDeg > 15`.
 */

import type { MobilityMovement } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const pailsRailsMovements: MobilityMovement[] = [
  {
    id: 'pail_shoulder_external_rotation',
    name: 'Shoulder External Rotation PAIL/RAIL',
    category: 'PAILS_RAILS',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    durationSec: 180,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'On your knees, arm on a low bench, palm up, elbow at 90°. Sink into the stretch (90s). ' +
      'PAIL: push the back of the hand DOWN into the bench, 20→100% over 10s. ' +
      'RAIL: lift the back of the hand UP off the bench, 20→100% over 10s. ' +
      'Then actively rotate further into range, 2-3 reps. Repeat opposite side.',
    createdAt: nowIso,
  },
  {
    id: 'pail_shoulder_flexion',
    name: 'Shoulder Flexion PAIL/RAIL',
    category: 'PAILS_RAILS',
    regions: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    durationSec: 180,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Stand facing wall, arm overhead and pressed against wall in full flexion (90s). ' +
      'PAIL: drive the hand DOWN/AWAY from wall (push the bone forward), 20→100% over 10s. ' +
      'RAIL: lift the arm further UP into wall, 20→100% over 10s. ' +
      'Then step back and hover arm overhead in new range, 2-3 reps.',
    createdAt: nowIso,
  },
  {
    id: 'pail_hip_internal_rotation',
    name: 'Hip Internal Rotation PAIL/RAIL',
    category: 'PAILS_RAILS',
    regions: ['LEFT_HIP', 'RIGHT_HIP'],
    durationSec: 180,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Seated 90/90 position, target hip in front. Sink into passive end-range (90s). ' +
      'PAIL: press the OUTSIDE of the shin into the floor (push knee outward), 20→100% over 10s. ' +
      'RAIL: lift the FOOT off the floor while keeping knee planted (active IR), 20→100% over 10s. ' +
      'Then hover the lifted-foot position for 2-3 reps.',
    createdAt: nowIso,
  },
  {
    id: 'pail_hip_flexion',
    name: 'Hip Flexion / Couch PAIL/RAIL',
    category: 'PAILS_RAILS',
    regions: ['LEFT_HIP', 'RIGHT_HIP'],
    durationSec: 180,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Couch stretch — back knee on pad, shin against wall, front foot forward. Sink in (90s). ' +
      'PAIL: drive the back knee DOWN into pad (push hip into the stretch), 20→100% over 10s. ' +
      'RAIL: contract the back glute and squeeze the hip into extension (out of the stretch), 20→100% over 10s. ' +
      'Then lift and hold the back knee 1-2 inches off pad, 2-3 reps.',
    createdAt: nowIso,
  },
  {
    id: 'pail_ankle_dorsiflexion',
    name: 'Ankle Dorsiflexion PAIL/RAIL',
    category: 'PAILS_RAILS',
    regions: ['LEFT_ANKLE', 'RIGHT_ANKLE'],
    durationSec: 150,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Half-kneeling at a wall. Drive knee forward over toes — heel STAYS down. Sink in (60s). ' +
      'PAIL: push the BALL OF FOOT into the floor (plantar flex against the ground), 20→100% over 10s. ' +
      'RAIL: actively pull the TOES UP toward shin (dorsiflex hard while knee tracks forward), 20→100% over 10s. ' +
      'Then tap knee further forward in the new range, 2-3 reps.',
    createdAt: nowIso,
  },
  {
    id: 'pail_tspine_rotation',
    name: 'Thoracic Rotation PAIL/RAIL',
    category: 'PAILS_RAILS',
    regions: ['T_SPINE'],
    durationSec: 150,
    sides: 'UNILATERAL',
    isCustom: false,
    hasRomAssessment: true,
    cueShort:
      'Half-kneeling with side against a wall. Rotate t-spine away from wall to end-range (60s). ' +
      'PAIL: press the back of the hand BACK into the wall behind you, 20→100% over 10s. ' +
      'RAIL: actively pull the front shoulder FURTHER away from the wall (deeper rotation), 20→100% over 10s. ' +
      'Then rotate 2-3 reps into the new range. Repeat other side.',
    createdAt: nowIso,
  },
];
