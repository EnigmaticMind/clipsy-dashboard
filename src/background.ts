// Background service worker for Chrome extension
// Handles messages from content scripts and opens/closes side panels

// Simple logger for service worker (import.meta.env may not be available)
const logger = {
  log: (...args: unknown[]) => console.log('[Clipsy Background]', ...args),
  error: (...args: unknown[]) => console.error('[Clipsy Background]', ...args),
};

// In src/background.ts
chrome.action.onClicked.addListener(async () => {
  logger.log('Extension icon clicked, opening dashboard');
  // tab contains info about the active tab when icon was clicked
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html'),
  });
});

// // Check if URL matches Etsy listing editor pattern
// function isEtsyListingEditorUrl(url: string): boolean {
//   try {
//     const urlObj = new URL(url);
//     return (
//       urlObj.hostname === 'www.etsy.com' &&
//       urlObj.pathname.includes('/your/shops/me/listing-editor/edit/')
//     );
//   } catch {
//     return false;
//   }
// }

// // Check if URL matches Google Sheets pattern
// function isGoogleSheetsUrl(url: string): boolean {
//   try {
//     const urlObj = new URL(url);
//     return (
//       urlObj.hostname === 'docs.google.com' &&
//       urlObj.pathname.startsWith('/spreadsheets/d/')
//     );
//   } catch {
//     return false;
//   }
// }

// // Extract sheet ID from Google Sheets URL
// function extractSheetIdFromUrl(url: string): string | null {
//   try {
//     const urlObj = new URL(url);
//     const match = urlObj.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
//     return match ? match[1] : null;
//   } catch {
//     return null;
//   }
// }

// // Check if a Google Sheet ID is a Clipsy sheet by checking the title
// async function isClipsySheet(sheetId: string): Promise<boolean> {
//   try {
//     // Get Google Sheets access token
//     // We need to use chrome.identity.getAuthToken since we're in a service worker
//     return new Promise((resolve) => {
//       chrome.identity.getAuthToken(
//         {
//           interactive: false,
//           scopes: [
//             'https://www.googleapis.com/auth/spreadsheets',
//             'https://www.googleapis.com/auth/drive.readonly'
//           ]
//         },
//         async (token) => {
//           if (chrome.runtime.lastError || !token) {
//             logger.error('Failed to get Google token for sheet check:', chrome.runtime.lastError?.message);
//             resolve(false);
//             return;
//           }

//           try {
//             // Fetch spreadsheet metadata to get the title
//             const response = await fetch(
//               `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`,
//               {
//                 headers: {
//                   'Authorization': `Bearer ${token}`
//                 }
//               }
//             );

//             if (!response.ok) {
//               logger.error('Failed to fetch spreadsheet metadata:', response.statusText);
//               resolve(false);
//               return;
//             }

//             const data = await response.json();
//             const title = data.properties?.title || '';
            
//             // Check if title contains "Clipsy Listings"
//             const isClipsy = title.includes('Clipsy Listings');
//             logger.log(`Sheet "${title}" is ${isClipsy ? 'a' : 'not a'} Clipsy sheet`);
//             resolve(isClipsy);
//           } catch (error) {
//             logger.error('Error checking sheet title:', error);
//             resolve(false);
//           }
//         }
//       );
//     });
//   } catch (error) {
//     logger.error('Error checking if sheet is Clipsy sheet:', error);
//     return false;
//   }
// }

// // Handle tab URL updates (for full page navigations)
// chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//   logger.log('Tab updated:', tabId, changeInfo, tab);
//   // Only process when URL changes and tab is complete
//   if (!changeInfo.url || changeInfo.status !== 'complete') {
//     return;
//   }

//   const url = changeInfo.url;

//   // Check for Etsy listing editor
//   if (isEtsyListingEditorUrl(url)) {
//     logger.log('Detected Etsy listing editor URL:', url);
//     await enableSidePanelForTab(tabId, 'etsy');
//     return;
//   }

//   // Check for Google Sheets
//   if (isGoogleSheetsUrl(url)) {
//     const sheetId = extractSheetIdFromUrl(url);
//     if (sheetId) {
//       const isClipsy = await isClipsySheet(sheetId);
//       if (isClipsy) {
//         logger.log('Detected Clipsy Google Sheets URL:', url);
//         await enableSidePanelForTab(tabId, 'googleSheets');
//         return;
//       }
//     }
//     // Not a Clipsy sheet or couldn't extract ID - disable side panel
//     await disableSidePanelForTab(tabId);
//     return;
//   }

//   // Not on a matching page - disable side panel
//   await disableSidePanelForTab(tabId);
// });

// // Enable side panel for a specific tab (don't open it - requires user gesture)
// async function enableSidePanelForTab(tabId: number, panelType: 'etsy' | 'googleSheets'): Promise<void> {
//   try {
//     const path = panelType === 'etsy' 
//       ? 'sidepanel-etsy.html' 
//       : 'sidepanel-google-sheets.html';

