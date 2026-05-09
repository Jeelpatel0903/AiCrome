import { describe, it, expect } from 'vitest';
import type {
  ElementRef,
  PageSnapshot,
  BatchCommand,
  DomainGuardConfig,
  WorkflowStep,
  ScheduledTask,
  Memory,
} from '@devflow/shared';

describe('Type shape validation (runtime)', () => {
  it('ElementRef has all required fields', () => {
    const ref: ElementRef = {
      ref: 'e1',
      tag: 'BUTTON',
      role: 'button',
      name: 'Submit',
      disabled: false,
      visible: true,
      boundingBox: { x: 0, y: 0, width: 80, height: 36 },
      cssSelector: 'button#submit',
      xpath: '//button[@id="submit"]',
    };
    expect(ref.ref).toBe('e1');
    expect(ref.boundingBox.width).toBe(80);
  });

  it('PageSnapshot has elements array', () => {
    const snapshot: PageSnapshot = {
      url: 'https://example.com',
      title: 'Example',
      timestamp: new Date().toISOString(),
      elements: [],
      scrollY: 0,
      pageHeight: 1000,
      viewportHeight: 800,
    };
    expect(Array.isArray(snapshot.elements)).toBe(true);
  });

  it('BatchCommand has actions and bail flag', () => {
    const cmd: BatchCommand = {
      actions: [{ type: 'snapshot' }],
      bail: true,
    };
    expect(cmd.bail).toBe(true);
    expect(cmd.actions).toHaveLength(1);
  });

  it('DomainGuardConfig has rules array', () => {
    const cfg: DomainGuardConfig = {
      rules: [{ pattern: '*.evil.com', action: 'block' }],
      defaultAction: 'allow',
    };
    expect(cfg.rules[0].pattern).toBe('*.evil.com');
  });

  it('WorkflowStep has required fields', () => {
    const step: WorkflowStep = {
      id: 'step-1',
      type: 'click',
      description: 'Click submit button',
      isVariable: false,
      timestamp: new Date().toISOString(),
    };
    expect(step.id).toBe('step-1');
    expect(step.isVariable).toBe(false);
  });

  it('ScheduledTask has cron and active fields', () => {
    const task: ScheduledTask = {
      id: 'task-1',
      userId: 'user-1',
      command: 'run report',
      cronExpression: '30 9 * * 1',
      humanReadable: 'Every Monday at 9:30',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(task.isActive).toBe(true);
    expect(task.cronExpression).toBe('30 9 * * 1');
  });

  it('Memory has content, type, and tags', () => {
    const memory: Memory = {
      id: 'mem-1',
      userId: 'user-1',
      content: 'User prefers dark mode',
      type: 'preference',
      tags: ['ui', 'theme'],
      useCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(memory.type).toBe('preference');
    expect(memory.tags).toContain('ui');
  });
});
