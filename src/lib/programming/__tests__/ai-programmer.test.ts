import { describe, it, expect } from 'vitest';
import {
  validatePatch,
  decodePatch,
  summarizePatch,
  type ProgramContext,
  type ProgramPatch,
} from '../ai-programmer';
import type {
  TrainingBlock,
  TrainingSession,
  SessionExercise,
} from '@/lib/db/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function block(
  id: string,
  overrides: Partial<TrainingBlock> = {},
): TrainingBlock {
  return {
    id,
    cycleId: 'cycle-1',
    blockType: 'ACCUMULATION',
    weekStart: 1,
    weekEnd: 4,
    volumeTarget: 1.0,
    intensityTarget: 0.75,
    ...overrides,
  };
}

function session(id: string, overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id,
    blockId: 'block-1',
    cycleId: 'cycle-1',
    scheduledDate: '2026-04-20',
    sessionType: 'ACCUMULATION',
    primaryLift: 'SQUAT',
    status: 'SCHEDULED',
    ...overrides,
  };
}

function exercise(
  id: string,
  sessionId: string,
  overrides: Partial<SessionExercise> = {},
): SessionExercise {
  return {
    id,
    sessionId,
    name: 'Competition Back Squat',
    exerciseType: 'COMPETITION',
    setStructure: 'STRAIGHT',
    sets: 3,
    reps: 5,
    rpeTarget: 8,
    estimatedLoadKg: 150,
    order: 1,
    ...overrides,
  };
}

function baseContext(): ProgramContext {
  return {
    cycleTotalWeeks: 12,
    blocks: [
      block('b1', { blockType: 'ACCUMULATION', weekStart: 1, weekEnd: 4 }),
      block('b2', { blockType: 'INTENSIFICATION', weekStart: 5, weekEnd: 8 }),
      block('b3', { blockType: 'DELOAD', weekStart: 9, weekEnd: 9, volumeTarget: 0.5, intensityTarget: 0.65 }),
      block('b4', { blockType: 'REALIZATION', weekStart: 10, weekEnd: 12, volumeTarget: 0.65, intensityTarget: 0.9 }),
    ],
    sessions: [session('s1')],
    exercises: [
      exercise('e1', 's1'),
      exercise('e2', 's1', {
        name: 'Bulgarian Split Squat',
        exerciseType: 'ACCESSORY',
        sets: 3,
        reps: 10,
        order: 2,
      }),
    ],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('validatePatch', () => {
  it('accepts an empty patch', () => {
    const result = validatePatch({}, baseContext());
    expect(result.ok).toBe(true);
  });

  it('rejects comp-lift removal', () => {
    const patch: ProgramPatch = {
      sessionOverrides: [
        { sessionId: 's1', exerciseRemovals: ['e1'] },
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toMatch(/competition lift/i);
    }
  });

  it('accepts accessory removal', () => {
    const patch: ProgramPatch = {
      sessionOverrides: [
        { sessionId: 's1', exerciseRemovals: ['e2'] },
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(true);
  });

  it('rejects volume deviation above 30%', () => {
    const patch: ProgramPatch = {
      blockReplacements: [
        { id: 'b1', volumeTarget: 1.5 },   // +50%
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field).toContain('volumeTarget');
    }
  });

  it('accepts volume deviation within 30%', () => {
    const patch: ProgramPatch = {
      blockReplacements: [
        { id: 'b1', volumeTarget: 1.15 },
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(true);
  });

  it('rejects realization-without-deload', () => {
    // Remove the DELOAD block from the cycle and request realization.
    const ctx = baseContext();
    ctx.blocks = ctx.blocks.filter((b) => b.blockType !== 'DELOAD');
    const result = validatePatch({}, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /deload/i.test(e.message))).toBe(true);
    }
  });

  it('rejects overlapping block inserts', () => {
    const patch: ProgramPatch = {
      blockInserts: [
        { blockType: 'ACCUMULATION', weekStart: 1, weekEnd: 6, volumeTarget: 1.0, intensityTarget: 0.75 },
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /overlap/i.test(e.message))).toBe(true);
    }
  });

  it('rejects sets-per-exercise deviation above 30%', () => {
    // 3 sets → 5 sets = +66%
    const patch: ProgramPatch = {
      sessionOverrides: [
        { sessionId: 's1', exerciseUpdates: [{ exerciseId: 'e1', sets: 5 }] },
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(false);
  });

  it('rejects RPE target out of range', () => {
    const patch: ProgramPatch = {
      sessionOverrides: [
        { sessionId: 's1', exerciseUpdates: [{ exerciseId: 'e1', rpeTarget: 12 }] },
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(false);
  });

  it('rejects unknown session or exercise ids', () => {
    const patch: ProgramPatch = {
      sessionOverrides: [
        { sessionId: 'unknown-session' },
      ],
    };
    const result = validatePatch(patch, baseContext());
    expect(result.ok).toBe(false);
  });
});

describe('decodePatch', () => {
  it('decodes a valid base64 JSON payload', () => {
    const patch: ProgramPatch = { cycleChanges: { totalWeeks: 10 } };
    const base64 = Buffer.from(JSON.stringify(patch), 'utf-8').toString('base64');
    const decoded = decodePatch(base64);
    expect(decoded).toEqual(patch);
  });

  it('returns null for malformed input', () => {
    expect(decodePatch('not-valid-base64!')).toBeNull();
    expect(decodePatch(Buffer.from('not json', 'utf-8').toString('base64'))).toBeNull();
  });
});

describe('summarizePatch', () => {
  it('describes a patch with multiple change types', () => {
    const s = summarizePatch({
      cycleChanges: { totalWeeks: 8 },
      blockInserts: [
        { blockType: 'DELOAD', weekStart: 4, weekEnd: 4, volumeTarget: 0.5, intensityTarget: 0.65 },
      ],
      sessionOverrides: [{ sessionId: 's1' }],
    });
    expect(s).toContain('8');
    expect(s).toContain('block');
    expect(s).toContain('session');
  });

  it('handles an empty patch', () => {
    expect(summarizePatch({})).toMatch(/no changes/i);
  });
});
