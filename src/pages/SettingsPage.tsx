import { useState, useEffect } from "react";
import { useToast } from "../contexts/ToastContext";
import {
  loadAIConfig,
  saveAIConfig,
  checkAIAvailability,
  getEngineDebugInfo,
} from "../services/aiService";
import type { AIConfig } from "../services/aiService";
import {
  checkGoogleSheetsAuthStatus,
  initGoogleOAuthFlow,
  removeToken as removeGoogleToken,
  checkGoogleSheetsOptOut,
} from "../services/googleSheetsOAuth";
import {
  checkAuthStatus,
  removeToken as removeEtsyToken,
  initOAuthFlow,
} from "../services/oauth";
import {
  getCustomSheetName,
  setCustomSheetName as saveCustomSheetName,
} from "../services/googleSheetsService";
import {
  isAnalyticsOptedOut,
  setAnalyticsOptOut,
} from "../services/analytics";
import { logger } from "../utils/logger";

// Check if we're in development mode
const isDev =
  import.meta.env?.MODE === "development" || import.meta.env?.DEV === true;

export default function SettingsPage() {
  const toast = useToast();
  const [autoOpen, setAutoOpen] = useState(true);
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    enabled: false,
    apiKey: "",
  });
  const [aiAvailable, setAiAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [googleSheetsConnected, setGoogleSheetsConnected] = useState(false);
  const [checkingGoogleSheets, setCheckingGoogleSheets] = useState(false);
  const [connectingGoogleSheets, setConnectingGoogleSheets] = useState(false);
  const [googleSheetsOptedOut, setGoogleSheetsOptedOut] = useState(false);
  const [customSheetName, setCustomSheetName] = useState<string>("");
  const [savingSheetName, setSavingSheetName] = useState(false);
  const [analyticsOptedOut, setAnalyticsOptedOut] = useState(false);
  const [etsyAuthenticated, setEtsyAuthenticated] = useState(false);
  const [checkingEtsy, setCheckingEtsy] = useState(false);
  const [connectingEtsy, setConnectingEtsy] = useState(false);

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

    // Check Google Sheets connection
    checkGoogleSheetsConnection();

    // Check Google Sheets opt-out status
    const optedOut = await checkGoogleSheetsOptOut();
    setGoogleSheetsOptedOut(optedOut);

    // Check Etsy authentication
    checkEtsyConnection();

    // Load custom sheet name
    const sheetName = await getCustomSheetName();
    setCustomSheetName(sheetName || "");

    // Load analytics opt-out status
    const analyticsOptOut = await isAnalyticsOptedOut();
    setAnalyticsOptedOut(analyticsOptOut);
  };

  const handleGoogleSheetsOptOutToggle = async (optedOut: boolean) => {
    setGoogleSheetsOptedOut(optedOut);
    await chrome.storage.local.set({ "clipsy:googleSheetsOptOut": optedOut });

    // If opting out and connected, disconnect
    if (optedOut && googleSheetsConnected) {
      await handleDisconnectGoogleSheets();
    }

    toast.showSuccess(
      optedOut
        ? "Google Sheets integration disabled"
        : "Google Sheets integration enabled"
    );
  };

  const handleSaveSheetName = async () => {
    setSavingSheetName(true);
    try {
      if (customSheetName.trim()) {
        await saveCustomSheetName(customSheetName.trim());
        toast.showSuccess(
          "Sheet name saved! This will be used for new sheets."
        );
      } else {
        // Clear custom name to use default
        await chrome.storage.local.remove("clipsy:googleSheetsFileName");
        toast.showSuccess("Sheet name reset to default.");
      }
    } catch (error) {
      logger.error("Error saving sheet name:", error);
      toast.showError("Failed to save sheet name. Please try again.");
    } finally {
      setSavingSheetName(false);
    }
  };

  const handleAnalyticsOptOutToggle = async (optedOut: boolean) => {
    setAnalyticsOptedOut(optedOut);
    await setAnalyticsOptOut(optedOut);
    toast.showSuccess(
      optedOut
        ? "Analytics disabled. Your usage data will no longer be tracked."
        : "Analytics enabled. Anonymous usage data will help us improve the extension."
    );
  };

  const checkGoogleSheetsConnection = async () => {
    setCheckingGoogleSheets(true);
    try {
      const authStatus = await checkGoogleSheetsAuthStatus();
      setGoogleSheetsConnected(authStatus.authenticated);
    } catch (error) {
      logger.error("Error checking Google Sheets connection:", error);
      setGoogleSheetsConnected(false);
    } finally {
      setCheckingGoogleSheets(false);
    }
  };

  const handleConnectGoogleSheets = async () => {
    try {
      setConnectingGoogleSheets(true);
      await initGoogleOAuthFlow();
      toast.showSuccess("Please complete authentication in the popup window.");
      // Check connection after a delay to allow OAuth to complete
      setTimeout(() => {
        checkGoogleSheetsConnection();
        setConnectingGoogleSheets(false);
      }, 2000);
    } catch (error) {
      logger.error("Google Sheets connection error:", error);
      setConnectingGoogleSheets(false);
      if (error instanceof Error) {
        if (error.message.includes("popup")) {
          toast.showError(
            "Authentication popup was blocked. Please allow popups and try again."
          );
        } else {
          toast.showError(`Connection failed: ${error.message}`);
        }
      } else {
        toast.showError("Failed to connect Google Sheets. Please try again.");
      }
    }
  };

  const handleDisconnectGoogleSheets = async () => {
    try {
      await removeGoogleToken();
      setGoogleSheetsConnected(false);
      toast.showSuccess("Google Sheets disconnected successfully.");
    } catch (error) {
      logger.error("Error disconnecting Google Sheets:", error);
      toast.showError("Failed to disconnect Google Sheets. Please try again.");
    }
  };

  const checkEtsyConnection = async () => {
    setCheckingEtsy(true);
    try {
      const authStatus = await checkAuthStatus();
      setEtsyAuthenticated(authStatus.authenticated);
    } catch (error) {
      logger.error("Error checking Etsy connection:", error);
      setEtsyAuthenticated(false);
    } finally {
      setCheckingEtsy(false);
    }
  };

  const handleConnectEtsy = async () => {
    try {
      setConnectingEtsy(true);
      await initOAuthFlow();
      toast.showSuccess("Please complete authentication in the popup window.");
      // Check connection after a delay to allow OAuth to complete
      setTimeout(() => {
        checkEtsyConnection();
        setConnectingEtsy(false);
      }, 2000);
    } catch (error) {
      logger.error("Etsy connection error:", error);
      setConnectingEtsy(false);
      if (error instanceof Error) {
        if (error.message.includes("popup")) {
          toast.showError(
            "Authentication popup was blocked. Please allow popups and try again."
          );
        } else {
          toast.showError(`Connection failed: ${error.message}`);
        }
      } else {
        toast.showError("Failed to connect to Etsy. Please try again.");
      }
    }
  };

  const handleDisconnectEtsy = async () => {
    try {
      await removeEtsyToken();
      setEtsyAuthenticated(false);
      toast.showSuccess("Etsy disconnected successfully. Please re-authenticate to continue using the extension.");
    } catch (error) {
      logger.error("Error disconnecting Etsy:", error);
      toast.showError("Failed to disconnect Etsy. Please try again.");
    }
  };

  const loadDebugInfo = async () => {
    if (!isDev) return;

    try {
      await getEngineDebugInfo();
      // Debug info is loaded but not displayed in UI currently
    } catch (err) {
      console.error("Failed to load debug info:", err);
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
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "local") {
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
                Automatically open the Clipsy side panel when viewing an Etsy
                listing editor page
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

        {/* Etsy Authentication */}
        <div className="border-b pb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Etsy Authentication
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Manage your Etsy shop connection. Disconnect and reconnect to refresh your token with updated permissions.
          </p>

          <div className="space-y-4">
            {checkingEtsy ? (
              <div className="text-sm text-gray-600">
                Checking connection...
              </div>
            ) : etsyAuthenticated ? (
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-green-800">
                    ✓ Etsy Connected
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Your shop is connected and ready to use
                  </p>
                </div>
                <button
                  onClick={handleDisconnectEtsy}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-3">
                    Connect your Etsy shop to:
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mb-4">
                    <li>Download and edit your listings</li>
                    <li>Sync changes back to Etsy</li>
                    <li>Manage variations and inventory</li>
                  </ul>
                  <button
                    onClick={handleConnectEtsy}
                    disabled={connectingEtsy}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {connectingEtsy
                      ? "Connecting..."
                      : "Connect with Etsy"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Google Sheets Settings */}
        <div className="border-b pb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Google Sheets Integration
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Connect Google Sheets to sync your listings automatically. Your data
            stays in your Google account.
          </p>

          {/* Opt-in/Opt-out Toggle */}
          <div className="flex items-center justify-between mb-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="text-base font-medium text-gray-700">
                Enable Google Sheets Integration
              </label>
              <p className="text-sm text-gray-500 mt-1">
                {googleSheetsOptedOut
                  ? "Google Sheets features are disabled. Enable to use Google Sheets sync."
                  : "Google Sheets features are enabled. You can connect your account below."}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!googleSheetsOptedOut}
                onChange={(e) =>
                  handleGoogleSheetsOptOutToggle(!e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          <div className="space-y-4">
            {googleSheetsOptedOut ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">
                  Google Sheets integration is disabled. Enable it above to
                  connect your account.
                </p>
              </div>
            ) : checkingGoogleSheets ? (
              <div className="text-sm text-gray-600">
                Checking connection...
              </div>
            ) : googleSheetsConnected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-green-800">
                      ✓ Google Sheets Connected
                    </div>
                    <p className="text-xs text-green-600 mt-1">
                      Your listings can sync to Google Sheets
                    </p>
                  </div>
                  <button
                    onClick={handleDisconnectGoogleSheets}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Custom Sheet Name */}
                <div className="p-4 bg-white border border-gray-200 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Google Sheet Name
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Customize the name for new Google Sheets. Leave empty to use
                    default format: &quot;Clipsy Listings - Shop Name&quot;
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customSheetName}
                      onChange={(e) => setCustomSheetName(e.target.value)}
                      placeholder="Clipsy Listings - My Shop"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                    />
                    <button
                      onClick={handleSaveSheetName}
                      disabled={savingSheetName}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingSheetName ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-3">
                    Connect Google Sheets to:
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mb-4">
                    <li>Edit listings from anywhere</li>
                    <li>Collaborate with your team</li>
                    <li>Use formulas and advanced features</li>
                    <li>Automatic backups and version history</li>
                  </ul>
                  <button
                    onClick={handleConnectGoogleSheets}
                    disabled={connectingGoogleSheets}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {connectingGoogleSheets
                      ? "Connecting..."
                      : "Connect Google Sheets"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Privacy & Analytics Settings */}
        <div className="border-b pb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Privacy & Analytics
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Help us improve Clipsy by sharing anonymous usage data. This data is
            used to understand feature usage and identify issues. No personal
            information or listing data is collected.
          </p>

          {/* Analytics Opt-out Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="text-base font-medium text-gray-700">
                Enable Usage Analytics
              </label>
              <p className="text-sm text-gray-500 mt-1">
                {analyticsOptedOut
                  ? "Analytics are disabled. No usage data will be collected."
                  : "Analytics are enabled. Anonymous usage data helps us improve the extension."}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {isDev && "(Analytics are automatically disabled in development mode)"}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!analyticsOptedOut}
                onChange={(e) =>
                  handleAnalyticsOptOutToggle(!e.target.checked)
                }
                disabled={isDev}
                className="sr-only peer"
              />
              <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 ${isDev ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
            </label>
          </div>
        </div>

        {/* AI Settings */}
        {false && (
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              AI Suggestions (Google Gemini)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Enable AI-powered SEO suggestions using Google's Gemini API.
              You'll need to provide your own API key - all usage is billed to
              your Google account. This is optional - rule-based suggestions
              will always be available.
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
                      value={aiConfig.apiKey || ""}
                      onChange={(e) => handleAPIKeyChange(e.target.value)}
                      placeholder="Enter your Google Gemini API key"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get your API key from{" "}
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
                        <strong>API key validation failed.</strong> Please check
                        that your API key is correct and has access to the
                        Gemini API.
                      </p>
                    </div>
                  )}

                  {aiAvailable && aiConfig.enabled && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>AI suggestions enabled.</strong> Your API key is
                        valid. All API usage is billed to your Google account.
                        The free tier includes 60 requests per minute.
                      </p>
                    </div>
                  )}
                </div>
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
