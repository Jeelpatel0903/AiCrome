// Batch executor — runs multiple browser actions in a single round-trip

import { waitFor } from './wait';
import type { WaitCondition } from './wait';
import { buildSnapshot, buildSnapshotText } from './snapshot';

export interface BatchAction {
  type: string;
  ref?: string;
  text?: string;
  url?: string;
  key?: string;
  direction?: 'up' | 'down';
  amount?: number;
  condition?: Record<string, unknown>;
  selector?: string;
  fieldDescription?: string;
  description?: string;
  x?: number;
  y?: number;
}

export interface BatchActionResult {
  action: BatchAction;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface BatchResult {
  results: BatchActionResult[];
  allSucceeded: boolean;
  stoppedEarly: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findByRef(ref: string): Element | null {
  return document.querySelector(`[data-ai-ref="${ref}"]`);
}

async function executeOne(
  action: BatchAction,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  switch (action.type) {
    case 'click_ref': {
      if (!action.ref) return { success: false, error: 'click_ref requires ref' };
      const el = findByRef(action.ref);
      if (!el) return { success: false, error: `Element not found: ${action.ref}` };
      (el as HTMLElement).click();
      await delay(300);
      return { success: true, data: { clicked: action.ref } };
    }

    case 'type_ref': {
      if (!action.ref) return { success: false, error: 'type_ref requires ref' };
      if (action.text === undefined) return { success: false, error: 'type_ref requires text' };
      const el = findByRef(action.ref);
      if (!el) return { success: false, error: `Element not found: ${action.ref}` };

      const isTextArea = el.tagName === 'TEXTAREA';
      const isInput = el.tagName === 'INPUT';

      if (!isInput && !isTextArea && !(el as HTMLElement).isContentEditable) {
        return { success: false, error: `Element ${action.ref} is not typeable` };
      }

      (el as HTMLElement).focus();

      if (isInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(el, action.text);
        } else {
          (el as HTMLInputElement).value = action.text;
        }
      } else if (isTextArea) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(el, action.text);
        } else {
          (el as HTMLTextAreaElement).value = action.text;
        }
      } else {
        // contenteditable
        (el as HTMLElement).textContent = action.text;
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      return { success: true, data: { typed: action.text, ref: action.ref } };
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
      const result = await waitFor(action.condition as WaitCondition);
      if (!result.success) {
        return { success: false, error: result.error ?? 'Wait condition timed out' };
      }
      return { success: true, data: { elapsed: result.elapsed } };
    }

    case 'snapshot': {
      const snapshot = buildSnapshot();
      const text = buildSnapshotText(snapshot);
      return { success: true, data: { snapshot: text, elementCount: snapshot.elements.length } };
    }

    default:
      return { success: false, error: `Unknown batch action type: ${action.type}` };
  }
}

export async function executeBatch(actions: BatchAction[], bail: boolean): Promise<BatchResult> {
  const results: BatchActionResult[] = [];
  let stoppedEarly = false;

  for (const action of actions) {
    const outcome = await executeOne(action);
    results.push({ action, ...outcome });

    if (!outcome.success && bail) {
      stoppedEarly = true;
      break;
    }
  }

  const allSucceeded = results.every((r) => r.success);
  return { results, allSucceeded, stoppedEarly };
}
