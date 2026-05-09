// AI interaction loop — coordinates snapshot → background → action → diff → repeat

import { buildSnapshot, findElementByRef, clearRefAttributes, buildSnapshotText } from './snapshot';
import type { PageSnapshot } from './snapshot';
import { diffSnapshots } from './diff';
import { waitFor } from './wait';
import type { WaitCondition } from './wait';

export interface LoopAction {
  type: string;
  ref?: string;
  text?: string;
  url?: string;
  key?: string;
  direction?: 'up' | 'down';
  amount?: number;
  condition?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface LoopStep {
  action: LoopAction;
  beforeSnapshot?: PageSnapshot;
  afterSnapshot?: PageSnapshot;
  success: boolean;
  error?: string;
  diffSummary?: string;
}

export interface LoopSession {
  sessionId: string;
  steps: LoopStep[];
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendMessage(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: Record<string, unknown>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function typeIntoElement(el: Element, text: string): void {
  const isInput = el.tagName === 'INPUT';
  const isTextArea = el.tagName === 'TEXTAREA';

  (el as HTMLElement).focus();

  if (isInput) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      (el as HTMLInputElement).value = text;
    }
  } else if (isTextArea) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      (el as HTMLTextAreaElement).value = text;
    }
  } else {
    // contenteditable
    (el as HTMLElement).textContent = text;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function executeLoopAction(
  action: LoopAction,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  switch (action.type) {
    case 'snapshot': {
      clearRefAttributes();
      const snapshot = buildSnapshot();
      const text = buildSnapshotText(snapshot);
      return { success: true, data: { snapshot: text, elementCount: snapshot.elements.length } };
    }

    case 'click_ref': {
      if (!action.ref) return { success: false, error: 'click_ref requires ref' };
      const el = findElementByRef(action.ref);
      if (!el) return { success: false, error: `Element not found: ${action.ref}` };
      (el as HTMLElement).click();
      await delay(500);
      return { success: true, data: { clicked: action.ref } };
    }

    case 'type_ref': {
      if (!action.ref) return { success: false, error: 'type_ref requires ref' };
      if (action.text === undefined) return { success: false, error: 'type_ref requires text' };
      const el = findElementByRef(action.ref);
      if (!el) return { success: false, error: `Element not found: ${action.ref}` };
      typeIntoElement(el, action.text);
      return { success: true, data: { typed: action.text, ref: action.ref } };
    }

    case 'navigate': {
      if (!action.url) return { success: false, error: 'navigate requires url' };
      const response = await sendMessage({ type: 'devflow_navigate', url: action.url });
      const success = response.success !== false;
      return { success, data: { url: action.url } };
    }

    case 'scroll': {
      const direction = action.direction ?? 'down';
      const amount = action.amount ?? 300;
      window.scrollBy(0, direction === 'down' ? amount : -amount);
      return { success: true, data: { scrolled: direction, amount } };
    }

    case 'pressKey': {
      if (!action.key) return { success: false, error: 'pressKey requires key' };
      const activeEl = document.activeElement ?? document.body;
      activeEl.dispatchEvent(new KeyboardEvent('keydown', { key: action.key, bubbles: true }));
      activeEl.dispatchEvent(new KeyboardEvent('keyup', { key: action.key, bubbles: true }));
      return { success: true, data: { key: action.key } };
    }

    case 'wait': {
      if (!action.condition) return { success: false, error: 'wait requires condition' };
      const timeoutMs = action.timeoutMs;
      const result = await waitFor(
        action.condition as WaitCondition,
        timeoutMs !== undefined ? timeoutMs : undefined,
      );
      if (!result.success) {
        return { success: false, error: result.error ?? 'Wait condition timed out' };
      }
      return { success: true, data: { elapsed: result.elapsed } };
    }

    case 'screenshot': {
      const response = await sendMessage({ type: 'take_screenshot' });
      const dataUrl = response.dataUrl as string | undefined;
      return { success: true, data: { dataUrl: dataUrl ?? '' } };
    }

    default:
      return { success: false, error: `Unknown action type: ${action.type}` };
  }
}

export async function runSingleStep(action: LoopAction): Promise<LoopStep> {
  // 1. Take before snapshot
  const beforeSnapshot = buildSnapshot();

  // 2. Execute the action
  const outcome = await executeLoopAction(action);

  // 3. Wait 200ms for DOM to settle
  await delay(200);

  // 4. Take after snapshot
  const afterSnapshot = buildSnapshot();

  // 5. Compute diff
  const diff = diffSnapshots(beforeSnapshot, afterSnapshot);

  return {
    action,
    beforeSnapshot,
    afterSnapshot,
    success: outcome.success,
    error: outcome.error,
    diffSummary: diff.summary,
  };
}
