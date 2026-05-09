import { describe, it, expect } from 'vitest';
import type { PageSnapshot, ElementRef } from '@devflow/shared';

// Mirror diffSnapshots logic from extension/src/content/diff.ts
interface SnapshotDiff {
  added: ElementRef[];
  removed: ElementRef[];
  changed: Array<{ before: ElementRef; after: ElementRef; changes: string[] }>;
  urlChanged: boolean;
  scrollChanged: boolean;
  summary: string;
}

function identityKey(el: ElementRef): string {
  return `${el.role}::${el.name}`;
}

function diffSnapshots(before: PageSnapshot, after: PageSnapshot): SnapshotDiff {
  const beforeMap = new Map<string, ElementRef>();
  const afterMap = new Map<string, ElementRef>();

  for (const el of before.elements) {
    beforeMap.set(identityKey(el), el);
  }
  for (const el of after.elements) {
    afterMap.set(identityKey(el), el);
  }

  const added: ElementRef[] = [];
  for (const [key, el] of afterMap) {
    if (!beforeMap.has(key)) {
      added.push(el);
    }
  }

  const removed: ElementRef[] = [];
  for (const [key, el] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push(el);
    }
  }

  const changed: SnapshotDiff['changed'] = [];
  for (const [key, beforeEl] of beforeMap) {
    const afterEl = afterMap.get(key);
    if (!afterEl) continue;
    const changes: string[] = [];
    if (beforeEl.value !== afterEl.value) changes.push('value');
    if (beforeEl.disabled !== afterEl.disabled) changes.push('disabled');
    if (beforeEl.visible !== afterEl.visible) changes.push('visible');
    if (changes.length > 0) changed.push({ before: beforeEl, after: afterEl, changes });
  }

  const urlChanged = before.url !== after.url;
  const scrollChanged = Math.abs(before.scrollY - after.scrollY) > 50;

  const summaryParts: string[] = [];
  if (added.length > 0) summaryParts.push(`${added.length} new element${added.length === 1 ? '' : 's'} appeared`);
  if (removed.length > 0) summaryParts.push(`${removed.length} element${removed.length === 1 ? '' : 's'} removed`);
  if (changed.length > 0) summaryParts.push(`${changed.length} element${changed.length === 1 ? '' : 's'} changed`);
  if (urlChanged) summaryParts.push('URL changed');
  if (scrollChanged) summaryParts.push('scroll position changed');
  if (summaryParts.length === 0) summaryParts.push('no changes detected');

  return {
    added,
    removed,
    changed,
    urlChanged,
    scrollChanged,
    summary: summaryParts.join(', '),
  };
}

// Helper to build a snapshot
function makeSnapshot(overrides: Partial<PageSnapshot> & { elements: ElementRef[] }): PageSnapshot {
  return {
    url: 'https://example.com',
    title: 'Test',
    timestamp: new Date().toISOString(),
    scrollY: 0,
    pageHeight: 2000,
    viewportHeight: 800,
    ...overrides,
  };
}

function makeEl(overrides: Partial<ElementRef> & { ref: string; role: string; name: string }): ElementRef {
  return {
    tag: 'BUTTON',
    disabled: false,
    visible: true,
    boundingBox: { x: 0, y: 0, width: 80, height: 36 },
    cssSelector: 'button',
    xpath: '//button',
    ...overrides,
  };
}

describe('diffSnapshots', () => {
  it('detects no changes when snapshots are identical', () => {
    const el = makeEl({ ref: 'e1', role: 'button', name: 'Submit' });
    const snap = makeSnapshot({ elements: [el] });
    const diff = diffSnapshots(snap, snap);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.summary).toBe('no changes detected');
  });

  it('detects added element', () => {
    const el1 = makeEl({ ref: 'e1', role: 'button', name: 'Submit' });
    const el2 = makeEl({ ref: 'e2', role: 'button', name: 'Cancel' });
    const before = makeSnapshot({ elements: [el1] });
    const after = makeSnapshot({ elements: [el1, el2] });
    const diff = diffSnapshots(before, after);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].name).toBe('Cancel');
  });

  it('detects removed element', () => {
    const el1 = makeEl({ ref: 'e1', role: 'button', name: 'Submit' });
    const el2 = makeEl({ ref: 'e2', role: 'link', name: 'Go back' });
    const before = makeSnapshot({ elements: [el1, el2] });
    const after = makeSnapshot({ elements: [el1] });
    const diff = diffSnapshots(before, after);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].name).toBe('Go back');
  });

  it('detects value change', () => {
    const before_el = makeEl({ ref: 'e1', role: 'textbox', name: 'Email', value: '' });
    const after_el = makeEl({ ref: 'e1', role: 'textbox', name: 'Email', value: 'user@test.com' });
    const before = makeSnapshot({ elements: [before_el] });
    const after = makeSnapshot({ elements: [after_el] });
    const diff = diffSnapshots(before, after);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].changes).toContain('value');
  });

  it('detects URL change', () => {
    const el = makeEl({ ref: 'e1', role: 'button', name: 'OK' });
    const before = makeSnapshot({ elements: [el], url: 'https://example.com/step1' });
    const after = makeSnapshot({ elements: [el], url: 'https://example.com/step2' });
    const diff = diffSnapshots(before, after);
    expect(diff.urlChanged).toBe(true);
    expect(diff.summary).toContain('URL changed');
  });

  it('detects scroll change over 50px', () => {
    const el = makeEl({ ref: 'e1', role: 'button', name: 'OK' });
    const before = makeSnapshot({ elements: [el], scrollY: 0 });
    const after = makeSnapshot({ elements: [el], scrollY: 100 });
    const diff = diffSnapshots(before, after);
    expect(diff.scrollChanged).toBe(true);
  });

  it('ignores scroll change under 50px', () => {
    const el = makeEl({ ref: 'e1', role: 'button', name: 'OK' });
    const before = makeSnapshot({ elements: [el], scrollY: 0 });
    const after = makeSnapshot({ elements: [el], scrollY: 30 });
    const diff = diffSnapshots(before, after);
    expect(diff.scrollChanged).toBe(false);
  });

  it('uses content-based identity (role::name), not position', () => {
    // Same element, different ref number (e.g. after re-snapshot) — should not flag as add/remove
    const el_before = makeEl({ ref: 'e3', role: 'button', name: 'Submit' });
    const el_after = makeEl({ ref: 'e7', role: 'button', name: 'Submit' }); // ref changed, same content
    const before = makeSnapshot({ elements: [el_before] });
    const after = makeSnapshot({ elements: [el_after] });
    const diff = diffSnapshots(before, after);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });
});
