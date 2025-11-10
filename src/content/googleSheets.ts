// Content script for Google Sheets
// Only activates for Clipsy-created sheets and opens the side panel

import { logger } from '../utils/logger';

// Extract sheet ID from current URL
function getSheetIdFromUrl(): string | null {
  try {
    const match = window.location.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Check if this is a Clipsy sheet by asking the background script
async function checkIfClipsySheet(sheetId: string): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkIfClipsySheet',
      sheetId: sheetId,
    });
    return response?.isClipsy === true;
  } catch (error) {
    logger.error('Error checking if sheet is Clipsy sheet:', error);
    return false;
  }
}

// Enable side panel for Google Sheets (shows badge)
async function enableSidePanel() {
  try {
    await chrome.runtime.sendMessage({
      action: 'enableSidePanel',
      type: 'googleSheets',
    });
    logger.log('Requested Google Sheets side panel to be enabled');
  } catch (error) {
    logger.error('Failed to request side panel enable:', error);
  }
}

// Disable side panel (removes badge)
async function disableSidePanel() {
  try {
    await chrome.runtime.sendMessage({
      action: 'disableSidePanel',
    });
    logger.log('Requested side panel to be disabled');
  } catch (error) {
    logger.error('Failed to request side panel disable:', error);
  }
}

// Main initialization
async function init() {
  const sheetId = getSheetIdFromUrl();
  if (!sheetId) {
    logger.log('Could not extract sheet ID from URL');
    await disableSidePanel();
    return;
  }

  logger.log('Checking if sheet is Clipsy sheet:', sheetId);
  const isClipsy = await checkIfClipsySheet(sheetId);
  
  if (isClipsy) {
    logger.log('Detected Clipsy sheet, enabling side panel');
    await enableSidePanel();
  } else {
    logger.log('Not a Clipsy sheet, disabling side panel');
    await disableSidePanel();
  }
}

// Monitor URL changes for SPA navigation
let lastUrl = window.location.href;
async function checkUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    logger.log('URL changed from', lastUrl, 'to', currentUrl);
    lastUrl = currentUrl;
    await init(); // Re-check if we should show/hide side panel
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  logger.log('Google Sheets content script loaded, initializing...');
  document.addEventListener('DOMContentLoaded', () => {
    init();
    // Monitor URL changes (for SPA navigation)
    setInterval(checkUrlChange, 500);
  });
} else {
  logger.log('Google Sheets content script already loaded, initializing...');
  init();
  // Monitor URL changes (for SPA navigation)
  setInterval(checkUrlChange, 500);
}

// Also listen for popstate events (back/forward navigation)
window.addEventListener('popstate', checkUrlChange);

// Intercept pushState and replaceState (for programmatic navigation)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(history, args);
  setTimeout(checkUrlChange, 0);
};

history.replaceState = function(...args) {
  originalReplaceState.apply(history, args);
  setTimeout(checkUrlChange, 0);
};

