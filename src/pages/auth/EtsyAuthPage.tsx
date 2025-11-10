import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { logger } from "../../utils/logger";
import { initOAuthFlow } from "../../services/oauth";
import { checkGoogleSheetsOptOut } from "../../services/googleSheetsOAuth";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function EtsyAuthPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleEtsyAuth = async () => {
    setIsLoading(true);
    try {
      await initOAuthFlow();

      // After OAuth, the AuthPage will handle the callback
      toast.showSuccess("Please complete authentication in the popup window.");
    } catch (error) {
      logger.error("Etsy authentication error:", error);

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

  // Check for OAuth completion after redirect
  useEffect(() => {
    const checkOAuthCompletion = async () => {
      const { checkAuthStatus } = await import("../../services/oauth");
      try {
        const authStatus = await checkAuthStatus();
        if (authStatus.authenticated) {
          // Check if Google Sheets is needed
          const optedOut = await checkGoogleSheetsOptOut();
          if (!optedOut) {
            // Navigate to Google Sheets onboarding
            navigate("/auth/google");
          } else {
            // Navigate to main app
            navigate("/");
          }
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
              Welcome to Clipsy!
            </h1>
            <p className="text-gray-600">
              Let's get you set up to manage your Etsy listings
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-indigo-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Step 1: Connect Your Etsy Shop
              </h2>
              <p className="text-gray-700 mb-4">
                We need access to your Etsy listings to sync them. This is a
                secure OAuth connection that doesn't require sharing your
                password.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
                <li>Secure OAuth connection</li>
                <li>No password sharing</li>
                <li>You can revoke access anytime</li>
              </ul>
              {isLoading ? (
                <div className="text-center">
                  <LoadingSpinner />
                  <p className="mt-4 text-gray-600">
                    Opening Etsy authentication...
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleEtsyAuth}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Connect with Etsy
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
