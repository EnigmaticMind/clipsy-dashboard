import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Navigation from "./Navigation";
import EtsyTrademark from "./EtsyTrademark";
import LoadingSpinner from "./LoadingSpinner";
import AnalyticsTracker from "./AnalyticsTracker";
import { useToast } from "../contexts/ToastContext";
import { exchangeCodeForToken } from "../services/oauth";

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check for OAuth callback params in hash
      const hash = location.hash;
      const queryString = hash.includes("?") ? hash.split("?")[1] : "";
      const urlParams = new URLSearchParams(queryString);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      const error = urlParams.get("error");
      const errorDescription = urlParams.get("error_description");

      // Only process if we have OAuth params
      if (!code && !state && !error) {
        return;
      }

      setIsProcessingAuth(true);

      try {
        if (error) {
          throw new Error(errorDescription || error);
        }

        if (!code || !state) {
          throw new Error("Missing authorization code or state parameter");
        }

        // Exchange code for token (Etsy OAuth)
        // Google OAuth uses getAuthToken() and doesn't redirect, so this is only for Etsy
        await exchangeCodeForToken(code, state);
        toast.showSuccess("Etsy authentication successful!");

        // Clear the hash and redirect to home
        window.location.hash = "";
        navigate("/", { replace: true });
      } catch (error) {
        console.error("Auth error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Authentication failed. Please try again.";

        toast.showError(errorMessage);

        // Clear the hash and redirect back to Etsy auth page
        window.location.hash = "";
        navigate("/auth/etsy", { replace: true });
      } finally {
        setIsProcessingAuth(false);
      }
    };

    handleOAuthCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  if (isProcessingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-gray-700">Processing authentication...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <AnalyticsTracker />
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Outlet />
          <div className="mt-12">
            <EtsyTrademark />
          </div>
        </div>
      </div>
    </div>
  );
}
