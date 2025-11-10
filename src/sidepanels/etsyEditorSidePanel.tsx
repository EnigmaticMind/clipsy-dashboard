// Side panel component for Etsy listing editor
// This is a standalone version of ClipsyPanel that works in a side panel

import { useState, useEffect } from 'react';
import { ToastProvider } from '../contexts/ToastContext';
import ClipsyPanel from '../content-components/ClipsyPanel';
import { logger } from '../utils/logger';

interface EtsyEditorSidePanelProps {
  listingId: number;
}

function EtsyEditorSidePanelContent({ listingId }: EtsyEditorSidePanelProps) {
  const [listingData, setListingData] = useState<{
    title: string;
    description: string;
    tags: string[];
  } | null>(null);
  const [focusedInput, setFocusedInput] = useState<HTMLElement | null>(null);
  const [inputValue, setInputValue] = useState<string>('');

  // Fetch listing data
  useEffect(() => {
    const fetchListingData = async () => {
      try {
        // Request listing data from background script
        const response = await chrome.runtime.sendMessage({
          action: 'getListing',
          listingId: listingId,
        });

        if (response && response.success && response.data) {
          setListingData({
            title: response.data.title || '',
            description: response.data.description || '',
            tags: response.data.tags || [],
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch listing from API:', error);
      }
    };

    fetchListingData();
  }, [listingId]);

  // Listen for messages from content script about focused inputs
  useEffect(() => {
    const messageListener = (message: any, sender: chrome.runtime.MessageSender) => {
      if (message.action === 'inputFocused' && sender.tab) {
        setFocusedInput(null); // We can't pass HTMLElement through messages
        setInputValue(message.value || '');
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'auto' }}>
      <ClipsyPanel
        listingId={listingId}
        focusedInput={focusedInput}
        inputValue={inputValue}
        listingData={listingData}
        onClose={() => {
          // Close side panel
          chrome.sidePanel.setOptions({ enabled: false });
        }}
        onToggleAutoOpen={async (enabled: boolean) => {
          await chrome.storage.local.set({ clipsy_auto_open_panel: enabled });
        }}
      />
    </div>
  );
}

export default function EtsyEditorSidePanel({ listingId }: EtsyEditorSidePanelProps) {
  return (
    <ToastProvider>
      <EtsyEditorSidePanelContent listingId={listingId} />
    </ToastProvider>
  );
}
