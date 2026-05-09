// Content script — injected into every page

import { findElementByRef, buildSnapshot, buildSnapshotText, clearRefAttributes } from './snapshot';
import type { PageSnapshot } from './snapshot';
import { waitFor } from './wait';
import type { WaitCondition } from './wait';
import { findElementBySemanticLocator } from './semantic-locator';

console.log('DevFlow AI content script loaded');

// Module-level cache for the most recent page snapshot
let lastSnapshot: PageSnapshot | null = null;

interface ActionMessage {
  type: 'devflow_action';
  requestId: string;
  action: string;
  params: Record<string, unknown>;
}

interface ActionResult {
  type: 'devflow_action_result';
  requestId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// Implement each action:

function findElementByDescription(description: string): Element | null {
  // Try multiple strategies:
  // 1. aria-label contains description
  // 2. placeholder contains description
  // 3. text content contains description
  // 4. title attribute contains description
  // 5. name attribute matches
  const desc = description.toLowerCase();

  const allElements = document.querySelectorAll(
    'button, input, select, textarea, a, [role="button"], [role="link"], label, [onclick]',
  );

  for (const el of allElements) {
    const text = (el.textContent || '').toLowerCase().trim();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (el as HTMLInputElement).placeholder?.toLowerCase() || '';
    const title = (el.getAttribute('title') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.getAttribute('id') || '').toLowerCase();

    if (
      text.includes(desc) ||
      aria.includes(desc) ||
      placeholder.includes(desc) ||
      title.includes(desc) ||
      name.includes(desc) ||
      id.includes(desc)
    ) {
      return el;
    }
  }
  return null;
}

async function handleAction(
  action: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  switch (action) {
    case 'click': {
      const description = params.description as string | undefined;
      const x = params.x as number | undefined;
      const y = params.y as number | undefined;

      if (x !== undefined && y !== undefined) {
        const el = document.elementFromPoint(x, y);
        if (el) {
          (el as HTMLElement).click();
          await new Promise<void>((r) => setTimeout(r, 500));
          return { success: true, data: { clicked: el.tagName } };
        }
        return { success: false, error: 'No element at coordinates' };
      }

      if (description) {
        const el = findElementByDescription(description);
        if (el) {
          (el as HTMLElement).click();
          await new Promise<void>((r) => setTimeout(r, 500));
          return { success: true, data: { clicked: el.tagName, text: el.textContent?.trim() } };
        }
        return { success: false, error: `Element not found: ${description}` };
      }
      return { success: false, error: 'click requires description or coordinates' };
    }

    case 'type': {
      const fieldDescription = params.fieldDescription as string;
      const text = params.text as string;
      const clearFirst = params.clearFirst !== false;

      let el: Element | null = findElementByDescription(fieldDescription);
      if (!el) {
        // Try focused element
        el = document.activeElement;
      }
      if (!el || !['INPUT', 'TEXTAREA'].includes(el.tagName)) {
        return { success: false, error: `Input field not found: ${fieldDescription}` };
      }

      const input = el as HTMLInputElement;
      if (clearFirst) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Type character by character for React/Vue compatibility
      input.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, text);
      } else {
        input.value = text;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return { success: true, data: { typed: text, field: fieldDescription } };
    }

    case 'select': {
      const dropdownDescription = params.dropdownDescription as string;
      const optionText = params.optionText as string;

      const el =
        findElementByDescription(dropdownDescription) ||
        document.querySelector(`select[name*="${dropdownDescription.toLowerCase()}"]`);

      if (!el || el.tagName !== 'SELECT') {
        return { success: false, error: `Dropdown not found: ${dropdownDescription}` };
      }

      const select = el as HTMLSelectElement;
      const option = Array.from(select.options).find(
        (o) =>
          o.text.toLowerCase().includes(optionText.toLowerCase()) ||
          o.value.toLowerCase().includes(optionText.toLowerCase()),
      );

      if (!option) {
        return { success: false, error: `Option not found: ${optionText}` };
      }

      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, data: { selected: option.text } };
    }

    case 'pressKey': {
      const key = params.key as string;
      const activeEl = document.activeElement || document.body;
      activeEl.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      activeEl.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      if (key === 'Enter' && activeEl.tagName === 'INPUT') {
        (activeEl as HTMLInputElement).form?.dispatchEvent(new Event('submit', { bubbles: true }));
      }
      return { success: true, data: { key } };
    }

