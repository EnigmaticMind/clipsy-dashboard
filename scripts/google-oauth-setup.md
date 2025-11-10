# Google Sheets OAuth Setup Guide

## Chrome Extension OAuth Client Configuration

Your Chrome Extension OAuth client is configured as:

```json
{
  "installed": {
    "client_id": "991784404129-o476qs97mc2p4cvsd35h18tg247357pc.apps.googleusercontent.com",
    "project_id": "etsy-api-420622",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
  }
}
```

## Important: Register Extension ID

For `chrome.identity.getAuthToken()` to work, you **must** register your extension ID in the Chrome Extension OAuth client.

### Steps to Register Extension ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **etsy-api-420622**
3. Navigate to **APIs & Services** → **Credentials**
4. Find your Chrome Extension OAuth client: `991784404129-o476qs97mc2p4cvsd35h18tg247357pc`
5. Click on the client to edit it
6. In the **Application ID** or **Extension ID** field, add:
   ```
   fneojnnbgbogeopngljlphapcakjglhe
   ```
7. Save the changes

### Verify Extension ID

Your production extension ID is: **fneojnnbgbogeopngljlphapcakjglhe**

This ID is derived from the public key in your manifest. To verify:
- Load the extension in Chrome
- Go to `chrome://extensions/`
- Find your extension and check the ID matches

## How It Works

`chrome.identity.getAuthToken()` automatically:
- Uses your extension ID (from `chrome.runtime.id`)
- Looks up the Chrome Extension OAuth client associated with that ID
- Requests tokens for the specified scopes

**No client ID parameter is needed** - Chrome handles it automatically based on the extension ID.

## Required Scopes

The extension requests these scopes:
- `https://www.googleapis.com/auth/spreadsheets` - Read/write Google Sheets
- `https://www.googleapis.com/auth/drive.readonly` - Read Google Drive (for sheet metadata)

## Troubleshooting

### Error: "Invalid OAuth2 Client ID"

This means your extension ID is not registered in the Chrome Extension OAuth client.

**Solution:**
1. Verify your extension ID: `fneojnnbgbogeopngljlphapcakjglhe`
2. Go to Google Cloud Console → Credentials
3. Edit the Chrome Extension OAuth client
4. Add your extension ID to the "Application ID" field
5. Save and wait a few minutes for changes to propagate
6. Try again

### Error: "OAuth2 access denied"

This means the user denied permission or the scopes aren't approved.

**Solution:**
1. Check that the OAuth consent screen is configured
2. Verify the scopes are added to the consent screen
3. User may need to revoke and re-authorize

## Alternative: Web Application Client ID

If you prefer to use `chrome.identity.launchWebAuthFlow()` instead:
1. Create a "Web Application" OAuth client
2. Add redirect URI: `https://fneojnnbgbogeopngljlphapcakjglhe.chromiumapp.org/dashboard.html`
3. Update the code to use `launchWebAuthFlow()` instead of `getAuthToken()`

This approach doesn't require registering the extension ID, but requires managing redirect URIs.

