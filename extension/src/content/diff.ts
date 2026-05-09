// Snapshot diff — compares two PageSnapshot objects and returns what changed

import type { PageSnapshot, ElementRef } from './snapshot';

export interface SnapshotDiff {
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

export function diffSnapshots(before: PageSnapshot, after: PageSnapshot): SnapshotDiff {
  const beforeMap = new Map<string, ElementRef>();
  const afterMap = new Map<string, ElementRef>();

  for (const el of before.elements) {
    beforeMap.set(identityKey(el), el);
  }
  for (const el of after.elements) {
    afterMap.set(identityKey(el), el);
  }

  // Added: in after but not in before
  const added: ElementRef[] = [];
  for (const [key, el] of afterMap) {
    if (!beforeMap.has(key)) {
      added.push(el);
    }
  }

  // Removed: in before but not in after
  const removed: ElementRef[] = [];
  for (const [key, el] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push(el);
    }
  }

  // Changed: present in both, but value/disabled/visible differ
  const changed: Array<{ before: ElementRef; after: ElementRef; changes: string[] }> = [];
  for (const [key, beforeEl] of beforeMap) {
    const afterEl = afterMap.get(key);
    if (!afterEl) continue;

    const changes: string[] = [];

    if (beforeEl.value !== afterEl.value) {
      changes.push('value');
    }
    if (beforeEl.disabled !== afterEl.disabled) {
      changes.push('disabled');
    }
    if (beforeEl.visible !== afterEl.visible) {
      changes.push('visible');
    }

    if (changes.length > 0) {
      changed.push({ before: beforeEl, after: afterEl, changes });
    }
  }

  const urlChanged = before.url !== after.url;
  const scrollChanged = Math.abs(before.scrollY - after.scrollY) > 50;

  // Build human-readable summary
  const summaryParts: string[] = [];
  if (added.length > 0) {
    summaryParts.push(`${added.length} new element${added.length === 1 ? '' : 's'} appeared`);
  }
  if (removed.length > 0) {
    summaryParts.push(`${removed.length} element${removed.length === 1 ? '' : 's'} removed`);
  }
  if (changed.length > 0) {
    summaryParts.push(`${changed.length} element${changed.length === 1 ? '' : 's'} changed`);
  }
  if (urlChanged) {
    summaryParts.push('URL changed');
  }
  if (scrollChanged) {
    summaryParts.push('scroll position changed');
  }
  if (summaryParts.length === 0) {
    summaryParts.push('no changes detected');
  }

  const summary = summaryParts.join(', ');

  return { added, removed, changed, urlChanged, scrollChanged, summary };
}
