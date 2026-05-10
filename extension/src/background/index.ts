// Background service worker

let ws: WebSocket | null = null;
let userId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2000; // exponential back-off: 2s → 4s → 8s → … → 60s

// Declare VITE_BACKEND_URL as it's injected by Vite
declare const VITE_BACKEND_URL: string;

// ─── Track the last active HTTP/HTTPS tab ───────────────────────────────────
// chrome.tabs.query({ active: true, currentWindow: true }) is unreliable from a
// service worker — it returns the sidepanel "window" (which has no tabs) once
// the sidepanel gains focus.  Instead we track the last HTTP tab ourselves.

let lastActiveTabId: number | null = null;

function isHttpUrl(url?: string): boolean {
  return !!(url?.startsWith('http://') || url?.startsWith('https://'));
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (isHttpUrl(tab.url)) lastActiveTabId = tabId;
  });
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active && isHttpUrl(tab.url)) {
    lastActiveTabId = tabId;
  }
});

// ─── Find the best target tab for bridge actions ─────────────────────────────

function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    // 1. Try the last tab we tracked
    if (lastActiveTabId !== null) {
      const id = lastActiveTabId;
      chrome.tabs.get(id, (tab) => {
        if (!chrome.runtime.lastError && isHttpUrl(tab?.url)) {
          resolve(tab);
          return;
        }
        lastActiveTabId = null; // stale — forget it
        findFallbackTab(resolve);
      });
    } else {
      findFallbackTab(resolve);
    }
  });
}

function findFallbackTab(resolve: (t: chrome.tabs.Tab | null) => void): void {
  // 2. Active tab in the last focused window
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const httpTab = tabs.find((t) => isHttpUrl(t.url));
    if (httpTab) {
      lastActiveTabId = httpTab.id ?? null;
      resolve(httpTab);
      return;
    }
    // 3. Any active HTTP tab across all windows
    chrome.tabs.query({ active: true }, (allTabs) => {
      const anyHttp = allTabs.find((t) => isHttpUrl(t.url));
      if (anyHttp) {
        lastActiveTabId = anyHttp.id ?? null;
        resolve(anyHttp);
        return;
      }
      resolve(null);
    });
  });
}

// ─── Send a bridge result back to the backend ────────────────────────────────

function sendBridgeResult(
  requestId: string,
  result: { success: boolean; data?: Record<string, unknown>; error?: string },
): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'bridge_result', requestId, ...result }));
  }
}

// ─── Route an action to the content script with auto-injection fallback ──────

function sendToContentScript(
  tabId: number,
  msg: object,
  requestId: string,
): void {
  const trySend = (attempt: number) => {
    chrome.tabs.sendMessage(
      tabId,
      msg,
      (response: { success: boolean; data?: Record<string, unknown>; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message ?? '';
          const canInject =
            attempt === 1 &&
            (err.includes('Receiving end does not exist') ||
              err.includes('Could not establish connection'));

          if (canInject) {
            // Inject content script once, then retry
            chrome.scripting
              .executeScript({ target: { tabId }, files: ['content.js'] })
              .then(() => setTimeout(() => trySend(2), 400))
              .catch((e: unknown) =>
                sendBridgeResult(requestId, {
                  success: false,
                  error: `Content script injection failed: ${String(e)}`,
                }),
              );
          } else {
            sendBridgeResult(requestId, { success: false, error: err || 'Content script error' });
          }
          return;
        }
        sendBridgeResult(
          requestId,
          response ?? { success: false, error: 'No response from content script' },
        );
      },
    );
  };
  trySend(1);
}

// ─── WebSocket connection ─────────────────────────────────────────────────────

