// Background service worker

let ws: WebSocket | null = null;
let userId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2000; // exponential backoff: 2s → 4s → 8s → … → 60s

// Declare VITE_BACKEND_URL as it's injected by Vite
declare const VITE_BACKEND_URL: string;

function connectWebSocket(uid: string, token: string) {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  userId = uid;
  const backendUrl = (typeof VITE_BACKEND_URL !== 'undefined' ? VITE_BACKEND_URL : 'http://localhost:3000')
    .replace('http://', 'ws://')
    .replace('https://', 'wss://');

  ws = new WebSocket(`${backendUrl}/agent/ws?userId=${uid}&token=${token}`);

  ws.onopen = () => {
    console.log('DevFlow AI: WebSocket connected');
    reconnectDelay = 2000; // reset backoff on successful connection
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };

  ws.onclose = () => {
    ws = null;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    console.log(`DevFlow AI: WebSocket disconnected, retrying in ${delay / 1000}s...`);
    reconnectTimer = setTimeout(() => {
      chrome.storage.local.get(['userId', 'authToken'], (result) => {
        if (result.userId && result.authToken) {
          connectWebSocket(result.userId as string, result.authToken as string);
        }
      });
    }, delay);
  };

  ws.onerror = (err) => {
    console.error('DevFlow AI WebSocket error:', err);
  };

  ws.onmessage = async (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        type: string;
        sessionId: string;
        message: string;
        timestamp: string;
      };

      // Forward progress messages to sidepanel
      // Preserve the original server `type` as `type_` so the sidepanel can
      // distinguish 'complete' / 'error' / 'tool_start' etc., while `type`
      // stays 'progress_update' so the sidepanel listener fires.
      chrome.runtime.sendMessage({ ...msg, type_: msg.type, type: 'progress_update' }).catch(() => {
        // Sidepanel might not be open
      });

      // Handle bridge requests (backend wants browser to do something)
      if (msg.type === 'bridge_request') {
        const bridgeReq = JSON.parse(msg.message) as {
          requestId: string;
          action: string;
          params: Record<string, unknown>;
        };

        if (bridgeReq.action === 'screenshot') {
          // Take screenshot using Chrome API
          chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const result = {
                type: 'bridge_result',
                requestId: bridgeReq.requestId,
                success: true,
                data: {
                  screenshot: dataUrl,
                  url: tabs[0]?.url || '',
                  title: tabs[0]?.title || '',
                },
              };
              ws?.send(JSON.stringify(result));
            });
          });
        } else if (bridgeReq.action === 'navigate') {
          // Navigate active tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              const tabId = tabs[0].id;
              chrome.tabs.update(tabId, { url: bridgeReq.params.url as string }, () => {
                // Wait for page load then respond
                const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
                  if (updatedTabId === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    ws?.send(
                      JSON.stringify({
                        type: 'bridge_result',
                        requestId: bridgeReq.requestId,
                        success: true,
                        data: { navigated: bridgeReq.params.url },
                      }),
                    );
                  }
                };
                chrome.tabs.onUpdated.addListener(listener);
                // Timeout after 15s
                setTimeout(() => {
                  chrome.tabs.onUpdated.removeListener(listener);
                  ws?.send(
                    JSON.stringify({
                      type: 'bridge_result',
                      requestId: bridgeReq.requestId,
                      success: true,
                      data: { navigated: bridgeReq.params.url, note: 'timeout' },
                    }),
                  );
                }, 15000);
              });
            }
          });
        } else {
          // Forward other actions to content script (with auto-injection fallback)
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab?.id) return;

            const tabId = tab.id;
            const tabUrl = tab.url ?? '';

            // Non-injectable pages: chrome://, about:, extension pages, etc.
            const isInjectable =
              tabUrl.startsWith('http://') ||
              tabUrl.startsWith('https://') ||
              tabUrl.startsWith('file://');

            if (!isInjectable) {
              ws?.send(
                JSON.stringify({
                  type: 'bridge_result',
                  requestId: bridgeReq.requestId,
                  success: false,
                  error: `Cannot run on this page (${tabUrl.split(':')[0]}:// pages are restricted). Please navigate to a regular website first.`,
                }),
              );
              return;
            }

            const actionMsg = {
              type: 'devflow_action',
              requestId: bridgeReq.requestId,
              action: bridgeReq.action,
              params: bridgeReq.params,
            };

            // Helper: send message and return result via callback
            const trySend = (
              onResult: (result: { success: boolean; data?: Record<string, unknown>; error?: string }) => void,
            ) => {
              chrome.tabs.sendMessage(
                tabId,
                actionMsg,
                (response: { success: boolean; data?: Record<string, unknown>; error?: string } | undefined) => {
                  if (chrome.runtime.lastError) {
                    onResult({ success: false, error: chrome.runtime.lastError.message ?? 'Content script error' });
                  } else {
                    onResult(response ?? { success: false, error: 'No response from content script' });
                  }
                },
              );
            };

            // First attempt
            trySend((result) => {
              const errMsg = result.error ?? '';
              const needsInjection =
                !result.success &&
                (errMsg.includes('Receiving end does not exist') ||
                  errMsg.includes('Could not establish connection') ||
                  errMsg.includes('No response from content script'));

              if (!needsInjection) {
                // Success or a real tool error — send as-is
                ws?.send(
                  JSON.stringify({
                    type: 'bridge_result',
                    requestId: bridgeReq.requestId,
                    ...result,
                  }),
                );
                return;
              }

              // Inject content script then retry
              chrome.scripting
                .executeScript({ target: { tabId }, files: ['content.js'] })
                .then(() => {
                  // Give the script 300 ms to initialise
                  setTimeout(() => {
                    trySend((retryResult) => {
                      ws?.send(
                        JSON.stringify({
                          type: 'bridge_result',
                          requestId: bridgeReq.requestId,
                          ...retryResult,
                        }),
                      );
                    });
                  }, 300);
                })
                .catch((injectErr: unknown) => {
                  ws?.send(
                    JSON.stringify({
                      type: 'bridge_result',
                      requestId: bridgeReq.requestId,
                      success: false,
                      error: `Content script injection failed: ${String(injectErr)}`,
                    }),
                  );
                });
            });
          });
        }
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('DevFlow AI extension installed');
  chrome.sidePanel.setOptions({ enabled: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for auth state changes from sidepanel
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
      if (ws) {
        ws.close();
        ws = null;
      }
      userId = null;
      sendResponse({ success: true });
    } else if (message.type === 'get_ws_status') {
      sendResponse({
        connected: ws?.readyState === WebSocket.OPEN,
        userId,
      });
    } else if (message.type === 'take_screenshot') {
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
        sendResponse({ success: true, dataUrl });
      });
      return true; // async
    } else if (message.type === 'devflow_navigate' && message.url) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.update(tabs[0].id, { url: message.url as string });
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
