export default function HowItWorksPage() {
  return (
    <>
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">How It Works</h1>
        <p className="text-xl text-gray-600">
          A step-by-step guide to managing your Etsy listings
        </p>
      </div>

      {/* How It Works Section */}
      <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
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
                Select the listing status you want to export (Active, Draft,
                Inactive, etc.) and choose how you want to download:
              </p>
              <ul className="text-gray-600 text-sm mt-2 ml-4 list-disc space-y-1">
                <li>
                  <strong>CSV File:</strong> Download a CSV file containing all
                  your Etsy listings with their details, variations, and
                  properties
                </li>
                <li>
                  <strong>Google Sheets:</strong> Sync directly to Google Sheets
                  for a more visual way to manage your listings
                </li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <span className="text-indigo-600 font-bold text-lg">2</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">
                Edit Your Listings
              </h3>
              <p className="text-gray-600 text-sm">
                Make your changes using your preferred method:
              </p>
              <ul className="text-gray-600 text-sm mt-2 ml-4 list-disc space-y-1">
                <li>
                  <strong>CSV:</strong> Open the CSV file in Excel, Google
                  Sheets, or any spreadsheet editor. Edit titles, descriptions,
                  prices, quantities, tags, and more
                </li>
                <li>
                  <strong>Google Sheets:</strong> Edit directly in the synced
                  Google Sheet - changes are automatically saved
                </li>
              </ul>
              <p className="text-gray-600 text-sm mt-2">
                Save your changes when you're done editing.
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
                Upload your edited CSV file or sync from Google Sheets. The
                system will analyze your changes and show you a detailed preview
                of what will be created, updated, or deleted before making any
                changes to your Etsy shop.
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
                Review each change with side-by-side comparisons showing what
                will change and what it will change to. Select which changes you
                want to apply and which to skip. You have full control over what
                gets updated on Etsy.
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
                changes you approved will be applied. A CSV backup of all
                listings that will be changed will be automatically created and
                downloaded before any changes are applied, so you have a copy of
                your original data just in case you need to restore anything.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy & Security */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8">
        <h3 className="font-semibold text-green-900 mb-3">
          🔒 Privacy & Security
        </h3>
        <p className="text-sm text-green-800 mb-2">
          All data processing happens locally in your browser. Your Etsy
          listings, authentication tokens, and CSV files never leave your
          device. The extension author has no access to your data at any point.
        </p>
        <p className="text-sm text-green-800">
          When using Google Sheets, your data is stored in your own Google
          account and is subject to Google's privacy policies.
        </p>
      </div>

      {/* Additional Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-3">💡 Tips</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>
            • Keep the <strong>Listing ID</strong> and{" "}
            <strong>Product ID</strong> columns intact when editing - these are
            used to identify which listings to update
          </li>
          <li>
            • To create a new listing, leave the <strong>Listing ID</strong>{" "}
            column empty
          </li>
          <li>
            • To delete a listing, set the <strong>SKU</strong> column to
            "DELETE"
          </li>
          <li>
            • To delete a variation, set the <strong>Variation SKU</strong>{" "}
            column to "DELETE"
          </li>
          <li>
            • Always review the preview before applying changes to ensure
            everything looks correct
          </li>
          <li>
            • A CSV backup is automatically created and downloaded before any
            changes are applied - keep this file safe in case you need to
            restore your listings
          </li>
          <li>
            • For large shops (over 1,000 listings), use Google Sheets for
            better performance and scalability
          </li>
          <li>
            • Google Sheets automatically organizes listings by status (Active,
            Inactive, Draft, etc.) into separate tabs
          </li>
        </ul>
      </div>
    </>
  );
}
