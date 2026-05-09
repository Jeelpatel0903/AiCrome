import { describe, it, expect, beforeEach, vi } from 'vitest';

// Test wait strategy logic using happy-dom (DOM is available via happy-dom environment)
// We inline the waitFor logic mirrored from extension/src/content/wait.ts

type WaitCondition =
  | { type: 'element-visible'; ref?: string; selector?: string }
  | { type: 'element-gone'; ref?: string; selector?: string }
  | { type: 'text-present'; text: string; selector?: string }
  | { type: 'url-contains'; substring: string }
  | { type: 'delay'; ms: number };

interface WaitResult { success: boolean; elapsed: number; error?: string }

const POLL_INTERVAL_MS = 50; // shorter for tests

function resolveSelector(condition: { ref?: string; selector?: string }): string | null {
  if (condition.ref) return `[data-ai-ref="${condition.ref}"]`;
  if (condition.selector) return condition.selector;
  return null;
}

function elementIsVisible(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!el) return false;
  const htmlEl = el as HTMLElement;
  if (htmlEl.offsetParent !== null) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function waitFor(condition: WaitCondition, timeoutMs = 25000): Promise<WaitResult> {
  const start = Date.now();

  if (condition.type === 'delay') {
    const ms = Math.min(condition.ms, timeoutMs);
    return new Promise<WaitResult>((resolve) => {
      setTimeout(() => {
        resolve({ success: true, elapsed: Date.now() - start });
      }, ms);
    });
  }

  return new Promise<WaitResult>((resolve) => {
    const check = (): void => {
      const elapsed = Date.now() - start;

      if (elapsed >= timeoutMs) {
        resolve({
          success: false,
          elapsed,
          error: `Timed out after ${timeoutMs}ms waiting for condition: ${condition.type}`,
        });
        return;
      }

      let conditionMet = false;

      switch (condition.type) {
        case 'element-visible': {
          const selector = resolveSelector(condition);
          conditionMet = selector !== null && elementIsVisible(selector);
          break;
        }

        case 'element-gone': {
          const selector = resolveSelector(condition);
          if (selector === null) {
            conditionMet = true;
          } else {
            conditionMet = !elementIsVisible(selector);
          }
          break;
        }

        case 'text-present': {
          if (condition.selector) {
            const scopeEl = document.querySelector(condition.selector);
            conditionMet = scopeEl
              ? (scopeEl as HTMLElement).innerText?.includes(condition.text) ?? false
              : false;
          } else {
            conditionMet = document.body.innerText?.includes(condition.text) ?? false;
          }
          break;
        }

        case 'url-contains': {
          conditionMet = window.location.href.includes(condition.substring);
          break;
        }
      }

      if (conditionMet) {
        resolve({ success: true, elapsed: Date.now() - start });
      } else {
        setTimeout(check, POLL_INTERVAL_MS);
      }
    };

    check();
  });
}

describe('Wait Strategies', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delay condition resolves after specified time', async () => {
    const promise = waitFor({ type: 'delay', ms: 100 });
    vi.advanceTimersByTime(150);
    const result = await promise;
    expect(result.success).toBe(true);
  });

  it('element-visible resolves when element exists', async () => {
    vi.useRealTimers();
    // Add element immediately
    const btn = document.createElement('button');
    btn.setAttribute('data-ai-ref', 'e1');
    document.body.appendChild(btn);

    const result = await waitFor({ type: 'element-visible', ref: 'e1' }, 500);
    expect(result.success).toBe(true);
  });

  it('element-visible times out when element never appears', async () => {
    vi.useRealTimers();
    const result = await waitFor({ type: 'element-visible', selector: '#nonexistent' }, 100);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Timed out');
  });

  it('text-present resolves when text appears in body', async () => {
    vi.useRealTimers();
    document.body.textContent = 'Success! Your form was submitted.';
    const result = await waitFor({ type: 'text-present', text: 'Success' }, 500);
    expect(result.success).toBe(true);
  });

  it('element-gone resolves when element is absent', async () => {
    vi.useRealTimers();
    const result = await waitFor({ type: 'element-gone', selector: '#spinner' }, 500);
    expect(result.success).toBe(true); // element never existed → already gone
  });
});
