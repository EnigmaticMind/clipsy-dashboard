#!/usr/bin/env node

/**
 * Test Chrome Web Store credentials without uploading
 * This script validates that your credentials are correct by attempting to get an access token
 */

import https from 'https';
import { URLSearchParams } from 'url';

const [
  clientIdArg,
  clientSecretArg,
  refreshTokenArg
] = process.argv.slice(2);

// Support both command-line arguments and environment variables
const clientId = clientIdArg || process.env.CHROME_CLIENT_ID;
const clientSecret = clientSecretArg || process.env.CHROME_CLIENT_SECRET;
const refreshToken = refreshTokenArg || process.env.CHROME_REFRESH_TOKEN;

if (!clientId || !clientSecret || !refreshToken) {
  console.error('Usage: node test-chrome-store-credentials.js [client-id] [client-secret] [refresh-token]');
  console.error('');
  console.error('Alternatively, set these environment variables:');
  console.error('  CHROME_CLIENT_ID');
  console.error('  CHROME_CLIENT_SECRET');
  console.error('  CHROME_REFRESH_TOKEN');
  process.exit(1);
}

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('refresh_token', refreshToken);
    params.append('grant_type', 'refresh_token');
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
          reject(new Error(`Failed to get access token: ${res.statusCode} ${data}`));
          return;
        }
        const response = JSON.parse(data);
        resolve(response.access_token);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('🧪 Testing Chrome Web Store credentials...\n');
  console.log('Client ID:', clientId.substring(0, 20) + '...');
  console.log('Client Secret:', clientSecret.substring(0, 10) + '...');
  console.log('Refresh Token:', refreshToken.substring(0, 20) + '...\n');
  
  try {
    console.log('🔄 Attempting to get access token...');
    const accessToken = await getAccessToken();
    
    if (accessToken) {
      console.log('✅ Success! Credentials are valid.');
      console.log('   Access token obtained successfully.');
      console.log('   You can use these credentials to upload to Chrome Web Store.\n');
      console.log('💡 Next steps:');
      console.log('   1. Make sure CHROME_EXTENSION_ID is also set');
      console.log('   2. Build your extension: npm run build');
      console.log('   3. Create zip file and upload using upload-to-chrome-store.js');
    } else {
      console.error('❌ Failed: No access token received');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   - Verify your Client ID and Client Secret are correct');
    console.error('   - Check that your refresh token hasn\'t been revoked');
    console.error('   - Make sure Chrome Web Store API is enabled in Google Cloud Console');
    console.error('   - Try generating a new refresh token using get-refresh-token.js');
    process.exit(1);
  }
}

main();

