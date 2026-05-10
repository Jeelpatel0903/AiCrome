/**
 * DevFlow AI — Background Service Worker
 *
 * Architecture note: ALL page interactions use chrome.scripting.executeScript()
 * instead of chrome.tabs.sendMessage() + content script callbacks.
 *
 * Why: ws.onmessage is NOT a Chrome API event, so Chrome may terminate the
 * service worker before the sendMessage callback chain completes, causing 60s
 * bridge timeouts.  executeScript() is awaited as a Promise and Chrome keeps
 * the service worker alive for the duration — guaranteed.
 */

// ─── State ───────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let userId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2000;

// Track the last HTTP tab the user was on.
// chrome.tabs.query({ active: true, currentWindow: true }) is unreliable from
// a service worker when the sidepanel has focus — this is more reliable.
let lastActiveTabId: number | null = null;

declare const VITE_BACKEND_URL: string;

// ─── Tab tracking ─────────────────────────────────────────────────────────────

function isHttp(url?: string): boolean {
  return !!(url?.startsWith('http://') || url?.startsWith('https://'));
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (!chrome.runtime.lastError && isHttp(tab?.url)) lastActiveTabId = tabId;
  });
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active && isHttp(tab.url)) {
    lastActiveTabId = tabId;
  }
});

// ─── Find the right tab for bridge actions ────────────────────────────────────

function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    if (lastActiveTabId !== null) {
      const id = lastActiveTabId;
      chrome.tabs.get(id, (tab) => {
        if (!chrome.runtime.lastError && isHttp(tab?.url)) { resolve(tab); return; }
        lastActiveTabId = null;
        queryFallbackTab(resolve);
      });
    } else {
      queryFallbackTab(resolve);
    }
  });
}

function queryFallbackTab(resolve: (t: chrome.tabs.Tab | null) => void): void {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const t = tabs.find((x) => isHttp(x.url));
    if (t) { lastActiveTabId = t.id ?? null; resolve(t); return; }
    chrome.tabs.query({ active: true }, (all) => {
      const t2 = all.find((x) => isHttp(x.url));
      if (t2) { lastActiveTabId = t2.id ?? null; resolve(t2); return; }
      resolve(null);
    });
  });
}

// ─── Bridge result ────────────────────────────────────────────────────────────

type BridgeResult = { success: boolean; data?: Record<string, unknown>; error?: string };

function sendBridgeResult(requestId: string, result: BridgeResult): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'bridge_result', requestId, ...result }));
  }
}

// ─── Page action functions (injected via executeScript) ───────────────────────
// These MUST be self-contained — no closures over external variables.

