// Polling-based wait conditions for content scripts

export type WaitCondition =
  | { type: 'element-visible'; ref?: string; selector?: string }
  | { type: 'element-gone'; ref?: string; selector?: string }
  | { type: 'text-present'; text: string; selector?: string }
  | { type: 'url-contains'; substring: string }
  | { type: 'network-idle'; durationMs?: number }
  | { type: 'delay'; ms: number };

export interface WaitResult {
  success: boolean;
  elapsed: number;
  error?: string;
}

const POLL_INTERVAL_MS = 300;

// Network idle tracking
let networkPatched = false;
let lastRequestTime = 0;

function patchNetworkMonitoring(): void {
  if (networkPatched) return;
  networkPatched = true;

  // Patch fetch
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    lastRequestTime = Date.now();
    const result = originalFetch(...args);
    result.finally(() => {
      lastRequestTime = Date.now();
    });
    return result;
  };

  // Patch XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ): void {
    lastRequestTime = Date.now();
    this.addEventListener('loadend', () => {
      lastRequestTime = Date.now();
    });
    originalOpen.call(this, method, url, async, username, password);
  };
}

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

export function waitFor(condition: WaitCondition, timeoutMs = 25000): Promise<WaitResult> {
  const start = Date.now();

  // Delay is a special case — simple setTimeout
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
            conditionMet = document.body.innerText.includes(condition.text);
          }
          break;
        }

        case 'url-contains': {
          conditionMet = window.location.href.includes(condition.substring);
          break;
        }

        case 'network-idle': {
          patchNetworkMonitoring();
          const durationMs = condition.durationMs ?? 1000;
          const timeSinceLast = Date.now() - lastRequestTime;
          // If no request has ever been tracked, lastRequestTime is 0; treat that as idle
          conditionMet = lastRequestTime === 0 || timeSinceLast >= durationMs;
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
