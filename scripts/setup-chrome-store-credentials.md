# Chrome Web Store Upload Setup Guide

This guide will help you set up credentials for uploading your extension to the Chrome Web Store.

## Step 1: Get Chrome Web Store API Credentials

### 1.1 Create/Select Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project name/ID

### 1.2 Enable Chrome Web Store API

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Chrome Web Store API"
3. Click on it and press **Enable**

### 1.3 Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure the OAuth consent screen first:
   - Choose **External** (unless you have a Google Workspace)
   - Fill in required fields (App name, User support email, Developer contact)
   - Add scopes: `https://www.googleapis.com/auth/chromewebstore`
   - Save and continue through the steps
4. Back in Credentials, create OAuth client ID:
   - Application type: **Web application**
   - Name: "Chrome Web Store Upload" (or any name)
   - **Authorized redirect URIs**: Click "Add URI" and enter: `http://localhost:8080`
     - ⚠️ **Important:** Google has deprecated `urn:ietf:wg:oauth:2.0:oob`, so we use localhost instead
     - After authorization, you'll be redirected here and can copy the code from the URL
   - Click **Create**
5. **Copy and save**:
   - **Client ID** (looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
   - **Client Secret** (looks like: `GOCSPX-abcdefghijklmnopqrstuvwxyz`)

## Step 2: Get Refresh Token

You need to generate a refresh token using the OAuth 2.0 flow. Here are two methods:

### Method 1: Using Node.js Script (Recommended)

Create a temporary file `get-refresh-token.js`:

```javascript
import https from 'https';
import { URLSearchParams } from 'url';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  const clientId = await question('Enter your Client ID: ');
  const clientSecret = await question('Enter your Client Secret: ');
  
  // Step 1: Get authorization code
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('https://www.googleapis.com/auth/chromewebstore')}`;
  
  console.log('\n1. Open this URL in your browser:');
  console.log(authUrl);
  console.log('\n2. Authorize the application');
  console.log('3. Copy the authorization code from the page');
  const authCode = await question('\nEnter the authorization code: ');
  
  // Step 2: Exchange authorization code for refresh token
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('code', authCode);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', 'urn:ietf:wg:oauth:2.0:oob');
  
  const postData = params.toString();
  
  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error('Error:', data);
        rl.close();
        process.exit(1);
      }
      const response = JSON.parse(data);
      console.log('\n✅ Success! Your refresh token:');
      console.log(response.refresh_token);
      console.log('\nSave this token securely!');
      rl.close();
    });
  });
  
  req.on('error', (error) => {
    console.error('Error:', error);
    rl.close();
    process.exit(1);
  });
  
  req.write(postData);
  req.end();
}

main();
```

Run it:
```bash
node get-refresh-token.js
```

### Method 2: Using Online Tool

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. In the left panel, find "Chrome Web Store API v1"
6. Select scope: `https://www.googleapis.com/auth/chromewebstore`
7. Click "Authorize APIs"
8. Sign in and authorize
9. Click "Exchange authorization code for tokens"
10. Copy the **Refresh token** value

## Step 3: Get Your Extension ID

1. Load your extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select your `dist` folder
2. Find your extension in the list
3. Copy the **ID** (long string of letters, e.g., `abcdefghijklmnopqrstuvwxyz123456`)

## Step 4: Configure Credentials

### For Local Testing

Create a `.env` file in the project root (add to `.gitignore`):

```bash
CHROME_EXTENSION_ID=your-extension-id-here
CHROME_CLIENT_ID=your-client-id-here
CHROME_CLIENT_SECRET=your-client-secret-here
CHROME_REFRESH_TOKEN=your-refresh-token-here
```

Then load them before running the script:

```bash
export $(cat .env | xargs)
node scripts/upload-to-chrome-store.js
```

### For GitHub Actions

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each:
   - `CHROME_EXTENSION_ID` = your extension ID
   - `CHROME_CLIENT_ID` = your OAuth client ID
   - `CHROME_CLIENT_SECRET` = your OAuth client secret
   - `CHROME_REFRESH_TOKEN` = your refresh token

## Step 5: Test the Upload

### Test Locally

1. Build your extension:
   ```bash
   npm run build
   ```

2. Create the zip file:
   ```bash
   cd dist
   zip -r ../clipsy-extension.zip . -x "*.map" "*.DS_Store" "*.log"
   cd ..
   ```

3. Run the upload script:
   ```bash
   # Using environment variables
   export CHROME_EXTENSION_ID="your-id"
   export CHROME_CLIENT_ID="your-client-id"
   export CHROME_CLIENT_SECRET="your-secret"
   export CHROME_REFRESH_TOKEN="your-token"
   node scripts/upload-to-chrome-store.js
   
   # Or using command-line arguments
   node scripts/upload-to-chrome-store.js \
     "your-extension-id" \
     "your-client-id" \
     "your-client-secret" \
     "your-refresh-token" \
     "./clipsy-extension.zip" \
     "false"
   ```

### Test via GitHub Actions

1. Create and push a version tag:
   ```bash
   git tag v0.1.2
   git push origin v0.1.2
   ```

2. Or manually trigger the workflow:
   - Go to **Actions** tab in GitHub
   - Select "Deploy to Chrome Web Store" workflow
   - Click "Run workflow"

## Troubleshooting

### "Failed to get access token"
- Check that your Client ID and Client Secret are correct
- Verify the refresh token hasn't been revoked
- Make sure Chrome Web Store API is enabled in Google Cloud Console

### "Upload failed: 401"
- Your access token might be invalid
- Check that the refresh token is correct
- Try generating a new refresh token

### "Upload failed: 403"
- Your extension ID might be incorrect
- Verify you have permission to upload to this extension
- Check that the extension exists in the Chrome Web Store Developer Dashboard

### "Upload failed: 400"
- The zip file might be corrupted or invalid
- Make sure the zip contains a valid Chrome extension (with manifest.json)
- Check the zip file size (Chrome Web Store has size limits)

## Security Notes

- **Never commit credentials to git**
- Store secrets in environment variables or GitHub Secrets
- Add `.env` to `.gitignore`
- Rotate credentials if they're ever exposed
- Use different credentials for development and production if possible

