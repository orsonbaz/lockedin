import { describe, it, expect } from 'vitest';
import { parseActions } from '../coach-actions';

describe('parseActions', () => {
  it('parses UPDATE_MAX action', () => {
    const text = 'Your squat has improved. [ACTION:UPDATE_MAX|lift=squat|value=190] Let me know.';
    const { cleanText, actions } = parseActions(text);
    expect(cleanText).toBe('Your squat has improved.  Let me know.');
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('UPDATE_MAX');
    expect(actions[0].params.lift).toBe('squat');
    expect(actions[0].params.value).toBe('190');
    expect(actions[0].displayText).toContain('squat');
    expect(actions[0].displayText).toContain('190');
  });

  it('parses SWAP_EXERCISE action', () => {
    const text = 'Try this swap: [ACTION:SWAP_EXERCISE|from=Romanian Deadlift|to=Good Morning]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('SWAP_EXERCISE');
    expect(actions[0].params.from).toBe('Romanian Deadlift');
    expect(actions[0].params.to).toBe('Good Morning');
  });

  it('parses ADD_EXERCISE action', () => {
    const text = '[ACTION:ADD_EXERCISE|name=Face Pulls|sets=3|reps=15|rpe=7]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('ADD_EXERCISE');
    expect(actions[0].params.name).toBe('Face Pulls');
    expect(actions[0].params.sets).toBe('3');
    expect(actions[0].params.reps).toBe('15');
  });

  it('parses REMOVE_EXERCISE action', () => {
    const text = 'Drop the lat work today. [ACTION:REMOVE_EXERCISE|name=Lat Pulldown]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('REMOVE_EXERCISE');
    expect(actions[0].params.name).toBe('Lat Pulldown');
  });

  it('parses UPDATE_REPS action', () => {
    const text = '[ACTION:UPDATE_REPS|name=Competition Back Squat|sets=4|reps=3]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('UPDATE_REPS');
    expect(actions[0].displayText).toContain('4');
    expect(actions[0].displayText).toContain('3');
  });

  it('parses SET_RPE_TARGET action', () => {
    const text = '[ACTION:SET_RPE_TARGET|name=Bench Press|rpe=7.5]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('SET_RPE_TARGET');
    expect(actions[0].params.rpe).toBe('7.5');
  });

  it('parses MODIFY_SESSION action', () => {
    const text = '[ACTION:MODIFY_SESSION|rpe_offset=-1|volume_mult=0.7|modification=Recovery session due to low readiness]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('MODIFY_SESSION');
    expect(actions[0].params.rpe_offset).toBe('-1');
    expect(actions[0].params.volume_mult).toBe('0.7');
  });

  it('parses SKIP_SESSION action', () => {
    const text = 'Take a rest day. [ACTION:SKIP_SESSION]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('SKIP_SESSION');
    expect(actions[0].displayText).toContain('Skip');
  });

  it('parses multiple actions', () => {
    const text = 'Two changes: [ACTION:SET_RPE_TARGET|name=Squat|rpe=7] and [ACTION:REMOVE_EXERCISE|name=Curls]';
    const { cleanText, actions } = parseActions(text);
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('SET_RPE_TARGET');
    expect(actions[1].type).toBe('REMOVE_EXERCISE');
    expect(cleanText).toBe('Two changes:  and');
  });

  it('returns empty actions when no tags present', () => {
    const text = 'Just a normal response about nutrition.';
    const { cleanText, actions } = parseActions(text);
    expect(actions).toHaveLength(0);
    expect(cleanText).toBe(text);
  });

  it('handles invalid action type gracefully', () => {
    const text = 'Bad action [ACTION:INVALID_TYPE|foo=bar]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(0);
  });

  it('handles action with missing required params', () => {
    const text = '[ACTION:UPDATE_MAX|lift=squat]'; // missing value
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(0);
  });

  it('handles action with no params', () => {
    const text = '[ACTION:SKIP_SESSION]';
    const { actions } = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('SKIP_SESSION');
  });
});
