import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { ToastProvider } from "./contexts/ToastContext";
import Layout from "./components/MainLayout";
import DownloadUploadPage from "./pages/DownloadUploadPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import ContactPage from "./pages/ContactPage";
import AuthPage from "./pages/AuthPage";

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
