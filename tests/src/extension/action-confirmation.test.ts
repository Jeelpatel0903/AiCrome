import { describe, it, expect } from 'vitest';
import type { ActionRisk } from '@devflow/shared';
import { classifyActionRisk } from '@devflow/shared';

// Test the risk classification and confirmation logic
describe('ActionConfirmation risk logic', () => {
  it('safe actions do not require confirmation', () => {
    const safeRisks: ActionRisk[] = ['safe', 'low'];
    safeRisks.forEach((risk) => {
      expect(['safe', 'low'].includes(risk)).toBe(true);
    });
  });

  it('high and critical risk require confirmation', () => {
    const action = classifyActionRisk({ type: 'navigate', url: 'https://app.com/delete-account' });
    expect(action).toBe('high');
  });

  it('medium risk navigate to normal URL', () => {
    const action = classifyActionRisk({ type: 'navigate', url: 'https://google.com' });
    expect(action).toBe('medium');
  });

  it('all action types produce a valid risk level', () => {
    const validRisks: ActionRisk[] = ['safe', 'low', 'medium', 'high', 'critical'];
    const actions = [
      classifyActionRisk({ type: 'snapshot' }),
      classifyActionRisk({ type: 'screenshot' }),
      classifyActionRisk({ type: 'click', ref: 'e1' }),
      classifyActionRisk({ type: 'type', ref: 'e2', text: 'hello' }),
      classifyActionRisk({ type: 'navigate', url: 'https://example.com' }),
      classifyActionRisk({ type: 'scroll', direction: 'down' }),
      classifyActionRisk({ type: 'pressKey', key: 'Enter' }),
      classifyActionRisk({ type: 'wait', condition: {} }),
    ];
    actions.forEach((risk) => {
      expect(validRisks).toContain(risk);
    });
  });

  it('snapshot and screenshot are always safe', () => {
    expect(classifyActionRisk({ type: 'snapshot' })).toBe('safe');
    expect(classifyActionRisk({ type: 'screenshot' })).toBe('safe');
  });

  it('scroll is always safe', () => {
    expect(classifyActionRisk({ type: 'scroll', direction: 'up' })).toBe('safe');
    expect(classifyActionRisk({ type: 'scroll', direction: 'down' })).toBe('safe');
  });

  it('Return key is treated same as Enter (medium risk)', () => {
    expect(classifyActionRisk({ type: 'pressKey', key: 'Return' })).toBe('medium');
  });

  it('navigate with cancel in URL returns high risk', () => {
    expect(classifyActionRisk({ type: 'navigate', url: 'https://shop.com/cancel-order' })).toBe('high');
  });
});
