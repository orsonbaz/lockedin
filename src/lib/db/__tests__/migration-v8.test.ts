import { describe, it, expect } from 'vitest';
import { guessRegionsFromText } from '../database';
import { buildCalibrationInjuries, ATHLETE_CALIBRATION_IDS } from '../seed';

describe('guessRegionsFromText (v8 injury migration heuristic)', () => {
  it('detects a single sided joint', () => {
    expect(guessRegionsFromText('Left knee meniscus pain on deep squat'))
      .toContain('LEFT_KNEE');
    expect(guessRegionsFromText('Right shoulder impingement on overhead press'))
      .toContain('RIGHT_SHOULDER');
  });

  it('defaults unspecified sides to LEFT_*', () => {
    // We intentionally bias toward over-tagging — better to gate too many
    // patterns than miss the affected joint.
    const regions = guessRegionsFromText('Shoulder tendinopathy from bench');
    expect(regions).toContain('LEFT_SHOULDER');
  });

  it('detects spinal regions distinctly', () => {
    expect(guessRegionsFromText('Lower back tweak after deadlift'))
      .toContain('L_SPINE');
    expect(guessRegionsFromText('Upper back tightness; thoracic mobility limited'))
      .toContain('T_SPINE');
    expect(guessRegionsFromText('SI joint irritation'))
      .toContain('SI_JOINT');
  });

  it('tags multiple regions when text mentions several', () => {
    const regions = guessRegionsFromText('Left knee and right hip cranky after long runs');
    expect(regions).toContain('LEFT_KNEE');
    expect(regions).toContain('RIGHT_HIP');
  });

  it('falls back to OTHER when no region keywords match', () => {
    expect(guessRegionsFromText('Generic tiredness, no specific complaint'))
      .toEqual(['OTHER']);
  });

  it('handles common phrasing variants', () => {
    expect(guessRegionsFromText('t-spine stiffness')).toContain('T_SPINE');
    expect(guessRegionsFromText('cervical pain')).toContain('CERVICAL_SPINE');
    expect(guessRegionsFromText('pelvic floor concerns')).toContain('PELVIC_FLOOR');
  });
});

describe('buildCalibrationInjuries — athlete-specific MANAGING injuries', () => {
  it('returns exactly three deterministic rows', () => {
    const rows = buildCalibrationInjuries();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id).sort()).toEqual([...ATHLETE_CALIBRATION_IDS].sort());
  });

  it('every row is MANAGING and references the calibration note', () => {
    for (const row of buildCalibrationInjuries()) {
      expect(row.status).toBe('MANAGING');
      expect(row.notes).toContain('calibration');
    }
  });

  it('left pec row targets LEFT_SHOULDER and prefers pulling patterns', () => {
    const row = buildCalibrationInjuries().find((r) => r.id === 'calib_left_pec_tendinopathy')!;
    expect(row.regions).toContain('LEFT_SHOULDER');
    expect(row.preferredPatterns).toContain('VERTICAL_PULL');
    expect(row.preferredPatterns).toContain('HORIZONTAL_PULL');
  });

  it('hip flexor row targets LEFT_HIP and prefers single-leg / squat patterns', () => {
    const row = buildCalibrationInjuries().find((r) => r.id === 'calib_left_hip_flexor_quad_tightness')!;
    expect(row.regions).toContain('LEFT_HIP');
    expect(row.preferredPatterns).toContain('SINGLE_LEG');
    expect(row.preferredPatterns).toContain('SQUAT');
  });

  it('left glute row targets LEFT_HIP/LEFT_KNEE and prefers HINGE/SINGLE_LEG', () => {
    const row = buildCalibrationInjuries().find((r) => r.id === 'calib_left_glute_drive_deficit')!;
    expect(row.regions).toContain('LEFT_HIP');
    expect(row.regions).toContain('LEFT_KNEE');
    expect(row.preferredPatterns).toContain('HINGE');
    expect(row.preferredPatterns).toContain('SINGLE_LEG');
  });

  it('IDs are stable for idempotent seeding', () => {
    const a = buildCalibrationInjuries().map((r) => r.id);
    const b = buildCalibrationInjuries().map((r) => r.id);
    expect(a).toEqual(b);
  });
});
