/**
 * Mobility — built-in routine templates.
 *
 * Each routine is a curated, ordered list of movement IDs that totals roughly
 * the stated duration. `tags` drive the rule-based composer: when the athlete
 * asks for "pre-squat prep" or "AM reset", the generator looks up tagged
 * templates first, then trims to fit the time budget.
 *
 * These rows are seeded into Dexie's `mobilityRoutines` table on first launch
 * (idempotent: the seed checks for existing source='TEMPLATE' rows first).
 */

import type { MobilityRoutine } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

export const TEMPLATE_ROUTINES: MobilityRoutine[] = [
  {
    id: 'am_reset_12min',
    name: 'AM Reset',
    ownerId: 'me',
    durationMin: 12,
    movementIds: [
      'cars_neck',
      'cars_shoulder',
      'cars_tspine',
      'cars_hip',
      'cars_ankle',
      'deep_squat_hold',
      'world_greatest_stretch',
      'crab_reach',
    ],
    source: 'TEMPLATE',
    tags: ['AM', 'daily', 'full_body'],
    createdAt: nowIso,
  },
  {
    id: 'pm_decompress_10min',
    name: 'PM Decompress',
    ownerId: 'me',
    durationMin: 10,
    movementIds: [
      'crocodile_breathing',
      'cat_cow',
      'pelvic_tilt',
      'pigeon_to_arch',
      'couch_stretch',
      'extended_exhale',
    ],
    source: 'TEMPLATE',
    tags: ['PM', 'daily', 'down_regulate', 'post_training_ok'],
    createdAt: nowIso,
  },
  {
    id: 'pre_squat_prep_6min',
    name: 'Pre-Squat Prep',
    ownerId: 'me',
    durationMin: 6,
    movementIds: [
      'cars_ankle',
      'ankle_knee_to_wall',
      'banded_ankle_distraction',
      'cars_hip',
      'cossack_squat',
      'deep_squat_hold',
    ],
    source: 'TEMPLATE',
    tags: ['pre_session', 'pre_squat', 'pre_deadlift'],
    createdAt: nowIso,
  },
  {
    id: 'pre_press_prep_5min',
    name: 'Pre-Press Prep',
    ownerId: 'me',
    durationMin: 5,
    movementIds: [
      'cars_wrist',
      'cars_shoulder',
      'cars_tspine',
      'band_pull_apart',
      'wall_slide_t_extension',
      'side_lying_external_rotation',
    ],
    source: 'TEMPLATE',
    tags: ['pre_session', 'pre_bench', 'pre_overhead'],
    createdAt: nowIso,
  },
  {
    id: 'desk_job_spine_15min',
    name: 'Desk Job Spine Reset',
    ownerId: 'me',
    durationMin: 15,
    movementIds: [
      'crocodile_breathing',
      'cat_cow',
      'sphinx_press_up',
      'open_book',
      'foam_roller_t_extension',
      'bird_dog',
      'dead_bug',
      'standing_band_hip_flexion',
      'glute_bridge',
      'wall_angel',
    ],
    source: 'TEMPLATE',
    tags: ['desk', 'lunch_break', 'spine'],
    createdAt: nowIso,
  },
  {
    id: 'post_session_cooldown_8min',
    name: 'Post-Session Cooldown',
    ownerId: 'me',
    durationMin: 8,
    movementIds: [
      'crocodile_breathing',
      'couch_stretch',
      'frog_stretch',
      'pigeon_to_arch',
      'cat_cow',
      'extended_exhale',
    ],
    source: 'TEMPLATE',
    tags: ['post_session', 'post_training_ok', 'down_regulate'],
    createdAt: nowIso,
  },
];
