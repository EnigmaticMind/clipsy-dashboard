import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { ToastProvider } from "./contexts/ToastContext";
import Layout from "./components/MainLayout";
import DownloadUploadPage from "./pages/DownloadUploadPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import ContactPage from "./pages/ContactPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SettingsPage from "./pages/SettingsPage";
import AuthPage from "./pages/AuthPage";

// Check for OAuth callback on page load
// If we have OAuth query params, navigate to /auth with them in the hash
if (typeof window !== "undefined") {
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

    // Navigate to /auth with params in hash
    window.location.hash = `/auth?${hashParams.toString()}`;
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
    element: <Layout />,
    children: [
      {
        index: true,
        element: <DownloadUploadPage />,
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
        path: "privacy",
        element: <PrivacyPolicyPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
  {
    path: "/auth",
    element: <AuthPage />,
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </StrictMode>
);
