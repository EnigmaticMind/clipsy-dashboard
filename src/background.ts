// Background service worker for Chrome extension
// Opens the dashboard when the extension icon is clicked

chrome.action.onClicked.addListener(() => {
  // Open the dashboard in a new tab
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html')
  });
});

// Optional: Handle extension installation
chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
  if (details.reason === 'install') {
    // Open dashboard on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
  }
});

