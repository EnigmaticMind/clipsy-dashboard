export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-sm max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">1. Information We Collect</h2>
              <p className="text-gray-700 mb-4">
                Clipsy Dashboard is a Chrome extension that helps you manage your Etsy listings. 
                We collect and store the following information:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>OAuth Tokens:</strong> We store Etsy OAuth access tokens and refresh tokens locally in your browser's Chrome storage. These tokens are used to authenticate API requests to Etsy on your behalf.</li>
                <li><strong>Shop Information:</strong> We access your Etsy shop ID and listing data through the Etsy API to enable the extension's functionality.</li>
                <li><strong>No Personal Data:</strong> We do not collect, store, or transmit any personal information such as your name, email address, or payment information.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">2. How We Use Your Information</h2>
              <p className="text-gray-700 mb-4">
                The information we collect is used solely for the following purposes:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>To authenticate API requests to Etsy on your behalf</li>
                <li>To download, display, and update your Etsy listings</li>
                <li>To enable CSV import/export functionality</li>
                <li>To provide the core features of the extension</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. Data Storage</h2>
              <p className="text-gray-700 mb-4">
                All data is stored locally on your device:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Local Storage:</strong> OAuth tokens are stored in Chrome's local storage, which is encrypted and only accessible by this extension.</li>
                <li><strong>No Cloud Storage:</strong> We do not store any of your data on external servers or cloud services.</li>
                <li><strong>No Backend:</strong> This extension operates entirely client-side. All API requests go directly from your browser to Etsy's servers.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. Data Sharing</h2>
              <p className="text-gray-700 mb-4">
                We do not share, sell, or transmit your data to any third parties:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>No Third-Party Services:</strong> We do not use analytics services, advertising networks, or any other third-party services that would collect your data.</li>
                <li><strong>Etsy API Only:</strong> The only external service we communicate with is Etsy's official API, and only with your explicit authorization.</li>
                <li><strong>No Data Transmission:</strong> All data processing happens locally in your browser.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">5. Your Rights</h2>
              <p className="text-gray-700 mb-4">
                You have full control over your data:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>Revoke Access:</strong> You can revoke the extension's access to your Etsy account at any time through your Etsy account settings.</li>
                <li><strong>Uninstall:</strong> Uninstalling the extension will remove all locally stored data, including OAuth tokens.</li>
                <li><strong>Clear Data:</strong> You can clear the extension's stored data through Chrome's extension settings.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">6. Security</h2>
              <p className="text-gray-700 mb-4">
                We take security seriously:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><strong>OAuth 2.0:</strong> We use industry-standard OAuth 2.0 with PKCE for secure authentication.</li>
                <li><strong>HTTPS Only:</strong> All API communications use HTTPS encryption.</li>
                <li><strong>Local Storage:</strong> Tokens are stored in Chrome's secure local storage, which is encrypted.</li>
                <li><strong>No Credentials in Code:</strong> We never hardcode or expose sensitive credentials in the extension code.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Contact Form</h2>
              <p className="text-gray-700 mb-4">
                If you use the contact form in the extension:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Your name, email, and message are sent to Formspree, a third-party form handling service.</li>
                <li>This data is used solely to respond to your inquiry and is not stored by us.</li>
                <li>Please refer to <a href="https://formspree.io/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Formspree's Privacy Policy</a> for details on how they handle your data.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Changes to This Policy</h2>
              <p className="text-gray-700 mb-4">
                We may update this Privacy Policy from time to time. We will notify you of any changes by:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li>Updating the "Last updated" date at the top of this page</li>
                <li>Posting a notice in the extension if significant changes are made</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. Contact Us</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about this Privacy Policy, please contact us through the contact form in the extension.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. Etsy API</h2>
              <p className="text-gray-700 mb-4">
                This extension uses the Etsy API. By using this extension, you agree to comply with:
              </p>
              <ul className="list-disc pl-6 text-gray-700 mb-4">
                <li><a href="https://www.etsy.com/legal/api" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Etsy's API Terms of Use</a></li>
                <li><a href="https://www.etsy.com/legal/terms-of-use" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Etsy's Terms of Use</a></li>
              </ul>
              <p className="text-gray-700 mb-4">
                The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

