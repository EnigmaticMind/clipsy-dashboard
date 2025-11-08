import { useState, useEffect } from "react";
import SEOSuggestions from "./SEOSuggestions";
import AISettings from "./AISettings";
import InputTracker from "./InputTracker";

interface ListingData {
  title: string;
  description: string;
  tags: string[];
}

interface ClipsyPanelProps {
  listingId: number;
  focusedInput: HTMLElement | null;
  inputValue: string;
  listingData?: ListingData | null;
  onClose: () => void;
  onToggleAutoOpen: (enabled: boolean) => Promise<void>;
}

export default function ClipsyPanel({
  listingId,
  focusedInput,
  inputValue,
  listingData,
  onClose,
  onToggleAutoOpen,
}: ClipsyPanelProps) {
  const [autoOpen, setAutoOpen] = useState(true);

  useEffect(() => {
    // Load auto-open preference
    const loadAutoOpen = () => {
      chrome.storage.local.get(["clipsy_auto_open_panel"], (result) => {
        setAutoOpen(result.clipsy_auto_open_panel !== false);
      });
    };

    // Load initially
    loadAutoOpen();

    // Listen for changes from dashboard settings
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "local" && changes.clipsy_auto_open_panel) {
        setAutoOpen(changes.clipsy_auto_open_panel.newValue !== false);
      }
    };

    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const handleToggleAutoOpen = async (enabled: boolean) => {
    setAutoOpen(enabled);
    await onToggleAutoOpen(enabled);
  };

  const handleBulkEditPreview = async (csvFile: File) => {
    // Store the CSV file in chrome.storage so the dashboard can pick it up
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;

      // Store CSV content and trigger dashboard to open with preview
      await chrome.storage.local.set({
        clipsy_pending_bulk_edit: {
          csvContent,
          filename: csvFile.name,
          timestamp: Date.now(),
        },
      });

      // Send message to background script to open dashboard window
      // Content scripts don't have access to chrome.windows API
      try {
        await chrome.runtime.sendMessage({
          action: "openDashboard",
        });
      } catch (error) {
        // Fallback: try to open in a new tab (content scripts can use window.open)
        window.open(chrome.runtime.getURL("dashboard.html"), "_blank");
      }
    };
    reader.readAsText(csvFile);
  };

  return (
    <div
      style={{
        padding: "20px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          paddingBottom: "16px",
          borderBottom: "1px solid #e5e5e5",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: 600,
            color: "#222",
          }}
        >
          Clipsy Assistant
        </h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label
            style={{
              fontSize: "12px",
              color: "#666",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <input
              type="checkbox"
              checked={autoOpen}
              onChange={(e) => handleToggleAutoOpen(e.target.checked)}
              style={{ marginRight: "4px" }}
            />
            Auto-open
          </label>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
              color: "#666",
              padding: "4px 8px",
            }}
            title="Hide panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Listing Info */}
      <div
        style={{
          marginBottom: "20px",
          padding: "12px",
          background: "#f5f5f5",
          borderRadius: "8px",
        }}
      >
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
          Listing ID
        </div>
        <div style={{ fontSize: "16px", fontWeight: 600, color: "#222" }}>
          {listingId}
        </div>
      </div>

      {/* Input Tracker with Bulk Edit Options */}
      <div style={{ marginBottom: "20px" }}>
        <InputTracker
          focusedInput={focusedInput}
          inputValue={inputValue}
          onGeneratePreview={handleBulkEditPreview}
        />
      </div>

      {/* SEO Suggestions */}
      {listingData && (
        <div style={{ marginTop: "20px" }}>
          <SEOSuggestions listingContext={listingData} />
        </div>
      )}

      {/* AI Settings */}
      <div style={{ marginTop: "20px" }}>
        <AISettings />
      </div>
    </div>
  );
}
