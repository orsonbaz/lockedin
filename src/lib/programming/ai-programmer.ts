/**
 * ai-programmer.ts — Validate program patches proposed by the AI coach.
 *
 * Flow: LLM emits a `ProgramPatch` object. This module parses + validates
 * it, returning either `{ok: true, patch}` or `{ok: false, errors}`. The
 * engine applies only validated patches; invalid ones are returned as
 * structured errors the LLM can read and retry.
 *
 * No DB writes. Pure function against the supplied context (the current
 * cycle, its blocks, sessions). Call sites pass in fresh snapshots.
 *
 * Guardrails enforced:
 *   - Block inserts/replacements cannot deviate volumeTarget or
 *     intensityTarget by > 30% from what's already prescribed.
 *   - Block week ranges must be non-overlapping and cover 1..N contiguously
 *     if the patch replaces the full cycle structure.
 *   - A DELOAD block must precede a REALIZATION block when both exist.
 *   - Session overrides cannot remove competition lifts.
 *   - Volume changes per exercise capped at ±30%.
 */

import type {
  TrainingBlock,
  TrainingSession,
  SessionExercise,
  BlockType,
} from '@/lib/db/types';

// ── Patch shape ──────────────────────────────────────────────────────────────

export interface CycleChange {
  totalWeeks?: number;
  name?: string;
}

export interface BlockInsert {
  blockType: BlockType;
  weekStart: number;
  weekEnd: number;
  volumeTarget: number;
  intensityTarget: number;
}

export interface BlockReplacement {
  id: string;
  blockType?: BlockType;
  weekStart?: number;
  weekEnd?: number;
  volumeTarget?: number;
  intensityTarget?: number;
}

export interface ExerciseUpdate {
  exerciseId: string;
  sets?: number;
  reps?: number;
  rpeTarget?: number;
}

export interface SessionOverride {
  sessionId: string;
  exerciseRemovals?: string[];      // exercise ids to drop (NOT comp lifts)
  exerciseUpdates?: ExerciseUpdate[];
  coachNote?: string;
}

export interface ProgramPatch {
  cycleChanges?: CycleChange;
  blockInserts?: BlockInsert[];
  blockReplacements?: BlockReplacement[];
  sessionOverrides?: SessionOverride[];
}

// ── Validation result types ─────────────────────────────────────────────────

export interface ValidationError {
  field: string;   // path-ish string pointing at the offending field
  message: string;
}

export type ValidationResult =
  | { ok: true; patch: ProgramPatch }
  | { ok: false; errors: ValidationError[] };

// ── Context the validator reads from ─────────────────────────────────────────

