/**
 * session-review.ts — Post-generation sanity review.
 *
 * The deterministic rules here catch the common ways the generator can
 * produce a session that doesn't match the athlete's goals or training
 * history: bench droughts, empty sessions, missing face pulls, primary
 * lift that doesn't match the athlete's chosen discipline, risky
 * spinal-load stacking, and so on.
 *
 * Every issue has `severity`:
 *   - 'BLOCK'  : the review auto-fixes the session (swap primary lift,
 *                append the missing accessory, etc.). UI shows an info chip.
 *   - 'WARN'   : surfaced to the UI as a banner; no auto-fix.
 *   - 'NOTE'   : low-priority note; displayed only in coach prompt.
 *
 * Keep every rule cheap + deterministic. LLM-based review is a separate
 * optional pass (see `aiReviewSession`).
 */

import { loadRecentLiftExposures } from './lift-exposures';
import { db } from '@/lib/db/database';
import type { AthleteProfile, Lift, TrainingBlock } from '@/lib/db/types';
import type { GeneratedSession, GeneratedExercise, LiftExposure } from './session';

// ── Types ────────────────────────────────────────────────────────────────────

export type ReviewSeverity = 'BLOCK' | 'WARN' | 'NOTE';

export interface ReviewIssue {
  code:
    | 'BENCH_DROUGHT'
    | 'SQUAT_DROUGHT'
    | 'DEADLIFT_DROUGHT'
    | 'EMPTY_SESSION'
    | 'NO_FACE_PULLS'
    | 'DISCIPLINE_MISMATCH'
    | 'SPINAL_STACKING'
    | 'BENCH_UNDER_TARGET'
    | 'NO_COMP_LIFT';
  severity: ReviewSeverity;
  summary: string;
  fix?: string;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  /** Session rewritten to address BLOCK-severity issues. Same object if no fixes. */
  session: GeneratedSession;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasExerciseNamed(session: GeneratedSession, ...names: string[]): boolean {
  return session.exercises.some((e) => names.includes(e.name));
}

function hasCompLiftFor(session: GeneratedSession, lift: Lift): boolean {
  return session.exercises.some(
    (e) => e.exerciseType === 'COMPETITION' && e.name.toLowerCase().includes(lift.toLowerCase()),
  );
}

function exposureFor(exposures: LiftExposure[], lift: Lift): LiftExposure | undefined {
  return exposures.find((e) => e.lift === lift);
}

const WEEKLY_TARGET: Record<'SQUAT' | 'BENCH' | 'DEADLIFT', number> = {
  SQUAT:    2.5,
  BENCH:    3.5,
  DEADLIFT: 2.5,
};

// ── Core rule engine ─────────────────────────────────────────────────────────

/**
 * Runs the deterministic review and optionally patches the session in place.
 * Pure with respect to DB state — callers must pass exposures + block so this
 * function stays testable.
 */
export function reviewSessionPure(input: {
  session: GeneratedSession;
  profile: AthleteProfile;
  block: TrainingBlock;
  exposures: LiftExposure[];
  weekDayOfWeek: number;
}): ReviewResult {
  const { session, profile, exposures, block } = input;
  const issues: ReviewIssue[] = [];
  let patched: GeneratedSession = session;

  // ── 1. Empty session ────────────────────────────────────────────────────
  if (session.exercises.length === 0) {
    issues.push({
      code: 'EMPTY_SESSION',
      severity: 'WARN',
      summary: 'Session has no exercises. Regenerate from Home.',
    });
    return { issues, session };
  }

  // ── 2. Bench drought ────────────────────────────────────────────────────
  // Bench has the highest weekly target (3.5). If it's been ≥ 5 days since
  // the last completed bench AND today's primary isn't bench, swap primary
  // to bench — this is what Flex/Millz consensus says matters most.
  const benchExp = exposureFor(exposures, 'BENCH');
  const squatExp = exposureFor(exposures, 'SQUAT');
  const dlExp    = exposureFor(exposures, 'DEADLIFT');

  const daysSinceBench = benchExp?.daysSince ?? Infinity;
  const daysSinceSquat = squatExp?.daysSince ?? Infinity;
  const daysSinceDL    = dlExp?.daysSince    ?? Infinity;

  // Only rewrite primary for ACCUMULATION / INTENSIFICATION / PIVOT / MAINTENANCE.
  // Realization / deload stays deterministic.
  const canRewrite = block.blockType === 'ACCUMULATION'
                  || block.blockType === 'INTENSIFICATION'
                  || block.blockType === 'PIVOT'
                  || block.blockType === 'MAINTENANCE';

  if (daysSinceBench >= 5 && session.primaryLift !== 'BENCH' && canRewrite) {
    issues.push({
      code: 'BENCH_DROUGHT',
      severity: 'BLOCK',
      summary: `No bench in ${Math.round(daysSinceBench)} days — rewriting today to a bench session.`,
      fix: 'Primary lift swapped to BENCH.',
    });
    patched = swapPrimaryLift(session, 'BENCH');
  } else if (daysSinceSquat >= 7 && session.primaryLift !== 'SQUAT' && canRewrite) {
    issues.push({
      code: 'SQUAT_DROUGHT',
      severity: 'BLOCK',
      summary: `No squat in ${Math.round(daysSinceSquat)} days — rewriting today to a squat session.`,
      fix: 'Primary lift swapped to SQUAT.',
    });
    patched = swapPrimaryLift(session, 'SQUAT');
  } else if (daysSinceDL >= 7 && session.primaryLift !== 'DEADLIFT' && canRewrite) {
    issues.push({
      code: 'DEADLIFT_DROUGHT',
      severity: 'BLOCK',
      summary: `No deadlift in ${Math.round(daysSinceDL)} days — rewriting today to a deadlift session.`,
      fix: 'Primary lift swapped to DEADLIFT.',
    });
    patched = swapPrimaryLift(session, 'DEADLIFT');
  }

  // ── 3. Weekly bench target check ────────────────────────────────────────
  // Bench target is 3.5/week. If we're on/after Thursday and bench count is
  // still below 2, that's a WARN (not BLOCK — we don't have enough runway).
  const isLateWeek = input.weekDayOfWeek >= 4; // Thu, Fri, Sat
  const benchThisWeek = benchExp?.weekCount ?? 0;
  if (isLateWeek && benchThisWeek < 2 && patched.primaryLift !== 'BENCH' && canRewrite) {
    issues.push({
      code: 'BENCH_UNDER_TARGET',
      severity: 'WARN',
      summary: `Only ${benchThisWeek} bench session${benchThisWeek === 1 ? '' : 's'} this week — target is 3-4. Consider stacking bench today.`,
    });
  }

  // ── 4. Face pulls on bench day ──────────────────────────────────────────
  if (patched.primaryLift === 'BENCH' && !hasExerciseNamed(patched, 'Face Pull')) {
    issues.push({
      code: 'NO_FACE_PULLS',
      severity: 'BLOCK',
      summary: 'Bench day without face pulls — adding them (shoulder health non-negotiable).',
    });
    patched = appendExercise(patched, {
      name:              'Face Pull',
      exerciseType:      'ACCESSORY',
      setStructure:      'STRAIGHT',
      sets:              3,
      reps:              15,
      rpeTarget:         7,
      estimatedLoadKg:   Math.max(10, Math.round((profile.maxBench ?? 80) * 0.12 / 2.5) * 2.5),
      order:             patched.exercises.length + 1,
      notes:             'Rear-delt + external rotation. Every bench day.',
      libraryExerciseId: 'face_pull',
    });
  }

  // ── 5. Discipline mismatch ──────────────────────────────────────────────
  // If athlete's primary discipline is STREET_LIFT and today has a comp squat
  // / bench / DL as primary with no street-lift accessory, flag it (WARN only
  // — user may have intentionally wanted a PL day).
  const primaryDisc = profile.primaryDiscipline ?? profile.disciplines?.[0];
  if (primaryDisc === 'STREET_LIFT') {
    const hasWeightedPull = hasExerciseNamed(patched, 'Weighted Pull-Up');
    const hasWeightedDip  = hasExerciseNamed(patched, 'Weighted Dip');
    if (!hasWeightedPull && !hasWeightedDip) {
      issues.push({
        code: 'DISCIPLINE_MISMATCH',
        severity: 'WARN',
        summary: 'Primary discipline is street-lift but today has no weighted pull-up or dip. Swap an accessory?',
      });
    }
  }

  // ── 6. Spinal-erector stacking ──────────────────────────────────────────
  // Heavy squat + heavy deadlift in the same session outside of a planned
  // SBD rehearsal risks a miserable week. We already prevent this in the
  // adaptive selector but secondaryLifts can still produce it — warn only.
  const hasHeavySquat = patched.exercises.some(
    (e) => e.exerciseType === 'COMPETITION' && e.name.includes('Squat') && e.rpeTarget >= 8,
  );
  const hasHeavyDL = patched.exercises.some(
    (e) => e.exerciseType === 'COMPETITION' && (e.name.includes('Deadlift') || e.name.includes('Pull')) && e.rpeTarget >= 8,
  );
  if (hasHeavySquat && hasHeavyDL && block.blockType !== 'REALIZATION') {
    issues.push({
      code: 'SPINAL_STACKING',
      severity: 'WARN',
      summary: 'Heavy squat + heavy deadlift stacked today. Spinal erector fatigue will hurt the next 48h.',
    });
  }

  // ── 7. At least one comp lift ───────────────────────────────────────────
  const hasAnyComp = patched.exercises.some((e) => e.exerciseType === 'COMPETITION');
  if (!hasAnyComp) {
    issues.push({
      code: 'NO_COMP_LIFT',
      severity: 'WARN',
      summary: 'No competition-lift work scheduled. Consider regenerating from Home.',
    });
  }

  return { issues, session: patched };
}

// ── Session mutation helpers ─────────────────────────────────────────────────

function appendExercise(session: GeneratedSession, ex: GeneratedExercise): GeneratedSession {
  return {
    ...session,
    exercises: [...session.exercises, ex],
    modifications: [...session.modifications, `Review added ${ex.name}.`],
  };
}

/**
 * Swap the primary lift of a generated session. This is a non-trivial
 * mutation — regenerating from scratch is cleaner than patching in place.
 * We defer to `regenerateWithPrimary` which is wired into the async DB flow.
 * For the pure-review path we emit a minimal placeholder that the caller
 * must handle by re-running the generator.
 */
function swapPrimaryLift(session: GeneratedSession, newPrimary: Lift): GeneratedSession {
  return {
    ...session,
    primaryLift: newPrimary,
    modifications: [
      ...session.modifications,
      `Review flagged primary-lift swap to ${newPrimary} — regenerate to apply.`,
    ],
  };
}

// ── DB-backed entry point ────────────────────────────────────────────────────

/**
 * Loads exposures from Dexie and runs the review. Returns `issues` the UI
 * can render; actual primary-lift swaps should be done by re-running
 * `generateSession` with a pinned `forcePrimary` — see ensure-session-fresh.
 */
export async function reviewSession(input: {
  session: GeneratedSession;
  profile: AthleteProfile;
  block: TrainingBlock;
  dateStr: string;
  weekDayOfWeek: number;
}): Promise<ReviewResult> {
  const exposures = await loadRecentLiftExposures(input.dateStr).catch(() => []);
  return reviewSessionPure({ ...input, exposures });
}

/**
 * Persist the review issues on the session row so the UI can render them.
 * Uses `aiModifications` (already a JSON blob on TrainingSession) — we stash
 * issues alongside any engine modifications so the UI reads one field.
 */
export function packReviewIssues(issues: ReviewIssue[]): string {
  return JSON.stringify(issues);
}

export function unpackReviewIssues(raw: string | undefined): ReviewIssue[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'object' && x && 'code' in x && 'severity' in x)) {
      return parsed as ReviewIssue[];
    }
    return [];
  } catch {
    return [];
  }
}

// ── Persisted-issue field name (non-indexed, additive on TrainingSession) ────
// Stored in TrainingSession.reviewIssues as a JSON string.
// See TrainingSession in db/types.ts for the added field.
export const REVIEW_ISSUES_FIELD = 'reviewIssues' as const;

// Convenience: enrich a DB-read TrainingSession with parsed review issues.
export async function loadSessionReviewIssues(sessionId: string): Promise<ReviewIssue[]> {
  const row = await db.sessions.get(sessionId);
  const raw = (row as unknown as { reviewIssues?: string } | undefined)?.reviewIssues;
  return unpackReviewIssues(raw);
}
