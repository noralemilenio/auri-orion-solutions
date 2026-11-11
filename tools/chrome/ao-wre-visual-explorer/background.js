chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab?.windowId) return;
  const query = new URLSearchParams({tabId: String(tab.id), windowId: String(tab.windowId)});
  await chrome.windows.create({
    url: chrome.runtime.getURL(`visual.html?${query}`),
    type: 'popup',
    width: 690,
    height: 880,
    focused: true
  });
});
