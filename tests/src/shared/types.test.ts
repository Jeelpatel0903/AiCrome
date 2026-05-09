import { describe, it, expect } from 'vitest';
import {
  classifyActionRisk,
  type BrowserAction,
  type ActionRisk,
} from '@devflow/shared';

describe('classifyActionRisk', () => {
  it('returns safe for snapshot action', () => {
    const action: BrowserAction = { type: 'snapshot' };
    expect(classifyActionRisk(action)).toBe('safe' satisfies ActionRisk);
  });

  it('returns safe for screenshot action', () => {
    const action: BrowserAction = { type: 'screenshot' };
    expect(classifyActionRisk(action)).toBe('safe');
  });

  it('returns safe for scroll action', () => {
    const action: BrowserAction = { type: 'scroll', direction: 'down' };
    expect(classifyActionRisk(action)).toBe('safe');
  });

  it('returns low for click action', () => {
    const action: BrowserAction = { type: 'click', ref: 'e1' };
    expect(classifyActionRisk(action)).toBe('low');
  });

  it('returns low for type action', () => {
    const action: BrowserAction = { type: 'type', ref: 'e2', text: 'hello' };
    expect(classifyActionRisk(action)).toBe('low');
  });

  it('returns low for select action', () => {
    const action: BrowserAction = { type: 'select', ref: 'e3', option: 'Option A' };
    expect(classifyActionRisk(action)).toBe('low');
  });

  it('returns medium for pressKey Enter', () => {
    const action: BrowserAction = { type: 'pressKey', key: 'Enter' };
    expect(classifyActionRisk(action)).toBe('medium');
  });

  it('returns low for pressKey non-Enter', () => {
    const action: BrowserAction = { type: 'pressKey', key: 'Tab' };
    expect(classifyActionRisk(action)).toBe('low');
  });

  it('returns high for navigate to delete URL', () => {
    const action: BrowserAction = { type: 'navigate', url: 'https://example.com/delete/account' };
    expect(classifyActionRisk(action)).toBe('high');
  });

  it('returns high for navigate to remove URL', () => {
    const action: BrowserAction = { type: 'navigate', url: 'https://app.com/remove-user' };
    expect(classifyActionRisk(action)).toBe('high');
  });

  it('returns medium for navigate to safe URL', () => {
    const action: BrowserAction = { type: 'navigate', url: 'https://google.com' };
    expect(classifyActionRisk(action)).toBe('medium');
  });

  it('returns safe for wait action', () => {
    const action: BrowserAction = { type: 'wait', condition: { type: 'delay', ms: 1000 } };
    expect(classifyActionRisk(action)).toBe('safe');
  });
});