function _pageSnapshot(): BridgeResult {
  try {
    const SEL = 'a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="tab"],[role="combobox"],[contenteditable="true"]';
    const MAX = 80; // reduced from 150 — keeps context lean
    const candidates = Array.from(document.querySelectorAll(SEL));

    // Batch-read all rects ONCE to avoid repeated layout reflows
    const rects = new Map<Element, DOMRect>();
    for (const el of candidates) rects.set(el, el.getBoundingClientRect());

    const visible = candidates.filter((el) => {
      const r = rects.get(el)!;
      return (el as HTMLElement).offsetParent !== null || (r.width > 0 && r.height > 0);
    });

    const vh = window.innerHeight;
    visible.sort((a, b) => {
      const aY = rects.get(a)!.top, bY = rects.get(b)!.top;
      const aIn = aY >= 0 && aY < vh ? 0 : 1, bIn = bY >= 0 && bY < vh ? 0 : 1;
      return aIn !== bIn ? aIn - bIn : aY - bY;
    });

    // Clear old refs first
    document.querySelectorAll('[data-ai-ref]').forEach((e) => e.removeAttribute('data-ai-ref'));

    const capped = visible.slice(0, MAX);
    const more = visible.length > MAX;
    const moreBelow = document.documentElement.scrollHeight > window.scrollY + vh + 50;

    const lines: string[] = [
      `Page: ${document.title}`,
      `URL: ${location.href}`,
      `Viewport: ${vh}px | Scroll: ${Math.round(window.scrollY)}/${document.documentElement.scrollHeight}${moreBelow ? ' (more below)' : ''}`,
      `Elements: ${capped.length}${more ? ` of ${visible.length} (scroll for more)` : ''}`,
      '',
      'Interactive elements:',
    ];

    for (let i = 0; i < capped.length; i++) {
      const el = capped[i];
      const ref = `e${i + 1}`;
      el.setAttribute('data-ai-ref', ref);

      const tag = el.tagName.toUpperCase();
      const inp = el as HTMLInputElement;
      const type = inp.type || undefined;
      const tagStr = type ? `${tag}[${type}]` : tag;

      let name =
        el.getAttribute('aria-label') ||
        (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent?.trim()) ||
        el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ||
        inp.placeholder ||
        el.getAttribute('title') ||
        el.getAttribute('name') ||
        '';
      name = String(name).replace(/\s+/g, ' ').trim();

      const value = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ? inp.value : undefined;
      const disabled = inp.disabled || false;
      const rect = rects.get(el)!;
      const inView = rect.top >= 0 && rect.top < vh;

      lines.push(
        `[@${ref}] ${tagStr} "${name}"` +
        (value !== undefined ? ` value="${value}"` : '') +
        (disabled ? ' [disabled]' : '') +
        (inView ? '' : ' [below-fold]'),
      );
    }

    // ── Semantic page type detection ────────────────────────────────────────
    let pageType = 'unknown';
    if (document.querySelector('[role="dialog"], .modal, .modal-backdrop, [class*="modal"]')) {
      pageType = 'modal';
    } else if (document.querySelector('[role="alert"], .alert-danger, .error-message, [class*="error"]')
      || /error|failed|invalid|wrong/i.test(document.body.innerText.slice(0, 500))) {
      pageType = 'error';
    } else if (document.querySelector('input[type="password"]')) {
      pageType = 'login';
    } else if ((document.querySelectorAll('table tr').length) > 5) {
      pageType = 'list';
    } else if ((document.querySelectorAll('form input, form select, form textarea').length) >= 3) {
      pageType = 'form';
    } else {
      const href = location.href.toLowerCase();
      if (/\/(dashboard|home|overview|main|index)/.test(href)) pageType = 'dashboard';
      else if (/\/(detail|view|show|profile|account)/.test(href)) pageType = 'detail';
    }

    // ── Detected forms ───────────────────────────────────────────────────────
    const forms: Array<{
      fields: Array<{ ref: string; label: string; type: string; required: boolean; currentValue?: string }>;
      submitRef?: string;
    }> = [];

    document.querySelectorAll('form').forEach((form) => {
      const fields: Array<{ ref: string; label: string; type: string; required: boolean; currentValue?: string }> = [];
      let submitRef: string | undefined;

      form.querySelectorAll('input:not([type="hidden"]),select,textarea').forEach((field) => {
        const f = field as HTMLInputElement;
        const ref = f.getAttribute('data-ai-ref');
        if (!ref) return;
        // Find label
        const id = f.id;
        let label = f.getAttribute('aria-label') || '';
        if (!label && id) label = document.querySelector(`label[for="${id}"]`)?.textContent?.trim() ?? '';
        if (!label) label = f.placeholder || f.name || f.type || '';
        fields.push({
          ref: `@${ref}`,
          label: label.slice(0, 60),
          type: f.type || f.tagName.toLowerCase(),
          required: f.required,
          currentValue: f.value || undefined,
        });
      });

      // Find submit button
      const submitEl = form.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
      if (submitEl) {
        const sRef = submitEl.getAttribute('data-ai-ref');
        if (sRef) submitRef = `@${sRef}`;
      }

      if (fields.length > 0) forms.push({ fields, submitRef });
    });

    return {
      success: true,
      data: {
        text: lines.join('\n'),
        elementCount: capped.length,
        url: location.href,
        title: document.title,
        bodyLength: document.body.innerText.length,
        pageType,
        forms,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function _pageClickRef(ref: string): BridgeResult {
  try {
    const el = document.querySelector(`[data-ai-ref="${ref}"]`) as HTMLElement | null;
    if (!el) return { success: false, error: `Element not found: @${ref}` };
    el.focus();
    el.click();
    return { success: true, data: { clicked: el.tagName, ref } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function _pageTypeRef(ref: string, text: string, clearFirst: boolean): BridgeResult {
  try {
    const el = document.querySelector(`[data-ai-ref="${ref}"]`) as HTMLInputElement | null;
    if (!el) return { success: false, error: `Element not found: @${ref}` };
    if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) return { success: false, error: `@${ref} is not an input (${el.tagName})` };

    el.focus();
    if (clearFirst) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, text);
    else el.value = text;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, data: { typed: text, ref } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function _pageScroll(direction: string, amount: number): BridgeResult {
  try {
    window.scrollBy(0, direction === 'down' ? amount : -amount);
    return { success: true, data: { scrolled: direction, amount } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function _pagePressKey(key: string): BridgeResult {
  try {
    const el = (document.activeElement || document.body) as HTMLElement;
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    if (key === 'Enter' && el.tagName === 'INPUT') {
      (el as HTMLInputElement).form?.dispatchEvent(new Event('submit', { bubbles: true }));
    }
    return { success: true, data: { key } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function _pageClick(description: string): BridgeResult {
  try {
    const desc = description.toLowerCase();
    const all = document.querySelectorAll('button,input,select,textarea,a,[role="button"],[role="link"],[onclick],label');
    for (const el of all) {
      const text = (el.textContent || '').toLowerCase().trim();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const ph = ((el as HTMLInputElement).placeholder || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      if (text.includes(desc) || aria.includes(desc) || ph.includes(desc) || title.includes(desc)) {
        (el as HTMLElement).click();
        return { success: true, data: { clicked: el.tagName, text: el.textContent?.trim() } };
      }
    }
    return { success: false, error: `Element not found: ${description}` };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function _pageCheckCondition(condition: { type: string; ref?: string; text?: string; substring?: string }): { met: boolean } {
  try {
    switch (condition.type) {
      case 'element-visible': {
        const el = condition.ref ? document.querySelector(`[data-ai-ref="${condition.ref}"]`) : null;
        return { met: el ? (el as HTMLElement).offsetParent !== null || el.getBoundingClientRect().width > 0 : false };
      }
      case 'element-gone': {
        const el = condition.ref ? document.querySelector(`[data-ai-ref="${condition.ref}"]`) : null;
        return { met: el === null };
      }
      case 'text-present':
        return { met: condition.text ? document.body.textContent?.includes(condition.text) ?? false : false };
      case 'url-contains':
        return { met: condition.substring ? location.href.includes(condition.substring) : false };
      case 'network-idle':
        return { met: document.readyState === 'complete' };
      case 'page-mutated': {
        // Detect significant DOM changes (e.g. after OAuth redirect, SPA navigation, login success)
        // Uses a page-level hash stored in the isolated world across executeScript calls.
        const w = window as Window & { __aiPageHash?: string };
        const h = `${document.title}|${document.body.innerText.length}|${document.querySelectorAll('[data-ai-ref]').length}`;
        if (!w.__aiPageHash) {
          // First poll: record baseline
          w.__aiPageHash = h;
          return { met: false };
        }
        const changed = h !== w.__aiPageHash;
        if (changed) w.__aiPageHash = undefined; // Reset so it can be reused
        return { met: changed };
      }
      default:
        return { met: false };
    }
  } catch {
    return { met: false };
  }
}

// ─── Execute an action in a tab via executeScript ─────────────────────────────

async function runInTab(tabId: number, requestId: string, action: string, params: Record<string, unknown>): Promise<void> {
  try {
    let results: chrome.scripting.InjectionResult[];

    switch (action) {
      case 'snapshot':
      case 'get_snapshot':
        results = await chrome.scripting.executeScript({ target: { tabId }, func: _pageSnapshot });
        break;

      case 'click_ref': {
        const ref = String(params.ref ?? '').replace('@', '');
        // Snapshot open windows before click so we can detect OAuth popups
        const winsBefore = await chrome.windows.getAll();
        const winIdsBefore = new Set(winsBefore.map((w) => w.id));
        results = await chrome.scripting.executeScript({ target: { tabId }, func: _pageClickRef, args: [ref] });
        // Settle: give OAuth popup time to open
        await new Promise((r) => setTimeout(r, 700));
        // Detect new popup window (e.g. Google / GitHub OAuth)
        const winsAfter = await chrome.windows.getAll();
        const newPopup = winsAfter.find((w) => !winIdsBefore.has(w.id) && w.type === 'popup');
        if (newPopup) {
          const popupTab = newPopup.tabs?.[0];
          sendBridgeResult(requestId, {
            success: true,
            data: {
              popupOpened: true,
              popupUrl: popupTab?.url ?? '',
              note: 'An OAuth popup window opened. Use waitForCondition:page-mutated or text-present to detect login completion on the original page.',
            },
          });
          return;
        }
        break;
      }

      case 'type_ref': {
        const ref = String(params.ref ?? '').replace('@', '');
        const text = String(params.text ?? '');
        const clearFirst = params.clearFirst !== false;
        results = await chrome.scripting.executeScript({ target: { tabId }, func: _pageTypeRef, args: [ref, text, clearFirst] });
        break;
      }

      case 'click': {
        const description = String(params.description ?? '');
        const winsBefore2 = await chrome.windows.getAll();
        const winIdsBefore2 = new Set(winsBefore2.map((w) => w.id));
        results = await chrome.scripting.executeScript({ target: { tabId }, func: _pageClick, args: [description] });
        await new Promise((r) => setTimeout(r, 700));
        const winsAfter2 = await chrome.windows.getAll();
        const newPopup2 = winsAfter2.find((w) => !winIdsBefore2.has(w.id) && w.type === 'popup');
        if (newPopup2) {
          const popupTab2 = newPopup2.tabs?.[0];
          sendBridgeResult(requestId, {
            success: true,
            data: {
              popupOpened: true,
              popupUrl: popupTab2?.url ?? '',
              note: 'An OAuth popup window opened. Use waitForCondition:page-mutated or text-present to detect login completion on the original page.',
            },
          });
          return;
        }
        break;
      }

      case 'scroll': {
        const direction = String(params.direction ?? 'down');
        const amount = Number(params.amount ?? 300);
        results = await chrome.scripting.executeScript({ target: { tabId }, func: _pageScroll, args: [direction, amount] });
        break;
      }

      case 'pressKey': {
        const key = String(params.key ?? 'Enter');
        results = await chrome.scripting.executeScript({ target: { tabId }, func: _pagePressKey, args: [key] });
        await new Promise((r) => setTimeout(r, 400));
        break;
      }

      case 'wait': {
        const condition = params.condition as { type: string; ref?: string; text?: string; substring?: string; ms?: number };
        const timeoutMs = Number(params.timeoutMs ?? 25000);

        // Handle delay directly (no DOM check needed)
        if (condition.type === 'delay') {
          const ms = Math.min(condition.ms ?? 1000, 30000);
          await new Promise((r) => setTimeout(r, ms));
          sendBridgeResult(requestId, { success: true, data: { elapsed: ms } });
          return;
        }

        // Poll DOM condition using executeScript
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const pollResults = await chrome.scripting.executeScript({
            target: { tabId },
            func: _pageCheckCondition,
            args: [condition],
          });
          const { met } = (pollResults[0]?.result ?? { met: false }) as { met: boolean };
          if (met) {
            sendBridgeResult(requestId, { success: true, data: { elapsed: Date.now() - start } });
            return;
          }
          await new Promise((r) => setTimeout(r, 600));
        }
        sendBridgeResult(requestId, { success: false, error: `Wait condition '${condition.type}' not met after ${timeoutMs}ms` });
        return;
      }

      default:
        sendBridgeResult(requestId, { success: false, error: `Unknown action: ${action}` });
        return;
    }

    const result = (results[0]?.result ?? { success: false, error: 'No result from page' }) as BridgeResult;
    sendBridgeResult(requestId, result);

  } catch (err) {
    const msg = String(err);
    // executeScript throws if tab is non-injectable (e.g. chrome://, pdf)
    sendBridgeResult(requestId, {
      success: false,
      error: msg.includes('Cannot access') || msg.includes('not allowed')
        ? `Cannot inject script on this page type. Navigate to a regular http/https website first.`
        : msg,
    });
  }
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

function connectWebSocket(uid: string, token: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  userId = uid;

  const backendUrl = (typeof VITE_BACKEND_URL !== 'undefined' ? VITE_BACKEND_URL : 'http://localhost:3000')
    .replace('http://', 'ws://')
    .replace('https://', 'wss://');

  ws = new WebSocket(`${backendUrl}/agent/ws?userId=${uid}&token=${token}`);

  ws.onopen = () => {
    console.log('DevFlow AI: WebSocket connected');
    reconnectDelay = 2000;
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };

  ws.onclose = () => {
    ws = null;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    console.log(`DevFlow AI: WS disconnected, retry in ${delay / 1000}s`);
    reconnectTimer = setTimeout(() => {
      chrome.storage.local.get(['userId', 'authToken'], (r) => {
        if (r.userId && r.authToken) connectWebSocket(r.userId as string, r.authToken as string);
      });
    }, delay);
  };

  ws.onerror = (e) => console.error('DevFlow AI WS error:', e);

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        type: string; sessionId: string; message: string; timestamp: string;
      };

      // Forward to sidepanel (type_ preserves server's original type)
      chrome.runtime.sendMessage({ ...msg, type_: msg.type, type: 'progress_update' }).catch(() => {});

      if (msg.type !== 'bridge_request') return;

      const { requestId, action, params } = JSON.parse(msg.message) as {
        requestId: string; action: string; params: Record<string, unknown>;
      };

      // Handle bridge request asynchronously.
      // We use void + a self-contained async function so the service worker
      // stays alive because of the outstanding chrome API promises inside it.
      void handleBridgeRequest(requestId, action, params);

    } catch (err) {
      console.error('WS onmessage error:', err);
    }
  };
}

async function handleBridgeRequest(
  requestId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<void> {
  try {
    // ── Screenshot ────────────────────────────────────────────────────────────
    if (action === 'screenshot') {
      const tab = await getTargetTab();
      chrome.tabs.captureVisibleTab(
        tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT,
        { format: 'png' },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendBridgeResult(requestId, { success: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendBridgeResult(requestId, {
            success: true,
            data: { screenshot: dataUrl, url: tab?.url ?? '', title: tab?.title ?? '' },
          });
        },
      );
      return;
    }

    // ── Open new tab ──────────────────────────────────────────────────────────
    if (action === 'newtab') {
      const url = params.url as string;
      chrome.tabs.create({ url, active: true }, (newTab) => {
        if (chrome.runtime.lastError || !newTab?.id) {
          sendBridgeResult(requestId, { success: false, error: chrome.runtime.lastError?.message ?? 'Could not create tab' });
          return;
        }
        lastActiveTabId = newTab.id;
        waitForLoad(newTab.id, requestId, url, 25_000);
      });
      return;
    }

    // ── Navigate current tab ──────────────────────────────────────────────────
    if (action === 'navigate') {
      const url = params.url as string;
      const tab = await getTargetTab();
      if (!tab?.id) {
        sendBridgeResult(requestId, { success: false, error: 'No active browser tab found. Open a webpage first.' });
        return;
      }
      chrome.tabs.update(tab.id, { url }, () => {
        if (chrome.runtime.lastError) {
          sendBridgeResult(requestId, { success: false, error: chrome.runtime.lastError.message ?? 'Navigation failed' });
          return;
        }
        lastActiveTabId = tab.id!;
        waitForLoad(tab.id!, requestId, url, 20_000);
      });
      return;
    }

    // ── All page interactions via executeScript ────────────────────────────────
    const tab = await getTargetTab();
    if (!tab?.id) {
      sendBridgeResult(requestId, { success: false, error: 'No active browser tab found. Open a webpage first.' });
      return;
    }
    if (!isHttp(tab.url)) {
      sendBridgeResult(requestId, {
        success: false,
        error: `Cannot interact with ${(tab.url ?? '').split(':')[0]}:// pages. Navigate to an http/https site first.`,
      });
      return;
    }

    await runInTab(tab.id, requestId, action, params);

  } catch (err) {
    sendBridgeResult(requestId, { success: false, error: String(err) });
  }
}

// ─── Wait for tab navigation to complete ─────────────────────────────────────

function waitForLoad(tabId: number, requestId: string, url: string, ms: number): void {
  let done = false;
  const finish = (note?: string) => {
    if (done) return;
    done = true;
    chrome.tabs.onUpdated.removeListener(listener);
    sendBridgeResult(requestId, { success: true, data: { navigated: url, tabId, ...(note ? { note } : {}) } });
  };
  const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
    if (id === tabId && info.status === 'complete') finish();
  };
  chrome.tabs.onUpdated.addListener(listener);
  setTimeout(() => finish('timeout'), ms);
}

// ─── Chrome event listeners ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('DevFlow AI: installed');
  chrome.sidePanel.setOptions({ enabled: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
});

// Keep service worker alive while sidepanel is open (port from SidePanel component)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    port.onDisconnect.addListener(() => {/* sidepanel closed */});
  }
});

chrome.runtime.onMessage.addListener(
  (msg: { type: string; userId?: string; token?: string; url?: string }, _sender, sendResponse) => {
    if (msg.type === 'auth_changed' && msg.userId && msg.token) {
      connectWebSocket(msg.userId, msg.token);
      sendResponse({ success: true });
    } else if (msg.type === 'auth_logout') {
      ws?.close(); ws = null; userId = null;
      sendResponse({ success: true });
    } else if (msg.type === 'get_ws_status') {
      sendResponse({ connected: ws?.readyState === WebSocket.OPEN, userId });
    } else if (msg.type === 'take_screenshot') {
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
        sendResponse({ success: true, dataUrl });
      });
      return true;
    } else if (msg.type === 'devflow_navigate' && msg.url) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const t = tabs[0];
        if (t?.id) { chrome.tabs.update(t.id, { url: msg.url as string }); sendResponse({ success: true }); }
        else sendResponse({ success: false, error: 'No active tab' });
      });
      return true;
    }
    return true;
  },
);

// Reconnect on startup
chrome.storage.local.get(['userId', 'authToken'], (r) => {
  if (r.userId && r.authToken) connectWebSocket(r.userId as string, r.authToken as string);
});

export {};