function connectWebSocket(uid: string, token: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  userId = uid;
  const backendUrl = (
    typeof VITE_BACKEND_URL !== 'undefined' ? VITE_BACKEND_URL : 'http://localhost:3000'
  )
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
    console.log(`DevFlow AI: WS disconnected, retrying in ${delay / 1000}s…`);
    reconnectTimer = setTimeout(() => {
      chrome.storage.local.get(['userId', 'authToken'], (r) => {
        if (r.userId && r.authToken) {
          connectWebSocket(r.userId as string, r.authToken as string);
        }
      });
    }, delay);
  };

  ws.onerror = (err) => console.error('DevFlow AI WebSocket error:', err);

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        type: string;
        sessionId: string;
        message: string;
        timestamp: string;
      };

      // Forward all messages to sidepanel (type_ preserves original server type)
      chrome.runtime
        .sendMessage({ ...msg, type_: msg.type, type: 'progress_update' })
        .catch(() => {/* sidepanel may not be open */});

      if (msg.type !== 'bridge_request') return;

      const bridgeReq = JSON.parse(msg.message) as {
        requestId: string;
        action: string;
        params: Record<string, unknown>;
      };
      const { requestId, action, params } = bridgeReq;

      // ── Screenshot ────────────────────────────────────────────────────────
      if (action === 'screenshot') {
        getTargetTab().then((tab) => {
          const captureOpts: Parameters<typeof chrome.tabs.captureVisibleTab>[1] = { format: 'png' };
          const captureWindowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
          chrome.tabs.captureVisibleTab(captureWindowId, captureOpts, (dataUrl) => {
            if (chrome.runtime.lastError) {
              sendBridgeResult(requestId, { success: false, error: chrome.runtime.lastError.message ?? 'Screenshot failed' });
              return;
            }
            sendBridgeResult(requestId, {
              success: true,
              data: { screenshot: dataUrl, url: tab?.url ?? '', title: tab?.title ?? '' },
            });
          });
        }).catch(() => sendBridgeResult(requestId, { success: false, error: 'Screenshot: could not find target tab' }));
        return;
      }

      // ── Navigate current tab ──────────────────────────────────────────────
      if (action === 'navigate') {
        const url = params.url as string;
        getTargetTab().then((tab) => {
          if (!tab?.id) {
            sendBridgeResult(requestId, {
              success: false,
              error: 'No active browser tab found. Please open a webpage first.',
            });
            return;
          }
          const tabId = tab.id;
          chrome.tabs.update(tabId, { url }, () => {
            if (chrome.runtime.lastError) {
              sendBridgeResult(requestId, {
                success: false,
                error: chrome.runtime.lastError.message ?? 'Navigation failed',
              });
              return;
            }
            lastActiveTabId = tabId;
            waitForTabLoad(tabId, requestId, url, 20_000);
          });
        }).catch(() => sendBridgeResult(requestId, { success: false, error: 'navigate: could not find target tab' }));
        return;
      }

      // ── Open URL in a new tab ─────────────────────────────────────────────
      if (action === 'newtab') {
        const url = params.url as string;
        chrome.tabs.create({ url, active: true }, (newTab) => {
          if (chrome.runtime.lastError || !newTab?.id) {
            sendBridgeResult(requestId, {
              success: false,
              error: chrome.runtime.lastError?.message ?? 'Could not create tab',
            });
            return;
          }
          lastActiveTabId = newTab.id;
          waitForTabLoad(newTab.id, requestId, url, 25_000);
        });
        return;
      }

      // ── Content-script actions (snapshot, click_ref, type_ref, wait, …) ──
      getTargetTab().then((tab) => {
        if (!tab?.id) {
          sendBridgeResult(requestId, {
            success: false,
            error: 'No active browser tab found. Please open a webpage first.',
          });
          return;
        }
        if (!isHttpUrl(tab.url)) {
          sendBridgeResult(requestId, {
            success: false,
            error: `Cannot interact with ${tab.url?.split(':')[0] ?? 'this'}: pages. Navigate to an http/https website first.`,
          });
          return;
        }
        sendToContentScript(
          tab.id,
          { type: 'devflow_action', requestId, action, params },
          requestId,
        );
      }).catch(() => sendBridgeResult(requestId, { success: false, error: 'Could not find target tab' }));

    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  };
}

// ─── Wait for a tab to finish loading, then send bridge_result ───────────────

function waitForTabLoad(
  tabId: number,
  requestId: string,
  url: string,
  timeoutMs: number,
): void {
  let done = false;

  const finish = (note?: string) => {
    if (done) return;
    done = true;
    chrome.tabs.onUpdated.removeListener(listener);
    sendBridgeResult(requestId, {
      success: true,
      data: { navigated: url, tabId, ...(note ? { note } : {}) },
    });
  };

  const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
    if (updatedTabId === tabId && info.status === 'complete') finish();
  };

  chrome.tabs.onUpdated.addListener(listener);
  setTimeout(() => finish('timeout'), timeoutMs);
}

// ─── Chrome event listeners ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('DevFlow AI extension installed');
  chrome.sidePanel.setOptions({ enabled: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
});

// Keep the MV3 service worker alive while the sidepanel is open.
// The sidepanel connects a port on load and disconnects on close.
// A connected port prevents Chrome from killing the service worker.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    // Just holding the port reference keeps the service worker alive.
    port.onDisconnect.addListener(() => {/* sidepanel closed */});
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; userId?: string; token?: string; url?: string },
    _sender,
    sendResponse,
  ) => {
    if (message.type === 'auth_changed' && message.userId && message.token) {
      connectWebSocket(message.userId, message.token);
      sendResponse({ success: true });
    } else if (message.type === 'auth_logout') {
      ws?.close();
      ws = null;
      userId = null;
      sendResponse({ success: true });
    } else if (message.type === 'get_ws_status') {
      sendResponse({ connected: ws?.readyState === WebSocket.OPEN, userId });
    } else if (message.type === 'take_screenshot') {
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
        sendResponse({ success: true, dataUrl });
      });
      return true; // async
    } else if (message.type === 'devflow_navigate' && message.url) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0] ?? null;
        if (tab?.id) {
          chrome.tabs.update(tab.id, { url: message.url as string });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      });
      return true; // async
    }
    return true;
  },
);

// On startup, reconnect if we have stored credentials
chrome.storage.local.get(['userId', 'authToken'], (result) => {
  if (result.userId && result.authToken) {
    connectWebSocket(result.userId as string, result.authToken as string);
  }
});

export {};
