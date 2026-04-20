// ── Progression types ────────────────────────────────────────────────────────
// A "progression" is a ladder of bodyweight skill levels. Each level is a
// distinct exercise with a concrete passing criterion. The coach uses the
// current level to prescribe work; level-ups are logged so the athlete can
// see history on /progress.

export type ProgressionCriterion =
  | 'REPS'        // clean reps at BW (or with added load for weighted levels)
  | 'HOLD'        // seconds held in position
  | 'WEIGHTED';   // reps @ added load (for levels beyond bodyweight)

export interface ProgressionLevel {
  /** Stable snake_case id, e.g. 'muscle_up_l3_chest_to_bar'. */
  id: string;
  /** Display name shown in UI. */
  name: string;
  /** 1-based level in this progression. */
  level: number;
  /** How a rep is measured at this level. */
  criterion: ProgressionCriterion;
  /** Numeric target: reps for REPS/WEIGHTED, seconds for HOLD. */
  target: number;
  /** Short cue shown to the athlete when prescribed. */
  coachingCue: string;
  /** Must pass this level first. */
  prerequisiteId?: string;
}

export interface Progression {
  /** Stable id, e.g. 'muscle_up'. */
  id: string;
  /** Display name. */
  name: string;
  /** Primary skill category — used for grouping on /progress. */
  category: 'UPPER_PULL' | 'UPPER_PUSH' | 'LOWER' | 'CORE';
  /** Ordered levels, easiest → hardest. */
  levels: ProgressionLevel[];
}
