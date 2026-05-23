import { describe, it, expect } from 'vitest';
import {
  generateRoutine,
  estimateRoutineMinutes,
  estimateMovementSeconds,
} from '../routine-generator';
import { MOBILITY_LIBRARY, MOBILITY_BY_ID } from '../index';
import type { Injury } from '@/lib/db/types';

const nowIso = '2026-01-01T00:00:00.000Z';

function makeInjury(overrides: Partial<Injury>): Injury {
  return {
    id: 'inj1',
    label: 'Test injury',
    regions: ['LEFT_KNEE'],
    status: 'ACUTE',
    severity: 4,
    onsetDate: '2026-01-01',
    contraindicatedPatterns: [],
    contraindicatedSwapGroups: [],
    preferredPatterns: [],
    constraints: ['PAIN_FREE_RANGE_ONLY'],
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

describe('estimateMovementSeconds', () => {
  it('doubles duration for unilateral movements', () => {
    const car = MOBILITY_BY_ID.get('cars_shoulder')!;
    // 90 sec base × 2 sides + 15 setup = 195
    expect(estimateMovementSeconds(car)).toBe(195);
  });

  it('scales reps at ~3 sec per rep', () => {
    const dead = MOBILITY_BY_ID.get('dead_bug')!;
    // 16 reps × 3 + 15 setup = 63
    expect(estimateMovementSeconds(dead)).toBe(63);
  });
});

describe('generateRoutine', () => {
  it('respects the minute budget within ±1 minute', () => {
    const result = generateRoutine({ focus: 'AM_RESET', minutes: 10 });
    const est = estimateRoutineMinutes(result.movements);
    expect(est).toBeLessThanOrEqual(11);
    expect(result.movements.length).toBeGreaterThan(0);
  });

  it('produces deterministic output for the same inputs', () => {
    const a = generateRoutine({ focus: 'PRE_SQUAT', minutes: 6 });
    const b = generateRoutine({ focus: 'PRE_SQUAT', minutes: 6 });
    expect(a.movementIds).toEqual(b.movementIds);
  });

  it('AM_RESET leads with CARs', () => {
    const result = generateRoutine({ focus: 'AM_RESET', minutes: 12 });
    const first = MOBILITY_BY_ID.get(result.movementIds[0])!;
    expect(first.category).toBe('CARS');
  });

  it('PRE_SQUAT picks ankle and hip work', () => {
    const result = generateRoutine({ focus: 'PRE_SQUAT', minutes: 8 });
    const categories = result.movements.map((m) => m.category);
    expect(categories).toContain('ANKLE');
    expect(categories).toContain('HIP_OPENER');
  });

  it('PRE_PRESS picks shoulder ROM work', () => {
    const result = generateRoutine({ focus: 'PRE_PRESS', minutes: 6 });
    expect(result.movements.some((m) => m.category === 'SHOULDER_ROM')).toBe(true);
  });

  it('filters movements touching contraindicated regions on ACUTE high-severity injuries', () => {
    const injury = makeInjury({
      regions: ['LEFT_KNEE'],
      status: 'ACUTE',
      severity: 4,
      constraints: ['PAIN_FREE_RANGE_ONLY'],
    });
    const result = generateRoutine({
      focus: 'AM_RESET',
      minutes: 12,
      injuries: [injury],
    });
    for (const m of result.movements) {
      expect(m.regions).not.toContain('LEFT_KNEE');
    }
  });

  it('does NOT filter when the injury is CHRONIC or low-severity', () => {
    const injury = makeInjury({
      status: 'CHRONIC',
      severity: 2,
      constraints: [],
    });
    const knee = generateRoutine({
      focus: 'AM_RESET',
      minutes: 12,
      injuries: [injury],
    });
    const baseline = generateRoutine({
      focus: 'AM_RESET',
      minutes: 12,
    });
    expect(knee.movementIds).toEqual(baseline.movementIds);
  });

  it('biases toward weak regions when filling extra time', () => {
    const targetedRegion: Injury['regions'][number] = 'LEFT_HIP';
    const result = generateRoutine({
      focus: 'CUSTOM',
      minutes: 20,
      weakRegions: [targetedRegion],
    });
    // At least one picked movement should touch the weak region.
    const hits = result.movements.filter((m) => m.regions.includes(targetedRegion));
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('always picks at least one movement, even with a tiny budget', () => {
    const result = generateRoutine({ focus: 'AM_RESET', minutes: 2 });
    expect(result.movements.length).toBeGreaterThanOrEqual(1);
  });

  it('honors explicit seedMovementIds at the front of the routine', () => {
    const result = generateRoutine({
      focus: 'CUSTOM',
      minutes: 15,
      seedMovementIds: ['box_breathing'],
    });
    expect(result.movementIds[0]).toBe('box_breathing');
  });

  it('rationale describes injury filtering when injuries are active', () => {
    const injury = makeInjury({ status: 'ACUTE' });
    const result = generateRoutine({
      focus: 'AM_RESET',
      minutes: 10,
      injuries: [injury],
    });
    expect(result.rationale).toMatch(/injury/i);
  });
});

describe('Library invariants', () => {
  it('every movement id is unique', () => {
    const ids = MOBILITY_LIBRARY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every movement specifies at least one region', () => {
    for (const m of MOBILITY_LIBRARY) {
      expect(m.regions.length).toBeGreaterThan(0);
    }
  });

  it('every movement specifies a non-empty cue', () => {
    for (const m of MOBILITY_LIBRARY) {
      expect(m.cueShort.length).toBeGreaterThan(20);
    }
  });
});