//     await chrome.sidePanel.setOptions({
//       tabId: tabId,
//       path: path,
//       enabled: true,
//     });
    
//     // Show badge to indicate side panel is available
//     await chrome.action.setBadgeText({
//       tabId: tabId,
//       text: '●',
//     });
//     await chrome.action.setBadgeBackgroundColor({
//       tabId: tabId,
//       color: '#6366f1', // Indigo color
//     });
    
//     logger.log(`Side panel enabled for ${panelType} on tab ${tabId}`);
//   } catch (error) {
//     logger.error(`Failed to set ${panelType} side panel options:`, error);
//   }
// }

// // Open side panel for a specific tab (called in response to user gesture)
// async function openSidePanelForTab(tabId: number, panelType: 'etsy' | 'googleSheets'): Promise<void> {
//   try {
//     const path = panelType === 'etsy' 
//       ? 'sidepanel-etsy.html' 
//       : 'sidepanel-google-sheets.html';

//     await chrome.sidePanel.setOptions({
//       tabId: tabId,
//       path: path,
//       enabled: true,
//     });
    
//     // Now we can open because it's in response to user clicking the icon
//     await chrome.sidePanel.open({ tabId });
//     logger.log(`Opened ${panelType} side panel for tab:`, tabId);
//   } catch (error) {
//     logger.error(`Failed to open ${panelType} side panel:`, error);
//   }
// }

// // Disable side panel for a specific tab and remove badge
// async function disableSidePanelForTab(tabId: number): Promise<void> {
//   try {
//     await chrome.sidePanel.setOptions({
//       tabId: tabId,
//       enabled: false,
//     });
    
//     // Remove badge
//     await chrome.action.setBadgeText({
//       tabId: tabId,
//       text: '',
//     });
    
//     logger.log(`Disabled side panel for tab:`, tabId);
//   } catch (error) {
//     logger.error(`Failed to disable side panel:`, error);
//   }
// }

// // Handle messages from content scripts
// chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
//   logger.log('Message received:', message);
//   if (message.action === 'getListing') {
//     // Handle getListing request (existing functionality)
//     // This can be implemented if needed
//     sendResponse({ success: false, error: 'Not implemented' });
//     return true;
//   }

//   if (message.action === 'openDashboard') {
//     // Open dashboard window
//     chrome.windows.create({
//       url: chrome.runtime.getURL('dashboard.html'),
//       type: 'popup',
//       width: 1200,
//       height: 800,
//     });
//     sendResponse({ success: true });
//     return true;
//   }

//   if (message.action === 'checkIfClipsySheet') {
//     // Check if a sheet is a Clipsy sheet
//     isClipsySheet(message.sheetId).then((isClipsy) => {
//       sendResponse({ isClipsy });
//     });
//     return true;
//   }

//   if (message.action === 'enableSidePanel') {
//     // Enable side panel - called by content scripts (shows badge)
//     const tabId = _sender.tab?.id;
//     if (!tabId) {
//       sendResponse({ success: false, error: 'No tab ID' });
//       return true;
//     }

//     const panelType = message.type; // 'etsy' or 'googleSheets'
//     enableSidePanelForTab(tabId, panelType).then(() => {
//       sendResponse({ success: true });
//     }).catch((error: unknown) => {
//       sendResponse({ success: false, error: String(error) });
//     });

//     return true; // Keep channel open for async response
//   }

//   if (message.action === 'disableSidePanel') {
//     // Disable side panel - called by content scripts (removes badge)
//     const tabId = _sender.tab?.id;
//     if (!tabId) {
//       sendResponse({ success: false, error: 'No tab ID' });
//       return true;
//     }

//     disableSidePanelForTab(tabId).then(() => {
//       sendResponse({ success: true });
//     }).catch((error: unknown) => {
//       sendResponse({ success: false, error: String(error) });
//     });

//     return true; // Keep channel open for async response
//   }

//   return false;
// });

// // Handle extension icon click - open dashboard or side panel
// chrome.action.onClicked.addListener(async (tab) => {
//   if (!tab.id || !tab.url) {
//     // No active tab, open dashboard
//     chrome.tabs.create({
//       url: chrome.runtime.getURL('dashboard.html'),
//     });
//     return;
//   }

//   const url = tab.url;

//   // Check if we're on a page that should show a side panel
//   if (isEtsyListingEditorUrl(url)) {
//     // Open Etsy side panel
//     await openSidePanelForTab(tab.id, 'etsy');
//     return;
//   }

//   if (isGoogleSheetsUrl(url)) {
//     const sheetId = extractSheetIdFromUrl(url);
//     if (sheetId) {
//       const isClipsy = await isClipsySheet(sheetId);
//       if (isClipsy) {
//         // Open Google Sheets side panel
//         await openSidePanelForTab(tab.id, 'googleSheets');
//         return;
//       }
//     }
//   }

//   // Not on a matching page, open dashboard
//   chrome.tabs.create({
//     url: chrome.runtime.getURL('dashboard.html'),
//   });
// });

logger.log('Background service worker initialized');

