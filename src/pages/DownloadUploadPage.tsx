import { useState, useEffect } from "react";
import LoadingSpinner from "../components/LoadingSpinner";
import ReviewChanges from "../components/ReviewChanges";
import { useToast } from "../contexts/ToastContext";
import { useReviewPrompt } from "../contexts/ReviewPromptContext";
import { getValidAccessToken } from "../services/oauth";
import { getValidAccessToken as getGoogleSheetsToken } from "../services/googleSheetsOAuth";
import {
  getShopID,
  fetchListings,
  ListingStatus,
  getListingCount,
} from "../services/etsyApi";
import { exceedsListingLimit, getListingLimit } from "../utils/listingLimit";
import {
  convertListingsToCSV,
  downloadCSV,
  countCSVRows,
} from "../services/csvService";
import {
  checkGoogleSheetsAuthStatus,
  checkGoogleSheetsOptOut,
} from "../services/googleSheetsOAuth";
import {
  getOrCreateSheet,
  writeListingsToSheet,
  readListingsFromSheetAsFile,
  updateSheetMetadata,
  getSheetRowCount,
} from "../services/googleSheetsService";
import { PreviewResponse, previewUploadCSV } from "../services/previewService";
import { applyUploadCSV } from "../services/applyService";
import { createBackupCSV } from "../services/backupService";
import { setReviewPromptPending } from "../services/reviewPrompt";
import { trackDownload, trackUpload } from "../services/analytics";

