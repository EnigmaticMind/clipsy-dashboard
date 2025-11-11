// Entry point for Google Sheets side panel
// Gets the sheet ID from the current tab URL and renders the side panel

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../contexts/ToastContext';
import '../index.css';
import GoogleSheetsSidePanel from './googleSheetsSidePanel';

// Get current Google Sheet ID from URL
async function getCurrentSheetId(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url) {
      return null;
    }

    // Extract sheet ID from URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
    const match = tab.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error getting current tab:', error);
    return null;
  }
}

// Initialize the side panel
async function init() {
  const sheetId = await getCurrentSheetId();
  
  if (!sheetId) {
    const root = createRoot(document.getElementById('root')!);
    root.render(
      <StrictMode>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p>Please navigate to a Google Sheet.</p>
        </div>
      </StrictMode>
    );
    return;
  }

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <ToastProvider>
        <GoogleSheetsSidePanel sheetId={sheetId} />
      </ToastProvider>
    </StrictMode>
  );
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

