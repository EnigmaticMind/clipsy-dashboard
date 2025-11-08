#!/usr/bin/env node

/**
 * Upload Chrome Extension to Chrome Web Store
 * Uses the Chrome Web Store API to upload and optionally publish extensions
 */

import fs from 'fs';
import https from 'https';
import { URLSearchParams } from 'url';

const [
  extensionId,
  clientId,
  clientSecret,
  refreshToken,
  zipFilePath,
  publish = 'false'
] = process.argv.slice(2);

if (!extensionId || !clientId || !clientSecret || !refreshToken || !zipFilePath) {
  console.error('Usage: node upload-to-chrome-store.js <extension-id> <client-id> <client-secret> <refresh-token> <zip-file> [publish]');
  process.exit(1);
}

const shouldPublish = publish === 'true';

// Step 1: Get access token using refresh token
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

// Step 2: Upload the zip file
function uploadExtension(accessToken) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(zipFilePath)) {
      reject(new Error(`Zip file not found: ${zipFilePath}`));
      return;
    }

    const zipData = fs.readFileSync(zipFilePath);
    const options = {
      hostname: 'www.googleapis.com',
      path: `/upload/chromewebstore/v1.1/items/${extensionId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-goog-api-version': '2',
        'Content-Type': 'application/zip',
        'Content-Length': zipData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Upload failed: ${res.statusCode} ${data}`));
          return;
        }
        const response = JSON.parse(data);
        console.log('Upload successful:', response);
        resolve(response);
      });
    });

    req.on('error', reject);
    req.write(zipData);
    req.end();
  });
}

// Step 3: Publish the extension (optional)
function publishExtension(accessToken) {
  if (!shouldPublish) {
    console.log('Skipping publish (publish=false). Extension submitted for review.');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      target: 'default', // or 'trustedTesters'
      publishTarget: 'default'
    });

    const options = {
      hostname: 'www.googleapis.com',
      path: `/chromewebstore/v1.1/items/${extensionId}/publish`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-goog-api-version': '2',
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Publish failed: ${res.statusCode} ${data}`));
          return;
        }
        const response = JSON.parse(data);
        console.log('Publish successful:', response);
        resolve(response);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Main execution
async function main() {
  try {
    console.log('Getting access token...');
    const accessToken = await getAccessToken();
    
    console.log('Uploading extension...');
    await uploadExtension(accessToken);
    
    if (shouldPublish) {
      console.log('Publishing extension...');
      await publishExtension(accessToken);
      console.log('✅ Extension uploaded and published successfully!');
    } else {
      console.log('✅ Extension uploaded successfully! (submitted for review)');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

