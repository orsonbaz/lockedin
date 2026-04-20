// ── Swap Group Registry ────────────────────────────────────────────────────────
// Canonical string IDs for swap groups.
// An exercise can belong to multiple groups (e.g., a Romanian deadlift is both
// a HINGE_BILATERAL and a HAMSTRING_DOMINANT exercise).
// These strings are the join keys between exercises in the library.

export const SWAP_GROUPS = {
  // ── Squat pattern ─────────────────────────────────────────────────────────
  /** The competition back squat and its closest variations. */
  SQUAT_COMP:         'squat_comp',
  /** High-bar back squat variations. */
  SQUAT_HIGH_BAR:     'squat_high_bar',
  /** Front-loaded squat variations (goblet, front squat, SSB). */
  SQUAT_FRONT_LOAD:   'squat_front_load',
  /** Box squat and pause squat (force developers). */
  SQUAT_PAUSE_BOX:    'squat_pause_box',
  /** Quad-dominant machine squats. */
  SQUAT_MACHINE:      'squat_machine',

  // ── Hinge pattern ─────────────────────────────────────────────────────────
  /** Competition deadlift and lockout-focused variations. */
  HINGE_COMP:         'hinge_comp',
  /** Hip-hinge with heavy hip extension emphasis (RDL, good morning). */
  HINGE_HIP_DOMINANT: 'hinge_hip_dominant',
  /** Hamstring isolation / curl movements. */
  HINGE_HAMSTRING:    'hinge_hamstring',
  /** Sumo stance hinge variations. */
  HINGE_SUMO:         'hinge_sumo',

  // ── Horizontal push ───────────────────────────────────────────────────────
  /** Competition bench press and closest variations. */
  PUSH_H_COMP:        'push_h_comp',
  /** Close-grip / tricep-focused horizontal press. */
  PUSH_H_TRICEP:      'push_h_tricep',
  /** Dumbbell / machine horizontal press (unilateral / chest isolation). */
  PUSH_H_CHEST:       'push_h_chest',
  /** Push-up variations. */
  PUSH_H_PUSHUP:      'push_h_pushup',

  // ── Vertical push ─────────────────────────────────────────────────────────
  /** Overhead press (barbell and dumbbell). */
  PUSH_V_OVERHEAD:    'push_v_overhead',
  /** Tricep isolation (extensions, pushdowns). */
  PUSH_V_TRICEP_ISO:  'push_v_tricep_iso',

  // ── Horizontal pull ───────────────────────────────────────────────────────
  /** Barbell and dumbbell rows. */
  PULL_H_ROW:         'pull_h_row',
  /** Machine and cable rows. */
  PULL_H_CABLE:       'pull_h_cable',
  /** Rear delt / face pull accessory work. */
  PULL_H_REAR_DELT:   'pull_h_rear_delt',

  // ── Vertical pull ─────────────────────────────────────────────────────────
  /** Pull-up and chin-up (bodyweight and weighted). */
  PULL_V_PULLUP:      'pull_v_pullup',
  /** Lat pulldown machine variations. */
  PULL_V_PULLDOWN:    'pull_v_pulldown',
  /** Bicep isolation. */
  PULL_V_BICEP_ISO:   'pull_v_bicep_iso',

  // ── Single leg ────────────────────────────────────────────────────────────
  /** Lunge and split squat pattern. */
  SINGLE_LEG_LUNGE:   'single_leg_lunge',
  /** Pistol squat and single-leg bodyweight squat variations. */
  SINGLE_LEG_PISTOL:  'single_leg_pistol',
  /** Step-up variations. */
  SINGLE_LEG_STEPUP:  'single_leg_stepup',

  // ── Carry and loaded locomotion ───────────────────────────────────────────
  CARRY_LOADED:       'carry_loaded',

  // ── Core ─────────────────────────────────────────────────────────────────
  /** Anti-flexion / bracing (plank, ab wheel, Pallof press). */
  CORE_ANTI_FLEX:     'core_anti_flex',
  /** Flexion-based core (leg raise, crunch). */
  CORE_FLEX:          'core_flex',
  /** Rotational / anti-rotation core. */
  CORE_ROTATION:      'core_rotation',

  // ── Street lift / calisthenics ───────────────────────────────────────────
  /** Street-lift weighted pulls (weighted pull-up, weighted muscle-up). */
  STREET_LIFT_PULL:   'street_lift_pull',
  /** Street-lift weighted dips / pressing. */
  STREET_LIFT_DIP:    'street_lift_dip',
  /** Bodyweight skill holds (front lever, planche, L-sit). */
  CALISTHENICS_HOLD:  'calisthenics_hold',
  /** Bodyweight skill dynamic work (muscle-up, pistol squat, handstand pushup). */
  CALISTHENICS_SKILL: 'calisthenics_skill',
} as const;

export type SwapGroupId = typeof SWAP_GROUPS[keyof typeof SWAP_GROUPS];
