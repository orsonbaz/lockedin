// ── Progression Registry ─────────────────────────────────────────────────────
// Aggregates all bodyweight-skill progressions. Consumed by:
//   - the coach prompt ("athlete is on muscle-up L3")
//   - the session generator (future: insert progression work)
//   - /progress UI level history
//   - ProgressionHistory Dexie table (see Phase 2 schema notes)

import type { Progression, ProgressionLevel } from './types';
import { muscleUpProgression }   from './muscle-up';
import { frontLeverProgression } from './front-lever';
import { pistolSquatProgression } from './pistol-squat';

export const PROGRESSIONS: Progression[] = [
  muscleUpProgression,
  frontLeverProgression,
  pistolSquatProgression,
];

export const PROGRESSION_BY_ID = new Map<string, Progression>(
  PROGRESSIONS.map((p) => [p.id, p]),
);

export const PROGRESSION_LEVEL_BY_ID = new Map<string, ProgressionLevel>();
for (const p of PROGRESSIONS) {
  for (const lv of p.levels) {
    PROGRESSION_LEVEL_BY_ID.set(lv.id, lv);
  }
}

/** Get the next level in the progression, or null at the top. */
export function nextLevel(progressionId: string, currentLevelId: string): ProgressionLevel | null {
  const p = PROGRESSION_BY_ID.get(progressionId);
  if (!p) return null;
  const idx = p.levels.findIndex((lv) => lv.id === currentLevelId);
  if (idx < 0 || idx >= p.levels.length - 1) return null;
  return p.levels[idx + 1];
}

export type { Progression, ProgressionLevel, ProgressionCriterion } from './types';
