import { useState, useEffect } from "react";
import LoadingSpinner from "../components/LoadingSpinner";
import EtsyTrademark from "../components/EtsyTrademark";
import UploadPreview from "../components/UploadPreview";
import ContactForm from "../components/ContactForm";
import { useToast } from "../contexts/ToastContext";
import { logger } from "../utils/logger";

import {
  checkAuthStatus,
  initOAuthFlow,
  getValidAccessToken,
} from "../services/oauth";
import { getShopID, fetchListings, ListingStatus } from "../services/etsyApi";
import { convertListingsToCSV, downloadCSV } from "../services/csvService";
import { previewUploadCSV, type PreviewResponse } from "../services/previewService";
import { applyUploadCSV } from "../services/applyService";
import { createBackupCSV } from "../services/backupService";

export default function LandingPage() {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [listingStatus, setListingStatus] = useState<string>("all");
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authStatus = await checkAuthStatus();
        setIsAuthenticated(authStatus.authenticated);
      } catch (error) {
        console.error("Error checking authentication status:", error);
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Check for pending bulk edit CSV and auto-trigger preview
  useEffect(() => {
    const checkPendingBulkEdit = async () => {
      try {
        const result = await chrome.storage.local.get(['clipsy_pending_bulk_edit']);
        const pendingEdit = result.clipsy_pending_bulk_edit;
        
        if (pendingEdit && pendingEdit.csvContent) {
          // Clear the pending edit
          await chrome.storage.local.remove(['clipsy_pending_bulk_edit']);
          
          // Create a File object from the CSV content
          const blob = new Blob([pendingEdit.csvContent], { type: 'text/csv;charset=utf-8;' });
          const csvFile = new File([blob], pendingEdit.filename || 'bulk-edit.csv', { type: 'text/csv' });
          
          // Trigger the preview flow
          setIsLoading(true);
          setLoadingMessage("Analyzing bulk edit changes...");
          
          try {
            const preview = await previewUploadCSV(csvFile);
            setIsLoading(false);
            setLoadingMessage("");
            setPreviewData(preview);
            setPreviewFile(csvFile);
          } catch (error) {
            logger.error("Bulk edit preview error:", error);
            setIsLoading(false);
            setLoadingMessage("");
            if (error instanceof Error) {
              toast.showError(`Failed to analyze bulk edit: ${error.message}`);
            } else {
              toast.showError("Failed to analyze bulk edit. Please try again.");
            }
          }
        }
      } catch (error) {
        logger.error("Error checking pending bulk edit:", error);
      }
    };

    // Check after a short delay to ensure component is mounted
    const timeoutId = setTimeout(checkPendingBulkEdit, 500);
    return () => clearTimeout(timeoutId);
  }, []);

  const handleDownload = async () => {
    setIsLoading(true);
    setLoadingMessage("Downloading your Etsy listings...");

    try {
      // Get access token
      await getValidAccessToken();

      // Get shop ID
      setLoadingMessage("Getting your shop information...");
      const shopID = await getShopID();

      // Fetch listings
      setLoadingMessage("Fetching your listings...");
      const status =
        listingStatus === "all" ? undefined : (listingStatus as ListingStatus);
      const listings = await fetchListings(shopID, status);

      // Convert to CSV
      setLoadingMessage("Generating CSV file...");
      const csvContent = convertListingsToCSV(listings);

      // Download CSV
      const filename = `etsy-listings-${
        new Date().toISOString().split("T")[0]
      }.csv`;
      downloadCSV(csvContent, filename);

      setLoadingMessage("Download complete!");
      setTimeout(() => {
        setIsLoading(false);
        setLoadingMessage("");
      }, 1000);
    } catch (error) {
      logger.error("Download error:", error);
      setIsLoading(false);
      setLoadingMessage("");
      if (error instanceof Error && error.message.includes("No token")) {
        toast.showError("Please authenticate with Etsy first to download listings.");
      } else if (error instanceof Error && error.message.includes("rate limit")) {
        toast.showError("Rate limit exceeded. Please wait a few minutes and try again.");
      } else if (error instanceof Error && error.message.includes("network")) {
        toast.showError("Network error. Please check your internet connection and try again.");
      } else {
        const errorMessage = error instanceof Error
          ? error.message
          : "Failed to download listings. Please check your connection and try again.";
        toast.showError(errorMessage);
      }
    }
  };

  const handleUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsLoading(true);
      setLoadingMessage("Analyzing your CSV file...");

      try {
        // Generate preview
        const preview = await previewUploadCSV(file);

        // Validate preview response structure
        if (!preview) {
          setIsLoading(false);
          setLoadingMessage("");
          toast.showError("Invalid preview response. The CSV file may be corrupted or in an unsupported format. Please try downloading a fresh CSV from the extension.");
          return;
        }

        // Validate structure
        if (!preview.changes || !Array.isArray(preview.changes)) {
          setIsLoading(false);
          setLoadingMessage("");
          logger.error("Invalid preview structure:", preview);
          toast.showError("Invalid CSV format: missing changes data. Please ensure you're uploading a CSV file downloaded from this extension.");
          return;
        }

        // Validate summary
        if (!preview.summary || typeof preview.summary !== "object") {
          setIsLoading(false);
          setLoadingMessage("");
          logger.error("Invalid preview structure:", preview);
          toast.showError("Invalid CSV format: missing summary data. Please ensure you're uploading a CSV file downloaded from this extension.");
          return;
        }

        setIsLoading(false);
        setLoadingMessage("");
        setPreviewData(preview);
        setPreviewFile(file);
      } catch (error) {
        logger.error("Upload error:", error);
        setIsLoading(false);
        setLoadingMessage("");
        if (error instanceof Error) {
          if (error.message.includes("rate limit")) {
            toast.showError("Rate limit exceeded. Please wait a few minutes before uploading again.");
          } else if (error.message.includes("network") || error.message.includes("fetch")) {
            toast.showError("Network error while analyzing file. Please check your connection and try again.");
          } else if (error.message.includes("parse") || error.message.includes("CSV")) {
            toast.showError("Failed to parse CSV file. Please ensure the file is a valid CSV downloaded from this extension.");
          } else {
            toast.showError(`Failed to analyze file: ${error.message}`);
          }
        } else {
          toast.showError("Failed to analyze file. Please ensure the file is a valid CSV and try again.");
        }
      }
    };
    input.click();
  };

  const handleAuthenticate = async () => {
    try {
      setIsLoading(true);
      setLoadingMessage("Opening Etsy authentication...");

      await initOAuthFlow();

      // After OAuth, check auth status again
      const authStatus = await checkAuthStatus();
      setIsAuthenticated(authStatus.authenticated);

      setIsLoading(false);
      setLoadingMessage("");
    } catch (error) {
      logger.error("Authentication error:", error);
      setIsLoading(false);
      setLoadingMessage("");
      if (error instanceof Error) {
        if (error.message.includes("popup")) {
          toast.showError("Authentication popup was blocked. Please allow popups for this site and try again.");
        } else if (error.message.includes("network")) {
          toast.showError("Network error during authentication. Please check your connection and try again.");
        } else {
          toast.showError(`Authentication failed: ${error.message}`);
        }
      } else {
        toast.showError("Authentication failed. Please try again.");
      }
    }
  };

  const handleApplyChanges = async (acceptedChangeIds: string[], createBackup: boolean) => {
    if (!previewFile || !previewData) return;

    setIsApplying(true);

    try {
      // Create backup first, before any changes are applied (if checkbox is checked)
      if (createBackup) {
        try {
          await createBackupCSV(previewData, acceptedChangeIds);
        } catch (error) {
          logger.error("Error creating backup:", error);
          // Ask user if they want to continue without backup
          toast.showError("Failed to create backup. You can still proceed, but changes cannot be undone.");
          // Note: We'll continue anyway since backup is optional
        }
      }

      const acceptedSet = new Set(acceptedChangeIds);
      await applyUploadCSV(previewFile, acceptedSet, (current, total, failed) => {
        // Progress tracking (could add UI update here if needed)
        logger.log(`Progress: ${current}/${total}${failed > 0 ? ` - ${failed} failed` : ''}`);
      });

      setIsApplying(false);
      setPreviewData(null);
      setPreviewFile(null);
      toast.showSuccess(
        `${createBackup ? "Backup created and " : ""}${acceptedChangeIds.length} change${
          acceptedChangeIds.length !== 1 ? "s" : ""
        } applied successfully!`
      );
    } catch (error) {
      logger.error("Apply error:", error);
      setIsApplying(false);
      if (error instanceof Error) {
        if (error.message.includes("rate limit")) {
          toast.showError("Rate limit exceeded while applying changes. Some changes may not have been applied. Please wait a few minutes and try again.");
        } else if (error.message.includes("network")) {
          toast.showError("Network error while applying changes. Some changes may not have been applied. Please check your connection and try again.");
        } else if (error.message.includes("permission") || error.message.includes("unauthorized")) {
          toast.showError("Permission denied. Please ensure you're authenticated and have permission to edit these listings.");
        } else {
          toast.showError(`Failed to apply changes: ${error.message}`);
        }
      } else {
        toast.showError("Failed to apply changes. Please check your connection and try again.");
      }
    }
  };

  const handleClosePreview = () => {
    setPreviewData(null);
    setPreviewFile(null);
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Clipsy Dashboard
            </h1>
            <p className="text-xl text-gray-600">
              Manage your Etsy listings with CSV import/export
            </p>
          </div>

          {/* How It Works Section */}
          {isAuthenticated && (
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                How It Works
              </h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-lg">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Download Your Listings
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Select the listing status you want to export and download
                      a CSV file containing all your Etsy listings with their
                      details, variations, and properties.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-lg">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Edit Locally
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Open the CSV file in Excel, Google Sheets, or any
                      spreadsheet editor. Make your changes to titles,
                      descriptions, prices, quantities, tags, and more. Save the
                      file when you're done.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-lg">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Upload & Preview Changes
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Upload your edited CSV file. The system will analyze your
                      changes and show you a detailed preview of what will be
                      created, updated, or deleted before making any changes to
                      your Etsy shop.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-lg">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Review & Approve
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Review each change with side-by-side comparisons. Select
                      which changes you want to apply and which to skip. You
                      have full control over what gets updated on Etsy.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-lg">5</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Apply Changes
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Once you're satisfied with your selections, click "Apply
                      Changes" to commit the updates to your Etsy shop. Only the
                      changes you approved will be applied.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Authentication Prompt */}
          {!isAuthenticated && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
              <p className="text-yellow-800 mb-4">
                Please authenticate with your Etsy account to continue.
              </p>
              <button
                onClick={handleAuthenticate}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Authenticate with Etsy
              </button>
            </div>
          )}

          {/* Main Actions */}
          {isAuthenticated && (
            <>
              {/* Download Section */}
              <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  Download Listings
                </h2>
                <p className="text-gray-600 mb-6">
                  Download all your Etsy listings as a CSV file for editing.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Listing Status
                  </label>
                  <select
                    value={listingStatus}
                    onChange={(e) => setListingStatus(e.target.value)}
                    className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="all">All Listings</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="inactive">Inactive</option>
                    <option value="sold_out">Sold Out</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                <button
                  onClick={handleDownload}
                  disabled={isLoading}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Download Listings
                </button>
              </div>

              {/* Upload Section */}
              <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  Upload Listings
                </h2>
                <p className="text-gray-600 mb-6">
                  Upload a CSV file to create, update, or delete listings.
                </p>
                <button
                  onClick={handleUpload}
                  disabled={isLoading}
                  className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Upload CSV
                </button>
              </div>
            </>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-8 max-w-md mx-4">
                <LoadingSpinner />
                {loadingMessage && (
                  <p className="mt-4 text-center text-gray-700">
                    {loadingMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Upload Preview Modal */}
          {previewData && previewFile && (
            <UploadPreview
              preview={previewData}
              file={previewFile}
              onClose={handleClosePreview}
              onApply={handleApplyChanges}
              isApplying={isApplying}
            />
          )}

          {/* Contact & Feedback Section */}
          <ContactForm />

          {/* Etsy Trademark Notice */}
          <EtsyTrademark />
        </div>
      </div>
    </div>
  );
}
