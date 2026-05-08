console.log('DevFlow AI content script loaded');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content script received message:', message);

  switch (message.action) {
    case 'ping':
      sendResponse({ success: true, url: window.location.href });
      break;
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return true;
});

export {};
