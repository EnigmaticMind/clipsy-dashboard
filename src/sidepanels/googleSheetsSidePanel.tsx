// Side panel component for Google Sheets
// Provides quick access to Clipsy features when viewing Google Sheets

import { useState, useEffect } from "react";
import LoadingSpinner from "../components/LoadingSpinner";
import { ToastProvider, useToast } from "../contexts/ToastContext";
import { checkGoogleSheetsAuthStatus } from "../services/googleSheetsOAuth";
import {
  writeListingsToSheet,
  getOrCreateSheet,
} from "../services/googleSheetsService";
import { getShopID, fetchListings, makeEtsyRequest } from "../services/etsyApi";
import { getValidAccessToken } from "../services/oauth";

interface GoogleSheetsSidePanelProps {
  sheetId: string;
}

function GoogleSheetsSidePanelContent({ sheetId }: GoogleSheetsSidePanelProps) {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authStatus = await checkGoogleSheetsAuthStatus();
        setIsAuthenticated(authStatus.authenticated);
      } catch (error) {
        console.error("Error checking auth:", error);
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  const handleSyncFromEtsy = async () => {
    if (!isAuthenticated) {
      toast.showError("Please authenticate with Google Sheets first");
      return;
    }

    setIsLoading(true);
    try {
      await getValidAccessToken(); // Etsy token
      const shopID = await getShopID();
      const listings = await fetchListings(shopID, "active");

      // Get shop name from user info (fallback to "Shop" if not available)
      let shopName = `Shop ${shopID}`;
      try {
        const userResponse = await makeEtsyRequest(
          "GET",
          "/application/users/me"
        );
        if (userResponse.ok) {
          const userData = await userResponse.json();
          shopName = userData.login_name || `Shop ${shopID}`;
        }
      } catch {
        // Use default shop name
      }

      await getOrCreateSheet(shopID, shopName);
      await writeListingsToSheet(sheetId, listings, "active");

      toast.showSuccess("Listings synced to Google Sheets!");
    } catch (error) {
      console.error("Error syncing from Etsy:", error);
      toast.showError(
        error instanceof Error ? error.message : "Failed to sync listings"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInDashboard = () => {
    chrome.windows.create({
      url: chrome.runtime.getURL("dashboard.html"),
      type: "popup",
      width: 1200,
      height: 800,
    });
  };

  if (isCheckingAuth) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: "20px" }}>
        <h2
          style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "12px" }}
        >
          Google Sheets Integration
        </h2>
        <p style={{ marginBottom: "16px", color: "#666" }}>
          Please authenticate with Google Sheets to use this feature.
        </p>
        <button
          onClick={handleOpenInDashboard}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: "#6366f1",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          Open Dashboard to Authenticate
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2
        style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "16px" }}
      >
        Clipsy - Google Sheets
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <button
          onClick={handleSyncFromEtsy}
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: isLoading ? "#ccc" : "#6366f1",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontWeight: "600",
          }}
        >
          {isLoading ? "Syncing..." : "Sync Listings from Etsy"}
        </button>

        <button
          onClick={handleOpenInDashboard}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: "#f3f4f6",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          Open Full Dashboard
        </button>
      </div>

      <div
        style={{
          marginTop: "20px",
          padding: "12px",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
        }}
      >
        <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
          <strong>Sheet ID:</strong> {sheetId.substring(0, 20)}...
        </p>
      </div>
    </div>
  );
}

export default function GoogleSheetsSidePanel({
  sheetId,
}: GoogleSheetsSidePanelProps) {
  return (
    <ToastProvider>
      <GoogleSheetsSidePanelContent sheetId={sheetId} />
    </ToastProvider>
  );
}
