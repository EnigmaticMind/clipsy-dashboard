// Default side panel (shown when no specific side panel is configured)

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function DefaultSidePanel() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
        Clipsy
      </h2>
      <p style={{ color: '#666', marginBottom: '16px' }}>
        Navigate to an Etsy listing editor or Google Sheet to get started.
      </p>
      <button
        onClick={() => {
          chrome.windows.create({
            url: chrome.runtime.getURL('dashboard.html'),
            type: 'popup',
            width: 1200,
            height: 800,
          });
        }}
        style={{
          padding: '12px 24px',
          backgroundColor: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: '600',
        }}
      >
        Open Dashboard
      </button>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <DefaultSidePanel />
  </StrictMode>
);

