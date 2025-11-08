import { useState, useEffect } from "react";
import {
  loadAIConfig,
  saveAIConfig,
  checkAIAvailability,
  type AIConfig,
} from "../services/aiService";

export default function AISettings() {
  const [config, setConfig] = useState<AIConfig>({
    enabled: false,
    apiKey: '',
  });
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAndCheck = async () => {
      await loadConfig();
      if (config.enabled) {
        await checkAvailability();
      }
    };

    loadAndCheck();

    // Listen for changes from dashboard settings
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "local" && changes.clipsy_ai_config) {
        const newConfig = changes.clipsy_ai_config.newValue as AIConfig;
        if (newConfig) {
          setConfig(newConfig);
          if (newConfig.enabled) {
            checkAvailability();
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const loadConfig = async () => {
    const loaded = await loadAIConfig();
    setConfig(loaded);
  };

  const checkAvailability = async () => {
    setChecking(true);
    setError(null);

    try {
      const result = await checkAIAvailability();
      setAvailable(result.available);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setAvailable(false);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setChecking(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    const updated = { ...config, enabled };
    setConfig(updated);
    await saveAIConfig(updated);
    if (enabled) {
      await checkAvailability();
    }
  };

  const handleAPIKeyChange = async (apiKey: string) => {
    const updated = { ...config, apiKey };
    setConfig(updated);
    await saveAIConfig(updated);
    if (updated.enabled) {
      await checkAvailability();
    }
  };

  return (
    <div
      style={{
        padding: "16px",
        background: "#f8f9fa",
        borderRadius: "8px",
        border: "1px solid #dee2e6",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "16px",
            fontWeight: 600,
            color: "#222",
          }}
        >
          AI Settings (Google Gemini)
        </h3>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span style={{ fontSize: "13px", color: "#495057" }}>Enable AI</span>
        </label>
      </div>

      {config.enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* API Key Input */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 500,
                color: "#495057",
                marginBottom: "4px",
              }}
            >
              Google Gemini API Key
            </label>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => handleAPIKeyChange(e.target.value)}
              placeholder="Enter your API key"
              style={{
                width: "100%",
                padding: "6px 10px",
                border: "1px solid #ced4da",
                borderRadius: "4px",
                fontSize: "12px",
                fontFamily: "monospace",
              }}
            />
            <p
              style={{
                fontSize: "11px",
                color: "#6c757d",
                marginTop: "4px",
                marginBottom: 0,
              }}
            >
              Get your API key from{" "}
              <a
                href="https://makersuite.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#0066cc", textDecoration: "none" }}
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* API Status */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#666",
                  marginBottom: "4px",
                }}
              >
                Status:
              </div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: available ? "#28a745" : "#dc3545",
                }}
              >
                {checking
                  ? "Checking..."
                  : available
                  ? "Available"
                  : "Not Available"}
              </div>
            </div>
            <button
              onClick={() => checkAvailability()}
              disabled={checking || !config.apiKey}
              style={{
                padding: "6px 12px",
                background: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: checking || !config.apiKey ? "not-allowed" : "pointer",
                fontSize: "12px",
                opacity: checking || !config.apiKey ? 0.6 : 1,
              }}
            >
              {checking ? "Checking..." : "Check"}
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: "8px",
                background: "#f8d7da",
                borderRadius: "4px",
                border: "1px solid #f5c6cb",
                color: "#721c24",
                fontSize: "12px",
              }}
            >
              {error}
            </div>
          )}

          {!available && config.enabled && config.apiKey && (
            <div
              style={{
                padding: "8px",
                background: "#fff3cd",
                borderRadius: "4px",
                border: "1px solid #ffeaa7",
                color: "#856404",
                fontSize: "12px",
              }}
            >
              <strong>API key validation failed.</strong> Please check that your API key is correct.
            </div>
          )}

          {available && config.enabled && (
            <div
              style={{
                padding: "8px",
                background: "#d1ecf1",
                borderRadius: "4px",
                border: "1px solid #bee5eb",
                color: "#0c5460",
                fontSize: "12px",
              }}
            >
              AI suggestions enabled. All usage is billed to your Google account. Free tier: 60 requests/minute.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
