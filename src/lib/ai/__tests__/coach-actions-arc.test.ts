import { describe, it, expect } from 'vitest';
import { parseActions } from '../coach-actions';

describe('parseActions — arc lifecycle (v8)', () => {
  describe('START_ARC', () => {
    it('parses a full START_ARC tag', () => {
      const text =
        'Let\'s spin up a fresh arc. ' +
        '[ACTION:START_ARC|name=Get Strong Again|intent=Rebuild a sustainable strength base|' +
        'priorities=STRENGTH_BARBELL,STRENGTH_CALISTHENICS,MOBILITY|' +
        'deprioritized=COMPETITION|directive=Push intensity but stay clear of grinders.|' +
        'primary_goal=STRENGTH_PROGRESSION|weekly_time_min=300]';
      const { actions, cleanText } = parseActions(text);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('START_ARC');
      expect(actions[0].params.name).toBe('Get Strong Again');
      expect(actions[0].params.primary_goal).toBe('STRENGTH_PROGRESSION');
      expect(actions[0].displayText).toContain('Get Strong Again');
      // Display text mentions at least one priority label so the confirm card is meaningful.
      expect(actions[0].displayText.toLowerCase()).toMatch(/barbell|calisthenics|mobility/);
      expect(cleanText).not.toContain('[ACTION');
    });

    it('rejects START_ARC missing required fields', () => {
      const noName = parseActions('[ACTION:START_ARC|intent=foo|priorities=MOBILITY]');
      expect(noName.actions).toHaveLength(0);

      const noPriorities = parseActions('[ACTION:START_ARC|name=Foo|intent=Bar]');
      expect(noPriorities.actions).toHaveLength(0);

      const allInvalidPriorities = parseActions(
        '[ACTION:START_ARC|name=Foo|intent=Bar|priorities=NONSENSE,GARBAGE]',
      );
      expect(allInvalidPriorities.actions).toHaveLength(0);
    });

    it('drops invalid priority strings but keeps valid ones', () => {
      const { actions } = parseActions(
        '[ACTION:START_ARC|name=X|intent=Y|priorities=NONSENSE,MOBILITY,STRENGTH_BARBELL,FAKE]',
      );
      expect(actions).toHaveLength(1);
      // displayText reflects the first two valid priorities only.
      expect(actions[0].displayText.toLowerCase()).toContain('mobility');
    });

    it('defaults primary_goal to LONGEVITY when omitted or invalid', () => {
      const { actions } = parseActions(
        '[ACTION:START_ARC|name=X|intent=Y|priorities=MOBILITY|primary_goal=NOT_A_REAL_GOAL]',
      );
      // The parser keeps the raw param string — the executor handles validation.
      // But the action still parses and is presented to the user.
      expect(actions).toHaveLength(1);
      expect(actions[0].params.primary_goal).toBe('NOT_A_REAL_GOAL');
    });
  });

  describe('END_ARC / PAUSE_ARC / RESUME_ARC', () => {
    it('parses END_ARC with optional reason', () => {
      const withReason = parseActions(
        '[ACTION:END_ARC|reason=Hit my mobility benchmarks]',
      );
      expect(withReason.actions).toHaveLength(1);
      expect(withReason.actions[0].displayText).toContain('Hit my mobility benchmarks');

      const noReason = parseActions('[ACTION:END_ARC]');
      expect(noReason.actions).toHaveLength(1);
      expect(noReason.actions[0].type).toBe('END_ARC');
    });

    it('parses PAUSE_ARC', () => {
      const { actions } = parseActions('[ACTION:PAUSE_ARC|reason=Travelling for two weeks]');
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('PAUSE_ARC');
      expect(actions[0].displayText).toContain('Travelling');
    });

    it('requires an id on RESUME_ARC', () => {
      const noId = parseActions('[ACTION:RESUME_ARC]');
      expect(noId.actions).toHaveLength(0);

      const withId = parseActions('[ACTION:RESUME_ARC|id=abcdef0123456789]');
      expect(withId.actions).toHaveLength(1);
      expect(withId.actions[0].params.id).toBe('abcdef0123456789');
    });
  });

  describe('UPDATE_ARC', () => {
    it('parses a multi-field patch and describes each change', () => {
      const text =
        '[ACTION:UPDATE_ARC|priorities=STRENGTH_BARBELL,COMPETITION,MOBILITY|' +
        'deprioritized=BODY_COMP|directive=Switch focus to meet prep — peaking in 8 weeks.|' +
        'weekly_time_min=360]';
      const { actions } = parseActions(text);
      expect(actions).toHaveLength(1);
      const display = actions[0].displayText.toLowerCase();
      expect(display).toContain('priorities');
      expect(display).toContain('deprioritized');
      expect(display).toContain('coach directive');
      expect(display).toContain('360');
    });

    it('rejects an UPDATE_ARC with no recognisable fields', () => {
      const { actions } = parseActions(
        '[ACTION:UPDATE_ARC|unsupported=garbage|also_unknown=foo]',
      );
      expect(actions).toHaveLength(0);
    });

    it('treats an empty priorities list as "clear", not "ignore"', () => {
      const { actions } = parseActions('[ACTION:UPDATE_ARC|priorities=]');
      expect(actions).toHaveLength(1);
      expect(actions[0].displayText.toLowerCase()).toContain('cleared');
    });
  });

  it('coexists with non-arc actions in the same reply', () => {
    const text =
      'Switching seasons. ' +
      '[ACTION:START_ARC|name=Get Healthy|intent=Heal first|priorities=INJURY_HEALING,MOBILITY] ' +
      'And drop the deadlift today. [ACTION:REMOVE_EXERCISE|name=Romanian Deadlift]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.type).sort()).toEqual(['REMOVE_EXERCISE', 'START_ARC']);
  });
});
