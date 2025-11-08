import { useState, useEffect } from "react";
import { useToast } from "../contexts/ToastContext";
import { loadAIConfig, saveAIConfig, checkAIAvailability, getEngineDebugInfo, type EngineDebugInfo } from "../services/aiService";
import type { AIConfig } from "../services/aiService";

// Check if we're in development mode
const isDev = import.meta.env?.MODE === 'development' || import.meta.env?.DEV === true;

export default function SettingsPage() {
  const toast = useToast();
  const [autoOpen, setAutoOpen] = useState(true);
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    enabled: false,
    apiKey: '',
  });
  const [aiAvailable, setAiAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [debugInfo, setDebugInfo] = useState<EngineDebugInfo | null>(null);
  const [loadingDebugInfo, setLoadingDebugInfo] = useState(false);

  const loadSettings = async () => {
    // Load auto-open setting
    chrome.storage.local.get(["clipsy_auto_open_panel"], (result) => {
      setAutoOpen(result.clipsy_auto_open_panel !== false);
    });

    // Load AI config
    const config = await loadAIConfig();
    setAiConfig(config);
    
    // Check AI availability if enabled
    if (config.enabled) {
      checkAvailability();
    }
  };

  const loadDebugInfo = async () => {
    if (!isDev) return;
    
    setLoadingDebugInfo(true);
    try {
      const info = await getEngineDebugInfo();
      setDebugInfo(info);
    } catch (err) {
      console.error('Failed to load debug info:', err);
    } finally {
      setLoadingDebugInfo(false);
    }
  };

  useEffect(() => {
    loadSettings();
    
    // Load debug info in dev mode
    if (isDev) {
      loadDebugInfo();
      // Poll for debug info updates every 2 seconds
      const debugInterval = setInterval(loadDebugInfo, 2000);
      return () => clearInterval(debugInterval);
    }

    // Listen for changes from side panel
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local') {
        if (changes.clipsy_auto_open_panel) {
          setAutoOpen(changes.clipsy_auto_open_panel.newValue !== false);
        }
        if (changes.clipsy_ai_config) {
          const newConfig = changes.clipsy_ai_config.newValue as AIConfig;
          if (newConfig) {
            setAiConfig(newConfig);
            if (newConfig.enabled) {
              checkAvailability();
              if (isDev) {
                loadDebugInfo();
              }
            }
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAvailability = async () => {
    setChecking(true);
    setError(null);

    try {
      const result = await checkAIAvailability();
      setAiAvailable(result.available);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setAiAvailable(false);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setChecking(false);
    }
  };

  const handleAutoOpenToggle = async (enabled: boolean) => {
    setAutoOpen(enabled);
    await chrome.storage.local.set({ clipsy_auto_open_panel: enabled });
    // Storage listener will update side panel automatically
  };

  const handleAIToggle = async (enabled: boolean) => {
    const updated = { ...aiConfig, enabled };
    setAiConfig(updated);
    await saveAIConfig(updated);
    // Storage listener will update side panel automatically
    if (enabled) {
      await checkAvailability();
    }
  };

  const handleAPIKeyChange = async (apiKey: string) => {
    const updated = { ...aiConfig, apiKey };
    setAiConfig(updated);
    await saveAIConfig(updated);
    // Storage listener will update side panel automatically
    if (updated.enabled) {
      await checkAvailability();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await chrome.storage.local.set({ clipsy_auto_open_panel: autoOpen });
      await saveAIConfig(aiConfig);
      toast.showSuccess("Settings saved successfully!");
    } catch (err) {
      toast.showError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        {/* Auto-Open Panel Setting */}
        <div className="border-b pb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Side Panel Settings
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-base font-medium text-gray-700">
                Auto-open Panel
              </label>
              <p className="text-sm text-gray-500 mt-1">
                Automatically open the Clipsy side panel when viewing an Etsy listing editor page
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoOpen}
                onChange={(e) => handleAutoOpenToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>

        {/* AI Settings */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            AI Suggestions (Google Gemini)
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Enable AI-powered SEO suggestions using Google's Gemini API. You'll need to provide your own API key - all usage is billed to your Google account. This is optional - rule-based suggestions will always be available.
          </p>

          <div className="space-y-4">
            {/* Enable AI Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-base font-medium text-gray-700">
                  Enable AI Suggestions
                </label>
                <p className="text-sm text-gray-500 mt-1">
                  Use Google Gemini API to enhance SEO suggestions with AI
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiConfig.enabled}
                  onChange={(e) => handleAIToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {aiConfig.enabled && (
              <div className="ml-4 pl-4 border-l-2 border-indigo-200 space-y-4">
                {/* API Key Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={aiConfig.apiKey || ''}
                    onChange={(e) => handleAPIKeyChange(e.target.value)}
                    placeholder="Enter your Google Gemini API key"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Get your API key from{' '}
                    <a
                      href="https://makersuite.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      Google AI Studio
                    </a>
                    . Free tier includes 60 requests per minute.
                  </p>
                </div>

                {/* API Status */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700">
                      API Status
                    </div>
                    <div
                      className={`text-sm mt-1 ${
                        aiAvailable ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {checking
                        ? "Checking..."
                        : aiAvailable
                        ? "Available"
                        : "Not Available"}
                    </div>
                  </div>
                  <button
                    onClick={() => checkAvailability()}
                    disabled={checking || !aiConfig.apiKey}
                    className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {checking ? "Checking..." : "Check"}
                  </button>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {!aiAvailable && aiConfig.enabled && aiConfig.apiKey && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      <strong>API key validation failed.</strong> Please check that your API key is correct and has access to the Gemini API.
                    </p>
                  </div>
                )}

                {aiAvailable && aiConfig.enabled && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-800">
                      <strong>AI suggestions enabled.</strong> Your API key is valid. All API usage is billed to your Google account. The free tier includes 60 requests per minute.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Debug Information (Development Only) */}
        {isDev && (
          <div className="pt-4 border-t">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Debug Information (Development Only)
            </h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 font-mono text-sm">
              {loadingDebugInfo ? (
                <div className="text-gray-500">Loading debug info...</div>
              ) : debugInfo ? (
                <>
                  <div>
                    <span className="text-gray-600">AI Enabled:</span>{" "}
                    <span className={debugInfo.hasEngine ? "text-green-600" : "text-red-600"}>
                      {debugInfo.hasEngine ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">API Key Set:</span>{" "}
                    <span className={debugInfo.apiKeySet ? "text-green-600" : "text-red-600"}>
                      {debugInfo.apiKeySet ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Available Models:</span>
                    <ul className="list-disc list-inside ml-2 mt-1 text-xs text-gray-700">
                      {debugInfo.availableModels.length > 0 ? (
                        debugInfo.availableModels.map((model, idx) => (
                          <li key={idx} className="break-all">{model}</li>
                        ))
                      ) : (
                        <li className="text-gray-500">None detected</li>
                      )}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="text-gray-500">No debug info available</div>
              )}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