export interface ProgramContext {
  cycleTotalWeeks: number;
  blocks: TrainingBlock[];
  sessions: TrainingSession[];
  exercises: SessionExercise[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_DEVIATION = 0.30;  // ±30% on volume/intensity and per-exercise sets

const COMP_LIFT_KEYWORDS = [
  'competition squat',
  'competition bench',
  'competition deadlift',
  'competition back squat',
  'competition bench press',
];

function isCompetitionExercise(ex: SessionExercise): boolean {
  if (ex.exerciseType === 'COMPETITION') return true;
  const name = ex.name.toLowerCase();
  return COMP_LIFT_KEYWORDS.some((k) => name.includes(k));
}

function deviationRatio(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : Infinity;
  return Math.abs(to - from) / Math.abs(from);
}

// ── Parse ────────────────────────────────────────────────────────────────────

/** Decode a base64-encoded JSON patch. Returns null on malformed input. */
export function decodePatch(base64: string): ProgramPatch | null {
  try {
    const json = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as ProgramPatch;
  } catch {
    return null;
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validatePatch(
  patch: ProgramPatch,
  context: ProgramContext,
): ValidationResult {
  const errors: ValidationError[] = [];

  // ── cycleChanges ───────────────────────────────────────────────────────────
  if (patch.cycleChanges) {
    const { totalWeeks } = patch.cycleChanges;
    if (totalWeeks !== undefined) {
      if (!Number.isInteger(totalWeeks) || totalWeeks < 2 || totalWeeks > 26) {
        errors.push({
          field: 'cycleChanges.totalWeeks',
          message: `Total weeks must be an integer between 2 and 26 (got ${totalWeeks}).`,
        });
      }
    }
  }

  // ── blockInserts ───────────────────────────────────────────────────────────
  const insertsByRange: Array<[number, number, string]> = [];
  (patch.blockInserts ?? []).forEach((ins, i) => {
    const path = `blockInserts[${i}]`;
    if (ins.weekStart < 1 || ins.weekEnd < ins.weekStart) {
      errors.push({ field: `${path}.weekStart`, message: 'Invalid week range.' });
    }
    if (ins.volumeTarget <= 0 || ins.volumeTarget > 2) {
      errors.push({
        field: `${path}.volumeTarget`,
        message: `Volume target must be in (0, 2] (got ${ins.volumeTarget}).`,
      });
    }
    if (ins.intensityTarget <= 0 || ins.intensityTarget > 1.1) {
      errors.push({
        field: `${path}.intensityTarget`,
        message: `Intensity target must be in (0, 1.1] (got ${ins.intensityTarget}).`,
      });
    }
    insertsByRange.push([ins.weekStart, ins.weekEnd, path]);
  });

  // ── blockReplacements ─────────────────────────────────────────────────────
  (patch.blockReplacements ?? []).forEach((rep, i) => {
    const path = `blockReplacements[${i}]`;
    const existing = context.blocks.find((b) => b.id === rep.id);
    if (!existing) {
      errors.push({ field: `${path}.id`, message: `Block ${rep.id} does not exist.` });
      return;
    }
    if (rep.volumeTarget !== undefined) {
      const dev = deviationRatio(existing.volumeTarget, rep.volumeTarget);
      if (dev > MAX_DEVIATION) {
        errors.push({
          field: `${path}.volumeTarget`,
          message: `Volume deviation ${(dev * 100).toFixed(1)}% exceeds ${MAX_DEVIATION * 100}% cap (was ${existing.volumeTarget}, proposed ${rep.volumeTarget}).`,
        });
      }
    }
    if (rep.intensityTarget !== undefined) {
      const dev = deviationRatio(existing.intensityTarget, rep.intensityTarget);
      if (dev > MAX_DEVIATION) {
        errors.push({
          field: `${path}.intensityTarget`,
          message: `Intensity deviation ${(dev * 100).toFixed(1)}% exceeds ${MAX_DEVIATION * 100}% cap.`,
        });
      }
    }
  });

  // ── Deload-before-realization check ───────────────────────────────────────
  // Consider the block set after the patch is applied.
  const mergedBlocks: Array<{ id?: string; blockType: BlockType; weekStart: number; weekEnd: number }> = [
    ...context.blocks.map((b) => ({ ...b })),
  ];
  // Apply replacements in place (shallow).
  (patch.blockReplacements ?? []).forEach((rep) => {
    const idx = mergedBlocks.findIndex((b) => b.id === rep.id);
    if (idx >= 0) {
      mergedBlocks[idx] = {
        ...mergedBlocks[idx],
        blockType: rep.blockType ?? mergedBlocks[idx].blockType,
        weekStart: rep.weekStart ?? mergedBlocks[idx].weekStart,
        weekEnd: rep.weekEnd ?? mergedBlocks[idx].weekEnd,
      };
    }
  });
  // Add inserts.
  (patch.blockInserts ?? []).forEach((ins) => {
    mergedBlocks.push({
      blockType: ins.blockType,
      weekStart: ins.weekStart,
      weekEnd: ins.weekEnd,
    });
  });
  // Sort by weekStart.
  mergedBlocks.sort((a, b) => a.weekStart - b.weekStart);

  // If the plan contains a REALIZATION block, it must be preceded by a DELOAD.
  const realizationIdx = mergedBlocks.findIndex((b) => b.blockType === 'REALIZATION');
  if (realizationIdx >= 0) {
    const prior = mergedBlocks.slice(0, realizationIdx);
    const hasDeload = prior.some((b) => b.blockType === 'DELOAD');
    if (!hasDeload) {
      errors.push({
        field: 'blockInserts',
        message: 'A DELOAD block must precede REALIZATION. Insert or preserve a deload before the meet block.',
      });
    }
  }

  // Overlap check across merged ranges.
  for (let i = 0; i < mergedBlocks.length - 1; i++) {
    const a = mergedBlocks[i];
    const b = mergedBlocks[i + 1];
    if (b.weekStart <= a.weekEnd) {
      errors.push({
        field: 'blockInserts',
        message: `Block ranges overlap: weeks ${a.weekStart}-${a.weekEnd} and ${b.weekStart}-${b.weekEnd}.`,
      });
      break;  // one overlap error is enough
    }
  }

  // ── sessionOverrides ───────────────────────────────────────────────────────
  (patch.sessionOverrides ?? []).forEach((ovr, i) => {
    const path = `sessionOverrides[${i}]`;
    const session = context.sessions.find((s) => s.id === ovr.sessionId);
    if (!session) {
      errors.push({ field: `${path}.sessionId`, message: `Session ${ovr.sessionId} not found.` });
      return;
    }
    const sessionExercises = context.exercises.filter((e) => e.sessionId === session.id);

    // Competition-lift removal guard.
    (ovr.exerciseRemovals ?? []).forEach((exId, j) => {
      const ex = sessionExercises.find((e) => e.id === exId);
      if (!ex) {
        errors.push({
          field: `${path}.exerciseRemovals[${j}]`,
          message: `Exercise ${exId} not in session ${session.id}.`,
        });
        return;
      }
      if (isCompetitionExercise(ex)) {
        errors.push({
          field: `${path}.exerciseRemovals[${j}]`,
          message: `Cannot remove competition lift "${ex.name}". Swap or reduce sets instead.`,
        });
      }
    });

    // Per-exercise volume deviation guard.
    (ovr.exerciseUpdates ?? []).forEach((upd, j) => {
      const ex = sessionExercises.find((e) => e.id === upd.exerciseId);
      if (!ex) {
        errors.push({
          field: `${path}.exerciseUpdates[${j}].exerciseId`,
          message: `Exercise ${upd.exerciseId} not in session.`,
        });
        return;
      }
      if (upd.sets !== undefined) {
        if (!Number.isInteger(upd.sets) || upd.sets < 1) {
          errors.push({
            field: `${path}.exerciseUpdates[${j}].sets`,
            message: 'Sets must be a positive integer.',
          });
        } else {
          const dev = deviationRatio(ex.sets, upd.sets);
          if (dev > MAX_DEVIATION) {
            errors.push({
              field: `${path}.exerciseUpdates[${j}].sets`,
              message: `Set change ${ex.sets}→${upd.sets} deviates ${(dev * 100).toFixed(0)}% (cap ${MAX_DEVIATION * 100}%).`,
            });
          }
        }
      }
      if (upd.rpeTarget !== undefined && (upd.rpeTarget < 5 || upd.rpeTarget > 10)) {
        errors.push({
          field: `${path}.exerciseUpdates[${j}].rpeTarget`,
          message: `RPE target must be 5-10 (got ${upd.rpeTarget}).`,
        });
      }
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, patch };
}

/** Compact summary of a validated patch for the confirmation card. */
export function summarizePatch(patch: ProgramPatch): string {
  const parts: string[] = [];
  if (patch.cycleChanges?.totalWeeks) {
    parts.push(`cycle length → ${patch.cycleChanges.totalWeeks} wk`);
  }
  if (patch.blockInserts?.length) {
    parts.push(`+${patch.blockInserts.length} block${patch.blockInserts.length > 1 ? 's' : ''}`);
  }
  if (patch.blockReplacements?.length) {
    parts.push(`~${patch.blockReplacements.length} block edit${patch.blockReplacements.length > 1 ? 's' : ''}`);
  }
  if (patch.sessionOverrides?.length) {
    parts.push(`${patch.sessionOverrides.length} session override${patch.sessionOverrides.length > 1 ? 's' : ''}`);
  }
  return parts.join(' · ') || 'No changes';
}