export default function DownloadUploadPage() {
  const toast = useToast();
  const reviewPrompt = useReviewPrompt();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [listingStatus, setListingStatus] = useState<string>("active");
  const [googleSheetsOptedOut, setGoogleSheetsOptedOut] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [isCheckingCount, setIsCheckingCount] = useState(false);
  const [exceedsLimit, setExceedsLimit] = useState(false);

  // Check Google Sheets opt-out status on mount
  useEffect(() => {
    checkGoogleSheetsOptOut().then((optedOut) => {
      setGoogleSheetsOptedOut(optedOut);
    });
  }, []);

  // Check listing count on mount
  useEffect(() => {
    const checkListingCount = async () => {
      try {
        setIsCheckingCount(true);
        const shopID = await getShopID();
        const count = await getListingCount(shopID);
        setListingCount(count);
        setExceedsLimit(exceedsListingLimit(count));
      } catch (error) {
        console.error("Error checking listing count:", error);
      } finally {
        setIsCheckingCount(false);
      }
    };

    checkListingCount();
  }, []);

  // Check for pending review prompt on mount
  useEffect(() => {
    reviewPrompt.checkPendingReviewPrompt();
  }, [reviewPrompt]);

  const handleDownload = async (destination: "csv" | "googleSheets") => {
    // Check if shop exceeds limit
    if (exceedsListingLimit(listingCount || 0)) {
      const limit = getListingLimit();
      toast.showError(
        `Your shop has ${
          listingCount?.toLocaleString() || 0
        } listings, which exceeds our limit of ${limit.toLocaleString()} for download/upload. ` +
          `Please use Google Sheets for managing large shops.`
      );
      return;
    }

    // Check if Google Sheets is disabled
    if (destination === "googleSheets") {
      const optedOut = await checkGoogleSheetsOptOut();
      if (optedOut) {
        toast.showInfo(
          "Google Sheets integration is disabled. Please enable it in Settings to use this feature."
        );
        return;
      }
    }

    setIsLoading(true);
    setLoadingMessage(
      destination === "csv"
        ? "Downloading your Etsy listings..."
        : "Downloading to Google Sheets..."
    );

    try {
      // Get access token
      await getValidAccessToken();

      // Check Google Sheets auth if needed
      if (destination === "googleSheets") {
        const googleToken = await checkGoogleSheetsAuthStatus();
        if (!googleToken.authenticated) {
          throw new Error("Please connect Google Sheets in Settings first");
        }
      }

      // Get shop ID and name
      setLoadingMessage("Getting your shop information...");
      const shopID = await getShopID();
      const shopName = `Shop ${shopID}`;

      // Fetch listings with progress tracking
      setLoadingMessage("Fetching your listings...");
      const status = listingStatus as ListingStatus;
      const listings = await fetchListings(shopID, status, (current, total) => {
        setLoadingMessage(
          `Fetching your listings... ${current}/${total} (${Math.round(
            (current / total) * 100
          )}%)`
        );
      });

      if (destination === "csv") {
        // Convert to CSV and download
        setLoadingMessage("Generating CSV file...");
        const csvContent = convertListingsToCSV(listings);
        const filename = `clipsy-listings-${
          new Date().toISOString().split("T")[0]
        }.csv`;
        downloadCSV(csvContent, filename);
        toast.showSuccess("Listings downloaded successfully!");
        // Track analytics
        await trackDownload("csv", listings.results.length);
        // Set pending flag to show review prompt on next visit
        await setReviewPromptPending();
      } else {
        // Get or create sheet
        setLoadingMessage("Setting up Google Sheet...");
        const sheet = await getOrCreateSheet(shopID, shopName);

        // Write listings to sheet (pass the selected status)
        setLoadingMessage("Writing to Google Sheet...");
        const writtenSheetName = await writeListingsToSheet(
          sheet.sheetId,
          listings,
          listingStatus
        );

        // Update metadata
        await updateSheetMetadata(sheet);

        // Get the sheet ID (gid) for the written sheet to open the correct tab
        let finalSheetUrl = sheet.sheetUrl;
        if (writtenSheetName) {
          try {
            const token = await getGoogleSheetsToken();
            const spreadsheetResponse = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${sheet.sheetId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (spreadsheetResponse.ok) {
              const spreadsheet = await spreadsheetResponse.json();
              const targetSheet = spreadsheet.sheets?.find(
                (s: { properties: { title: string } }) =>
                  s.properties.title === writtenSheetName
              );

              if (targetSheet) {
                // Append gid to URL to open the correct tab
                finalSheetUrl = `${sheet.sheetUrl}#gid=${targetSheet.properties.sheetId}`;
              }
            }
          } catch (error) {
            console.error("Failed to get sheet gid:", error);
            // Continue with base URL if we can't get the gid
          }
        }

        toast.showSuccess(
          `Listings synced to Google Sheets! View: ${sheet.sheetUrl}`
        );
        // Track analytics
        await trackDownload("googleSheets", listings.results.length);
        // Set pending flag to show review prompt on next visit
        await setReviewPromptPending();

        // Check if sheet is already open in a tab, if so navigate to it, otherwise open new tab
        // Extract base URL without query params for matching
        const baseUrl = sheet.sheetUrl.split("?")[0];
        chrome.tabs.query({}, (allTabs) => {
          // Find tab with matching base URL
          const existingTab = allTabs.find((tab) => {
            if (!tab.url) return false;
            const tabBaseUrl = tab.url.split("?")[0].split("#")[0];
            return tabBaseUrl === baseUrl;
          });

          if (existingTab && existingTab.id) {
            // Tab already exists, navigate to it and reload with correct gid
            chrome.tabs.update(existingTab.id, {
              active: true,
              url: finalSheetUrl,
            });
          } else {
            // Open in new tab with correct gid
            chrome.tabs.create({ url: finalSheetUrl });
          }
        });
      }

      setIsLoading(false);
      setLoadingMessage("");
    } catch (error) {
      console.error("Download error:", error);
      setIsLoading(false);
      setLoadingMessage("");
      if (error instanceof Error && error.message.includes("No token")) {
        toast.showError("Please authenticate with Etsy first");
      } else if (
        error instanceof Error &&
        error.message.includes("Not authenticated")
      ) {
        toast.showError("Please connect Google Sheets in Settings first");
      } else {
        toast.showError(
          error instanceof Error
            ? error.message
            : "Failed to download listings. Please try again."
        );
      }
    }
  };

  const handleUpload = async (source: "csv" | "googleSheets") => {
    // Check if Google Sheets is disabled
    if (source === "googleSheets") {
      const optedOut = await checkGoogleSheetsOptOut();
      if (optedOut) {
        toast.showError(
          "Google Sheets integration is disabled. Please enable it in Settings to use this feature."
        );
        return;
      }
    }

    let file: File | null = null;

    if (source === "csv") {
      // File input for CSV
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv";
      input.onchange = async (e) => {
        const selectedFile = (e.target as HTMLInputElement).files?.[0];
        if (!selectedFile) return;

        // Check CSV row count
        try {
          setIsLoading(true);
          setLoadingMessage("Checking file size...");
          const rowCount = await countCSVRows(selectedFile);

          if (exceedsListingLimit(rowCount)) {
            setIsLoading(false);
            setLoadingMessage("");
            const limit = getListingLimit();
            toast.showError(
              `This CSV file has ${rowCount.toLocaleString()} rows, which exceeds our limit of ${limit.toLocaleString()}. ` +
                `Please split the file or use Google Sheets for large datasets.`
            );
            return;
          }

          file = selectedFile;
          await handleFilePreview(selectedFile);
        } catch (error) {
          setIsLoading(false);
          setLoadingMessage("");
          toast.showError("Failed to check CSV file size. Please try again.");
        }
      };
      input.click();
      return;
    } else {
      // Google Sheets
      setIsLoading(true);
      setLoadingMessage("Checking Google Sheet size...");

      try {
        // Check Google Sheets auth
        const googleToken = await checkGoogleSheetsAuthStatus();
        if (!googleToken.authenticated) {
          throw new Error("Please connect Google Sheets in Settings first");
        }

        // Get shop ID
        await getValidAccessToken(); // Etsy
        const shopID = await getShopID();

        // Get sheet metadata
        const storageKey = `clipsy:sheet:shop_${shopID}`;
        const result = await chrome.storage.local.get(storageKey);
        const metadata = result[storageKey];
        const sheetId = metadata?.sheetId || null;

        if (!sheetId) {
          throw new Error(
            "No Google Sheet found. Please download to Google Sheets first."
          );
        }

        // Check row count before reading
        const rowCount = await getSheetRowCount(sheetId);

        if (exceedsListingLimit(rowCount)) {
          setIsLoading(false);
          setLoadingMessage("");
          const limit = getListingLimit();
          toast.showError(
            `This Google Sheet has ${rowCount.toLocaleString()} rows, which exceeds our limit of ${limit.toLocaleString()}. ` +
              `Please split the data across multiple sheets or reduce the number of listings.`
          );
          return;
        }

        // Read listings from sheet as CSV file
        setLoadingMessage("Reading listings from Google Sheet...");
        file = await readListingsFromSheetAsFile(sheetId);

        setIsLoading(false);
        setLoadingMessage("");
        await handleFilePreview(file);
      } catch (error) {
        console.error("Google Sheets upload error:", error);
        setIsLoading(false);
        setLoadingMessage("");
        if (
          error instanceof Error &&
          error.message.includes("Not authenticated")
        ) {
          toast.showError("Please connect Google Sheets in Settings first");
        } else {
          toast.showError(
            error instanceof Error
              ? error.message
              : "Failed to read from Google Sheets. Please try again."
          );
        }
      }
    }
  };

  const handleFilePreview = async (file: File) => {
    setIsLoading(true);
    setLoadingMessage("Analyzing your file...");
    try {
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

      // Check if there are changes
      if (!preview.changes || preview.changes.length === 0) {
        setIsLoading(false);
        setLoadingMessage("");
        toast.showInfo(
          "No changes found in the file. Please try again with a different file."
        );
        return;
      }

      setIsLoading(false);
      setLoadingMessage("");
      // Track successful operation and show review prompt if conditions are met (before opening preview)
      setPreviewData(preview);
      setPreviewFile(file);
    } catch (error) {
      console.error("Preview error:", error);
      setIsLoading(false);
      setLoadingMessage("");
      toast.showError(
        error instanceof Error
          ? error.message
          : "Failed to analyze file. Please try again."
      );
    }
  };

  const handleApplyChanges = async (
    acceptedChangeIds: string[],
    createBackup: boolean
  ) => {
    if (!previewFile || !previewData) return;

    setIsApplying(true);
    setLoadingMessage("Applying changes...");

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
      // Track analytics (determine type from previewFile name or source)
      const uploadType = previewFile?.name?.endsWith(".csv")
        ? "csv"
        : "googleSheets";
      await trackUpload(uploadType, acceptedChangeIds.length);
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

      {/* Large Shop Warning */}
      {exceedsListingLimit(listingCount || 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <h3 className="font-semibold text-yellow-800 mb-1">
                Large Shop Detected
              </h3>
              <p className="text-sm text-yellow-700">
                Your shop has{" "}
                <strong>{listingCount?.toLocaleString() || 0} listings</strong>,
                which exceeds our limit of{" "}
                <strong>{getListingLimit().toLocaleString()}</strong> for CSV
                download/upload. For shops of this size, please use{" "}
                <strong>Google Sheets</strong> for better performance and
                scalability.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* Main Actions */}
      {/* Download Section */}
      <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          Download Listings
        </h2>
        <p className="text-gray-600 mb-6">
          Download all your Etsy listings for editing. You can also download to
          Google Sheets for a more visual way to manage your listings, be
          careful though,{" "}
          <span className="font-bold text-red-500">
            it might overwrite your existing sheet.
          </span>
        </p>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Listing Status
          </label>
          <select
            value={listingStatus}
            onChange={(e) => setListingStatus(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="inactive">Inactive</option>
            <option value="sold_out">Sold Out</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleDownload("csv")}
            disabled={isLoading || exceedsLimit || isCheckingCount}
            className="w-full bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download as CSV
          </button>

          <button
            onClick={() => {
              if (googleSheetsOptedOut) {
                toast.showError(
                  "Google Sheets integration is disabled. Please enable it in Settings to use this feature."
                );
                return;
              }
              handleDownload("googleSheets");
            }}
            disabled={
              isLoading ||
              googleSheetsOptedOut ||
              exceedsLimit ||
              isCheckingCount
            }
            className="w-full bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2v14H3v3c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3V2l-1.5 1.5zM19 19c0 .55-.45 1-1 1s-1-.45-1-1v-3H8V5h11v14z" />
              <path d="M9 7h6v2H9zm7 4H9v2h7zm-7 4h4v2H9z" />
            </svg>
            Download to Google Sheets
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          Upload Listings
        </h2>
        <p className="text-gray-600 mb-6">
          Upload changes to create, update, or delete listings.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => handleUpload("csv")}
            disabled={isLoading || exceedsLimit || isCheckingCount}
            className="w-full bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Upload CSV File
          </button>

          <button
            onClick={() => {
              if (googleSheetsOptedOut) {
                toast.showError(
                  "Google Sheets integration is disabled. Please enable it in Settings to use this feature."
                );
                return;
              }
              handleUpload("googleSheets");
            }}
            disabled={
              isLoading ||
              googleSheetsOptedOut ||
              exceedsLimit ||
              isCheckingCount
            }
            className="w-full bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2v14H3v3c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3V2l-1.5 1.5zM19 19c0 .55-.45 1-1 1s-1-.45-1-1v-3H8V5h11v14z" />
              <path d="M9 7h6v2H9zm7 4H9v2h7zm-7 4h4v2H9z" />
            </svg>
            Upload from Google Sheets
          </button>
        </div>
      </div>

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

      {/* Preview Modal */}
      {previewData && previewFile && (
        <ReviewChanges
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
