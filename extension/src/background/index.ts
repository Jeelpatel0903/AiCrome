chrome.runtime.onInstalled.addListener(() => {
  console.log('DevFlow AI extension installed');
  chrome.sidePanel.setOptions({ enabled: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Background received message:', message);
  sendResponse({ received: true });
  return true;
});

export {};
