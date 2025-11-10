import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { logger } from "../../utils/logger";
import { initGoogleOAuthFlow } from "../../services/googleSheetsOAuth";
import { checkGoogleSheetsAuthStatus } from "../../services/googleSheetsOAuth";
import LoadingSpinner from "../../components/LoadingSpinner";

// Set Google Sheets opt-out
async function setGoogleSheetsOptOut(optedOut: boolean): Promise<void> {
  await chrome.storage.local.set({ "clipsy:googleSheetsOptOut": optedOut });
}

export default function GoogleAuthPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSheetsAuth = async () => {
    setIsLoading(true);
    try {
      await initGoogleOAuthFlow();

      toast.showSuccess("Please complete authentication in the popup window.");
    } catch (error) {
      logger.error("Google Sheets authentication error:", error);

      if (error instanceof Error) {
        if (error.message.includes("popup")) {
          toast.showError(
            "Authentication popup was blocked. Please allow popups and try again."
          );
        } else {
          toast.showError(`Authentication failed: ${error.message}`);
        }
      } else {
        toast.showError("Authentication failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSheetsSkip = async () => {
    await setGoogleSheetsOptOut(true);
    navigate("/");
  };

  // Check for OAuth completion after redirect
  useEffect(() => {
    const checkOAuthCompletion = async () => {
      try {
        const authStatus = await checkGoogleSheetsAuthStatus();
        if (authStatus.authenticated) {
          // Navigate to main app
          navigate("/");
        }
      } catch (error) {
        // Not authenticated yet
      }
    };

    // Check periodically for auth completion
    const interval = setInterval(checkOAuthCompletion, 1000);
    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Connect Google Sheets
            </h1>
            <p className="text-gray-600">
              Sync your listings with Google Sheets for easy editing and
              collaboration
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-green-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Step 2: Connect Google Sheets (Optional)
              </h2>
              <p className="text-gray-700 mb-4">
                Your listings will sync to a Google Sheet in your account. This
                allows you to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
                <li>Edit listings from anywhere (phone, tablet, computer)</li>
                <li>Collaborate with your team in real-time</li>
                <li>Use formulas and advanced features</li>
                <li>Automatic backups and version history</li>
                <li>
                  No file management - everything stays in your Google account
                </li>
              </ul>
              <div className="bg-white rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600">
                  <strong>Privacy:</strong> Your data stays in your Google
                  account. We never store your listings on our servers. You own
                  your data, always.
                </p>
              </div>
              {isLoading ? (
                <div className="text-center">
                  <LoadingSpinner message="Opening Google authentication..." />
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleGoogleSheetsAuth}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    Connect Google Sheets
                  </button>
                  <button
                    onClick={handleGoogleSheetsSkip}
                    className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Skip - Use CSV Instead
                  </button>
                  <p className="text-xs text-center text-gray-500">
                    You can connect Google Sheets later in Settings
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