    case 'scroll': {
      const direction = params.direction as 'up' | 'down';
      const amount = (params.amount as number) || 300;
      window.scrollBy(0, direction === 'down' ? amount : -amount);
      return { success: true, data: { scrolled: direction, amount } };
    }

    case 'getDOM': {
      // Return simplified DOM snapshot
      const simplify = (el: Element, depth = 0): object => {
        if (depth > 5) return {};
        return {
          tag: el.tagName,
          id: el.id || undefined,
          class: el.className || undefined,
          text: el.textContent?.trim().slice(0, 100) || undefined,
          children:
            depth < 3 ? Array.from(el.children).slice(0, 10).map((c) => simplify(c, depth + 1)) : [],
        };
      };
      return { success: true, data: { dom: simplify(document.body) } };
    }

    case 'snapshot': {
      clearRefAttributes();
      const snapshot = buildSnapshot();
      const prevSnapshot = lastSnapshot;
      lastSnapshot = snapshot;
      const snapshotText = buildSnapshotText(snapshot);
      return {
        success: true,
        data: {
          text: snapshotText,
          elementCount: snapshot.elements.length,
          url: snapshot.url,
          fresh: prevSnapshot === null,
        },
      };
    }

    case 'get_snapshot': {
      clearRefAttributes();
      const snapshot = buildSnapshot();
      lastSnapshot = snapshot;
      // Cast PageSnapshot to a Record for the generic response data field
      const snapshotData: Record<string, unknown> = {
        url: snapshot.url,
        title: snapshot.title,
        timestamp: snapshot.timestamp,
        elements: snapshot.elements,
        scrollY: snapshot.scrollY,
        pageHeight: snapshot.pageHeight,
        viewportHeight: snapshot.viewportHeight,
      };
      return { success: true, data: snapshotData };
    }

    case 'click_ref': {
      const ref = params.ref as string | undefined;
      let el: Element | null = null;

      if (ref) {
        el = findElementByRef(ref);
      }

      if (!el && ref) {
        // Fall back to semantic locator using the ref string as a name hint
        const result = findElementBySemanticLocator({ name: ref });
        el = result.element;
      }

      if (!el) {
        return { success: false, error: `Element not found for ref: ${String(ref)}` };
      }

      (el as HTMLElement).click();
      await new Promise<void>((r) => setTimeout(r, 500));
      return { success: true, data: { clicked: el.tagName, ref: String(ref) } };
    }

    case 'type_ref': {
      const ref = params.ref as string | undefined;
      const fieldDescription = params.fieldDescription as string | undefined;
      const text = params.text as string;
      const clearFirst = params.clearFirst !== false;

      let el: Element | null = null;

      if (ref) {
        el = findElementByRef(ref);
      }

      if (!el && fieldDescription) {
        const result = findElementBySemanticLocator({ placeholder: fieldDescription });
        el = result.element;
      }

      if (!el || !['INPUT', 'TEXTAREA'].includes(el.tagName)) {
        return {
          success: false,
          error: `Input field not found for ref: ${String(ref ?? fieldDescription)}`,
        };
      }

      const input = el as HTMLInputElement;
      if (clearFirst) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      input.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, text);
      } else {
        input.value = text;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return { success: true, data: { typed: text, ref: String(ref ?? fieldDescription) } };
    }

    case 'wait': {
      const condition = params.condition as WaitCondition;
      const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 25000;
      const result = await waitFor(condition, timeoutMs);
      return {
        success: result.success,
        data: { elapsed: result.elapsed },
        error: result.error,
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

chrome.runtime.onMessage.addListener((message: ActionMessage, _sender, sendResponse) => {
  if (message.type !== 'devflow_action') {
    sendResponse({ success: false, error: 'Unknown message type' });
    return true;
  }

  handleAction(message.action, message.params)
    .then((result) => {
      sendResponse({
        type: 'devflow_action_result',
        requestId: message.requestId,
        ...result,
      } as ActionResult);
    })
    .catch((err: unknown) => {
      sendResponse({
        type: 'devflow_action_result',
        requestId: message.requestId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } as ActionResult);
    });

  return true; // Keep channel open for async response
});

export {};
