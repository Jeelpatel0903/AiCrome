// Background service worker

let ws: WebSocket | null = null;
let userId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };

  ws.onclose = () => {
    console.log('DevFlow AI: WebSocket disconnected, reconnecting in 5s...');
    ws = null;
    reconnectTimer = setTimeout(() => {
      chrome.storage.local.get(['userId', 'authToken'], (result) => {
        if (result.userId && result.authToken) {
          connectWebSocket(result.userId as string, result.authToken as string);
        }
      });
    }, 5000);
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
      chrome.runtime.sendMessage({ ...msg, type: 'progress_update' }).catch(() => {
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
          // Forward other actions to content script
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(
                tabs[0].id,
                {
                  type: 'devflow_action',
                  requestId: bridgeReq.requestId,
                  action: bridgeReq.action,
                  params: bridgeReq.params,
                },
                (
                  response:
                    | { success: boolean; data?: Record<string, unknown>; error?: string }
                    | undefined,
                ) => {
                  const result = response || {
                    success: false,
                    error: 'No response from content script',
                  };
                  ws?.send(
                    JSON.stringify({
                      type: 'bridge_result',
                      requestId: bridgeReq.requestId,
                      ...result,
                    }),
                  );
                },
              );
            }
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
    message: { type: string; userId?: string; token?: string },
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
