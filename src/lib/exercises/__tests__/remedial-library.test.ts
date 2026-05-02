import { describe, it, expect } from 'vitest';
import {
  REMEDIAL_LIBRARY,
  remediesFor,
  complaintFromText,
  complaintsFromText,
  renderRemedy,
} from '../remedial-library';

describe('remedial-library — complaint detection', () => {
  it('maps "tight hip flexors" to tight_hip_flexors', () => {
    expect(complaintFromText('I have tight hip flexors')).toBe('tight_hip_flexors');
    expect(complaintFromText('my psoas is super tight')).toBe('tight_hip_flexors');
  });

  it('maps tendon complaints', () => {
    expect(complaintFromText('jumpers knee')).toBe('patellar_tendinopathy');
    expect(complaintFromText('achilles is sore')).toBe('achilles_tendinopathy');
    expect(complaintFromText('tennis elbow flaring up')).toBe('lateral_epicondylitis');
  });

  it('maps shoulder + back patterns', () => {
    expect(complaintFromText('shoulder impingement on bench')).toBe('shoulder_impingement');
    expect(complaintFromText('lower back pain after deadlift')).toBe('low_back_pain_acute');
    expect(complaintFromText('lower back stiff when squatting')).toBe('low_back_stiffness');
  });

  it('returns null for unrelated text', () => {
    expect(complaintFromText('how should I peak for my meet')).toBeNull();
  });

  it('extracts multiple complaints from one message', () => {
    const out = complaintsFromText('tight hip flexors and lower back pain');
    expect(out).toContain('tight_hip_flexors');
    expect(out).toContain('low_back_pain_acute');
  });
});

describe('remedial-library — Rx selection', () => {
  it('returns multiple exercises for tight hip flexors, ordered by evidence', () => {
    const rx = remediesFor('tight_hip_flexors');
    expect(rx.length).toBeGreaterThanOrEqual(3);
    // First entry must NOT be the static stretch — modern Rx leads with strengthening / stabilising
    expect(rx[0].mechanism).not.toBe('STRETCH');
    // Couch stretch (the historical default) must NOT come ahead of dead bug or band hip flexion
    const stretchIdx = rx.findIndex((e) => e.id === 'couch_stretch');
    const deadbugIdx = rx.findIndex((e) => e.id === 'kettlebell_dead_bug');
    if (stretchIdx >= 0 && deadbugIdx >= 0) {
      expect(deadbugIdx).toBeLessThan(stretchIdx);
    }
  });

  it('tendinopathy complaints lead with isometric or HSR, never plain stretch', () => {
    const patellar = remediesFor('patellar_tendinopathy');
    const achilles = remediesFor('achilles_tendinopathy');
    expect(patellar.length).toBeGreaterThan(0);
    expect(achilles.length).toBeGreaterThan(0);
    expect(patellar[0].mechanism === 'ISOMETRIC' || patellar[0].mechanism === 'HEAVY_SLOW').toBe(true);
    expect(achilles[0].mechanism).toBe('HEAVY_SLOW');
    expect(patellar.every((e) => e.mechanism !== 'STRETCH')).toBe(true);
  });

  it('shoulder impingement Rx leads with face pull / lower trap activation, not stretch', () => {
    const rx = remediesFor('shoulder_impingement');
    expect(rx.length).toBeGreaterThan(0);
    expect(rx[0].mechanism === 'STRENGTHEN' || rx[0].mechanism === 'ACTIVATE').toBe(true);
  });

  it('every entry has at least one of reps or holdSeconds', () => {
    for (const ex of REMEDIAL_LIBRARY) {
      const hasDose = ex.dosing.reps !== undefined || ex.dosing.holdSeconds !== undefined;
      expect(hasDose).toBe(true);
    }
  });

  it('every entry has cues + a rationale', () => {
    for (const ex of REMEDIAL_LIBRARY) {
      expect(ex.cues.length).toBeGreaterThan(0);
      expect(ex.rationale.length).toBeGreaterThan(20);
    }
  });
});

describe('remedial-library — renderRemedy', () => {
  it('formats a 3-line block with name, dose, and rationale', () => {
    const ex = REMEDIAL_LIBRARY.find((e) => e.id === 'kettlebell_dead_bug')!;
    const out = renderRemedy(ex);
    const lines = out.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('Loaded Dead Bug');
    expect(lines[0]).toContain('STABILIZE');
    expect(lines[1]).toContain('Dose:');
    expect(lines[2]).toContain('Why:');
  });
});
