import { useState, useEffect } from "react";
import LoadingSpinner from "../components/LoadingSpinner";
import UploadPreview from "../components/UploadPreview";
import { useToast } from "../contexts/ToastContext";
import {
  checkAuthStatus,
  initOAuthFlow,
  getValidAccessToken,
} from "../services/oauth";
import { getShopID, fetchListings, ListingStatus } from "../services/etsyApi";
import { convertListingsToCSV, downloadCSV } from "../services/csvService";
import { PreviewResponse, previewUploadCSV } from "../services/previewService";
import { applyUploadCSV } from "../services/applyService";
import { createBackupCSV } from "../services/backupService";

export default function DownloadUploadPage() {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [listingStatus, setListingStatus] = useState<string>("all");
  ``;
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

  const handleDownload = async () => {
    setIsLoading(true);
    setLoadingMessage("Downloading your Etsy listings...");

    try {
      // Get access token
      await getValidAccessToken();

      // Get shop ID
      setLoadingMessage("Getting your shop information...");
      const shopID = await getShopID();

      // Fetch listings with progress tracking
      setLoadingMessage("Fetching your listings...");
      const status =
        listingStatus === "all" ? undefined : (listingStatus as ListingStatus);
      const listings = await fetchListings(shopID, status, (current, total) => {
        setLoadingMessage(
          `Fetching your listings... ${current}/${total} (${Math.round(
            (current / total) * 100
          )}%)`
        );
      });

      // Convert to CSV
      setLoadingMessage("Generating CSV file...");
      const csvContent = convertListingsToCSV(listings);

      // Download CSV
      const filename = `clipsy-listings-${
        new Date().toISOString().split("T")[0]
      }.csv`;
      downloadCSV(csvContent, filename);

      toast.showSuccess("Listings downloaded successfully!");

      setIsLoading(false);
      setLoadingMessage("");
    } catch (error) {
      console.error("Download error:", error);
      setIsLoading(false);
      setLoadingMessage("");
      if (error instanceof Error && error.message.includes("No token")) {
        toast.showError("Please authenticate with Etsy first");
      } else {
        toast.showError(
          error instanceof Error
            ? error.message
            : "Failed to download listings. Please try again."
        );
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
          toast.showError("Invalid preview response. Please try again.");
          return;
        }

        // Validate structure
        if (!preview.changes || !Array.isArray(preview.changes)) {
          setIsLoading(false);
          setLoadingMessage("");
          console.error("Invalid preview structure:", preview);
          toast.showError(
            "Invalid preview response: missing or invalid 'changes' array. Please try again."
          );
          return;
        }

        // Validate summary
        if (!preview.summary || typeof preview.summary !== "object") {
          setIsLoading(false);
          setLoadingMessage("");
          console.error("Invalid preview structure:", preview);
          toast.showError(
            "Invalid preview response: missing or invalid 'summary' object. Please try again."
          );
          return;
        }

        // Validate summary
        if (!preview.changes || preview.changes.length === 0) {
          setIsLoading(false);
          setLoadingMessage("");
          console.info("No changes found in the CSV file:", preview);
          toast.showInfo(
            "No changes found in the CSV file. Please try again with a different file."
          );
          return;
        }

        setIsLoading(false);
        setLoadingMessage("");
        setPreviewData(preview);
        setPreviewFile(file);
      } catch (error) {
        console.error("Upload error:", error);
        setIsLoading(false);
        setLoadingMessage("");
        toast.showError(
          error instanceof Error
            ? error.message
            : "Failed to analyze file. Please try again."
        );
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
      console.error("Authentication error:", error);
      setIsLoading(false);
      setLoadingMessage("");
      toast.showError(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again."
      );
    }
  };

  const handleApplyChanges = async (
    acceptedChangeIds: string[],
    createBackup: boolean
  ) => {
    if (!previewFile || !previewData) return;

    setIsApplying(true);

    try {
      // Create backup first, before any changes are applied (if checkbox is checked)
      if (createBackup) {
        setLoadingMessage("Creating backup of listings to be changed...");
        try {
          await createBackupCSV(previewData, acceptedChangeIds);
        } catch (error) {
          console.error("Error creating backup:", error);
          // Ask user if they want to continue without backup
          const continueWithoutBackup = confirm(
            "Failed to create backup. Do you want to continue applying changes anyway?"
          );
          if (!continueWithoutBackup) {
            setIsApplying(false);
            setLoadingMessage("");
            return;
          }
        }
      }

      // Now apply the changes with progress tracking
      setLoadingMessage("Applying changes to Etsy...");
      const acceptedSet = new Set(acceptedChangeIds);
      await applyUploadCSV(
        previewFile,
        acceptedSet,
        (current, total, failed) => {
          setLoadingMessage(
            `Applying changes... ${current}/${total} (${Math.round(
              (current / total) * 100
            )}%)${failed > 0 ? ` - ${failed} failed` : ""}`
          );
        }
      );

      setIsApplying(false);
      setLoadingMessage("");
      setPreviewData(null);
      setPreviewFile(null);
      toast.showSuccess(
        `${createBackup ? "Backup created and " : ""}${
          acceptedChangeIds.length
        } change${
          acceptedChangeIds.length !== 1 ? "s" : ""
        } applied successfully!`
      );
    } catch (error) {
      console.error("Apply error:", error);
      setIsApplying(false);
      setLoadingMessage("");
      toast.showError(
        error instanceof Error
          ? error.message
          : "Failed to apply changes. Please try again."
      );
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
    <>
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Download & Upload
        </h1>
        <p className="text-xl text-gray-600">
          Manage your Etsy listings with CSV import/export
        </p>
      </div>

      {/* Privacy Note */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="w-5 h-5 text-green-600 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm text-green-800">
              <strong>Privacy & Security:</strong> All data processing happens
              locally in your browser. Your Etsy listings, authentication
              tokens, and CSV files never leave your device. The extension
              author has no access to your data at any point.
            </p>
          </div>
        </div>
      </div>

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
                <option value="draft" selected>
                  Draft
                </option>
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
              <p className="mt-4 text-center text-gray-700">{loadingMessage}</p>
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
    </>
  );
}
