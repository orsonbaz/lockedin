import { describe, it, expect } from 'vitest';
import { guessRegionsFromText } from '../database';

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
