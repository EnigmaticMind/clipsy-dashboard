import { useState, useEffect } from "react";
import LoadingSpinner from "../components/LoadingSpinner";
import EtsyTrademark from "../components/EtsyTrademark";
import UploadPreview from "../components/UploadPreview";
import ContactForm from "../components/ContactForm";

import {
  checkAuthStatus,
  initOAuthFlow,
  getValidAccessToken,
} from "../services/oauth";
import { getShopID, fetchListings, ListingStatus } from "../services/etsyApi";
import { convertListingsToCSV, downloadCSV } from "../services/csvService";
import { previewUploadCSV } from "../services/previewService";
import { applyUploadCSV } from "../services/applyService";
import { createBackupCSV } from "../services/backupService";

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [listingStatus, setListingStatus] = useState<string>("all");
  const [previewData, setPreviewData] = useState<any>(null);
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
      console.error("Download error:", error);
      setIsLoading(false);
      setLoadingMessage("");
      if (error instanceof Error && error.message.includes("No token")) {
        alert("Please authenticate with Etsy first");
      } else {
        alert(
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
          alert("Invalid preview response. Please try again.");
          return;
        }

        // Validate structure
        if (!preview.changes || !Array.isArray(preview.changes)) {
          setIsLoading(false);
          setLoadingMessage("");
          console.error("Invalid preview structure:", preview);
          alert(
            `Invalid preview response: missing or invalid 'changes' array. Please try again.`
          );
          return;
        }

        // Validate summary
        if (!preview.summary || typeof preview.summary !== "object") {
          setIsLoading(false);
          setLoadingMessage("");
          console.error("Invalid preview structure:", preview);
          alert(
            `Invalid preview response: missing or invalid 'summary' object. Please try again.`
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
        alert(
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
      alert(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again."
      );
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
          console.error("Error creating backup:", error);
          // Ask user if they want to continue without backup
          const continueWithoutBackup = confirm(
            "Failed to create backup. Do you want to continue applying changes anyway?"
          );
          if (!continueWithoutBackup) {
            setIsApplying(false);
            return;
          }
        }
      }

      const acceptedSet = new Set(acceptedChangeIds);
      await applyUploadCSV(previewFile, acceptedSet, (current, total, failed) => {
        // Progress tracking (could add UI update here if needed)
        console.log(`Progress: ${current}/${total}${failed > 0 ? ` - ${failed} failed` : ''}`);
      });

      setIsApplying(false);
      setPreviewData(null);
      setPreviewFile(null);
      alert(
        `${createBackup ? "Backup created and " : ""}${acceptedChangeIds.length} change${
          acceptedChangeIds.length !== 1 ? "s" : ""
        } applied successfully!`
      );
    } catch (error) {
      console.error("Apply error:", error);
      setIsApplying(false);
      alert(
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
