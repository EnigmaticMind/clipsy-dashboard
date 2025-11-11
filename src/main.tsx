import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { ToastProvider } from "./contexts/ToastContext";
import { ReviewPromptProvider } from "./contexts/ReviewPromptContext";
import { initializeFirstUseDate } from "./services/reviewPrompt";
import { testAnalytics } from "./services/analytics";
import { logger } from "./utils/logger";
import ProtectedLayout from "./components/ProtectedLayout";
import DownloadUploadPage from "./pages/DownloadUploadPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import ContactPage from "./pages/ContactPage";
import FeatureRequestsPage from "./pages/FeatureRequestsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SettingsPage from "./pages/SettingsPage";
import EtsyAuthPage from "./pages/auth/EtsyAuthPage";
import GoogleAuthPage from "./pages/auth/GoogleAuthPage";
import MainLayout from "./components/MainLayout";

// Initialize first use date tracking
initializeFirstUseDate().catch(console.error);

// Expose test functions to window for debugging (dev only)
if (import.meta.env?.MODE === "development" || import.meta.env?.DEV === true) {
  (
    window as typeof window & {
      testAnalytics: typeof testAnalytics;
      testReviewPrompt: {
        show: () => Promise<void>;
        reset: () => Promise<void>;
      };
    }
  ).testAnalytics = testAnalytics;

  // Review prompt test functions
  (
    window as typeof window & {
      testReviewPrompt: {
        show: () => Promise<void>;
        reset: () => Promise<void>;
      };
    }
  ).testReviewPrompt = {
    // Force show the review prompt (sets pending flag and clears blockers)
    show: async () => {
      // Set pending flag
      await chrome.storage.local.set({
        "clipsy:review_prompt_pending": true,
      });
      // Clear flags that would prevent showing
      await chrome.storage.local.remove([
        "clipsy:review_prompt_last_shown",
        "clipsy:review_prompt_dismissed",
      ]);
      logger.log(
        "✅ Review prompt pending flag set. Refresh the page to see it."
      );
    },
    // Reset review prompt state (clears timer countdown)
    reset: async () => {
      await chrome.storage.local.remove([
        "clipsy:review_prompt_last_shown",
        "clipsy:review_prompt_dismissed",
        "clipsy:review_prompt_pending",
      ]);
      logger.log("✅ Review prompt state reset. Timer countdown cleared.");
    },
  };

  logger.log("💡 Tip: Call window.testAnalytics() to test Google Analytics");
  logger.log(
    "💡 Tip: Call window.testReviewPrompt.show() to force show review prompt"
  );
  logger.log(
    "💡 Tip: Call window.testReviewPrompt.reset() to reset review prompt timer"
  );
}

// Check for OAuth callback on page load (Etsy OAuth redirects with query params)
// Google OAuth uses getAuthToken() and doesn't redirect, so this is only for Etsy
// If we have OAuth query params, move them to hash for HashRouter
if (typeof window !== "undefined" && !window.location.hash) {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");
  const error = urlParams.get("error");

  if (code || state || error) {
    // Move query params to hash for HashRouter
    const hashParams = new URLSearchParams();
    if (code) hashParams.set("code", code);
    if (state) hashParams.set("state", state);
    if (error) hashParams.set("error", error);
    const errorDescription = urlParams.get("error_description");
    if (errorDescription) hashParams.set("error_description", errorDescription);

    // Set hash with params (MainLayout will handle the OAuth callback)
    window.location.hash = `?${hashParams.toString()}`;
    // Clear search params
    window.history.replaceState({}, "", window.location.pathname);
  }
}

// HashRouter is required for Chrome extensions because:
// 1. BrowserRouter tries to load routes as file paths (e.g., /test becomes dashboard.html/test which doesn't exist)
// 2. Chrome extensions don't have a server to handle routing
// 3. HashRouter works entirely client-side with the chrome-extension:// protocol
const router = createHashRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      {
        path: "/",
        // Protected routes
        element: <ProtectedLayout />,
        children: [
          {
            index: true,
            element: <DownloadUploadPage />,
          },
        ],
      },
      {
        path: "how-it-works",
        element: <HowItWorksPage />,
      },
      {
        path: "contact",
        element: <ContactPage />,
      },
      {
        path: "feature-requests",
        element: <FeatureRequestsPage />,
      },
      {
        path: "privacy",
        element: <PrivacyPolicyPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "auth/etsy",
        element: <EtsyAuthPage />,
      },
      {
        path: "auth/google",
        element: <GoogleAuthPage />,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <ReviewPromptProvider>
        <RouterProvider router={router} />
      </ReviewPromptProvider>
    </ToastProvider>
  </StrictMode>
);
