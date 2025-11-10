import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import LoadingSpinner from "./LoadingSpinner";
import { checkAuthStatus } from "../services/oauth";
import { checkGoogleSheetsAuthStatus, checkGoogleSheetsOptOut } from "../services/googleSheetsOAuth";

export default function ProtectedLayout() {
  const navigate = useNavigate();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [, setEtsyAuthenticated] = useState(false);
  const [, setGoogleSheetsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check Etsy authentication
        const etsyAuth = await checkAuthStatus();
        setEtsyAuthenticated(etsyAuth.authenticated);

        // Check Google Sheets authentication
        const googleAuth = await checkGoogleSheetsAuthStatus();
        setGoogleSheetsAuthenticated(googleAuth.authenticated);

        // Navigate to appropriate onboarding step if needed
        if (!etsyAuth.authenticated) {
          navigate("/auth/etsy", { replace: true });
        } else if (!googleAuth.authenticated) {
          // Check if user has opted out of Google Sheets
          const optedOut = await checkGoogleSheetsOptOut();
          if (!optedOut) {
            navigate("/auth/google", { replace: true });
          }
        }
      } catch (error) {
        console.error("Error checking authentication:", error);
        setEtsyAuthenticated(false);
        setGoogleSheetsAuthenticated(false);
        navigate("/auth/etsy", { replace: true });
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();

    // Also check periodically in case OAuth completes
    const interval = setInterval(checkAuth, 2000);
    return () => clearInterval(interval);
  }, [navigate]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // User is authenticated, show normal layout
  return <Outlet />;
}
