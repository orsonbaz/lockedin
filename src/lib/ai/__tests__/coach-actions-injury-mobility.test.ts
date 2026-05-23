import { describe, it, expect } from 'vitest';
import { parseActions } from '../coach-actions';

describe('parseActions — injury actions (v8)', () => {
  describe('ADD_INJURY', () => {
    it('parses a full ADD_INJURY tag', () => {
      const { actions } = parseActions(
        '[ACTION:ADD_INJURY|label=Left rotator cuff tendinopathy|regions=LEFT_SHOULDER|' +
        'status=MANAGING|severity=3|constraints=NO_OVERHEAD,TEMPO_ONLY|' +
        'contraindicated_patterns=VERTICAL_PUSH|notes=Started 3 weeks ago]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('ADD_INJURY');
      expect(actions[0].params.label).toBe('Left rotator cuff tendinopathy');
      expect(actions[0].displayText).toMatch(/rotator cuff/);
      expect(actions[0].displayText.toLowerCase()).toContain('shoulder');
    });

    it('rejects ADD_INJURY missing label or regions', () => {
      expect(parseActions('[ACTION:ADD_INJURY|regions=LEFT_KNEE]').actions).toHaveLength(0);
      expect(parseActions('[ACTION:ADD_INJURY|label=Knee]').actions).toHaveLength(0);
      expect(parseActions('[ACTION:ADD_INJURY|label=Knee|regions=FAKE_REGION]').actions).toHaveLength(0);
    });

    it('clamps severity to 1-5', () => {
      const high = parseActions('[ACTION:ADD_INJURY|label=X|regions=LEFT_KNEE|severity=99]');
      expect(high.actions).toHaveLength(1);
      expect(high.actions[0].displayText).toMatch(/severity 5/);
      const low = parseActions('[ACTION:ADD_INJURY|label=X|regions=LEFT_KNEE|severity=-3]');
      expect(low.actions).toHaveLength(1);
      expect(low.actions[0].displayText).toMatch(/severity 1/);
    });

    it('defaults status to MANAGING when invalid', () => {
      const { actions } = parseActions(
        '[ACTION:ADD_INJURY|label=X|regions=LEFT_KNEE|status=NONSENSE]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText.toLowerCase()).toContain('managing');
    });
  });

  describe('UPDATE_INJURY_STATUS', () => {
    it('parses a valid status update', () => {
      const { actions } = parseActions(
        '[ACTION:UPDATE_INJURY_STATUS|id=abc123|status=REHAB]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText.toLowerCase()).toContain('rehab');
    });

    it('rejects unknown statuses', () => {
      expect(parseActions('[ACTION:UPDATE_INJURY_STATUS|id=abc|status=BOGUS]').actions).toHaveLength(0);
    });

    it('rejects missing id', () => {
      expect(parseActions('[ACTION:UPDATE_INJURY_STATUS|status=REHAB]').actions).toHaveLength(0);
    });
  });

  describe('LOG_SYMPTOM', () => {
    it('parses a valid symptom log', () => {
      const { actions } = parseActions(
        '[ACTION:LOG_SYMPTOM|injury_id=abc|pain_at_rest=2|pain_under_load=5|stiffness=2|irritability=MED]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText).toMatch(/rest 2\/10/);
      expect(actions[0].displayText).toMatch(/load 5\/10/);
    });

    it('rejects out-of-range pain values', () => {
      expect(parseActions(
        '[ACTION:LOG_SYMPTOM|injury_id=abc|pain_at_rest=20|pain_under_load=5]',
      ).actions).toHaveLength(0);
    });

    it('defaults irritability to MED when invalid', () => {
      const { actions } = parseActions(
        '[ACTION:LOG_SYMPTOM|injury_id=abc|pain_at_rest=3|pain_under_load=4|irritability=BOGUS]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText.toLowerCase()).toContain('med');
    });
  });
});

describe('parseActions — mobility actions (v8)', () => {
  describe('GENERATE_MOBILITY_FLOW', () => {
    it('parses a valid generate request', () => {
      const { actions } = parseActions(
        '[ACTION:GENERATE_MOBILITY_FLOW|focus=PRE_SQUAT|minutes=8]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText).toMatch(/8-min/);
      expect(actions[0].displayText.toLowerCase()).toContain('pre squat');
    });

    it('falls back to CUSTOM for unknown focuses', () => {
      const { actions } = parseActions(
        '[ACTION:GENERATE_MOBILITY_FLOW|focus=NONSENSE|minutes=10]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText.toLowerCase()).toContain('custom');
    });

    it('clamps minutes to a reasonable range', () => {
      const tiny = parseActions('[ACTION:GENERATE_MOBILITY_FLOW|focus=AM_RESET|minutes=0]');
      expect(tiny.actions).toHaveLength(1);
      const huge = parseActions('[ACTION:GENERATE_MOBILITY_FLOW|focus=AM_RESET|minutes=300]');
      expect(huge.actions).toHaveLength(1);
      expect(huge.actions[0].displayText).toMatch(/60-min/);
    });
  });

  describe('START_MOBILITY_FLOW', () => {
    it('parses with a routine_id', () => {
      const { actions } = parseActions(
        '[ACTION:START_MOBILITY_FLOW|routine_id=am_reset_12min]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText).toContain('am_reset_12min');
    });

    it('rejects missing id', () => {
      expect(parseActions('[ACTION:START_MOBILITY_FLOW]').actions).toHaveLength(0);
    });
  });

  describe('LOG_ROM', () => {
    it('parses a valid ROM rating', () => {
      const { actions } = parseActions(
        '[ACTION:LOG_ROM|movement_id=cars_shoulder|rating=70]',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText).toMatch(/70\/100/);
      // Should resolve the movement name from the library
      expect(actions[0].displayText.toLowerCase()).toContain('shoulder');
    });

    it('rejects ratings outside 0-100', () => {
      expect(parseActions('[ACTION:LOG_ROM|movement_id=cars_shoulder|rating=150]').actions).toHaveLength(0);
      expect(parseActions('[ACTION:LOG_ROM|movement_id=cars_shoulder|rating=-5]').actions).toHaveLength(0);
    });

    it('rejects missing movement_id', () => {
      expect(parseActions('[ACTION:LOG_ROM|rating=70]').actions).toHaveLength(0);
    });
  });
});
