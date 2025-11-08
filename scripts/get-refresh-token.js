#!/usr/bin/env node

/**
 * Helper script to get a Chrome Web Store API refresh token
 * This script guides you through the OAuth 2.0 flow to obtain a refresh token
 */

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
  console.log('🔐 Chrome Web Store Refresh Token Generator\n');
  console.log('You will need:');
  console.log('  1. OAuth Client ID from Google Cloud Console');
  console.log('  2. OAuth Client Secret from Google Cloud Console\n');
  
  const clientId = await question('Enter your Client ID: ');
  if (!clientId) {
    console.error('❌ Client ID is required');
    rl.close();
    process.exit(1);
  }
  
  const clientSecret = await question('Enter your Client Secret: ');
  if (!clientSecret) {
    console.error('❌ Client Secret is required');
    rl.close();
    process.exit(1);
  }
  
  // Use localhost redirect URI (OOB is deprecated)
  const redirectUri = 'http://localhost:8080';
  
  // Step 1: Get authorization code
  // Include access_type=offline and prompt=consent to get a refresh token
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('https://www.googleapis.com/auth/chromewebstore')}&` +
    `access_type=offline&` +
    `prompt=consent`;
  
  console.log('\n📋 Follow these steps:');
  console.log('1. Make sure you have added this redirect URI to your OAuth client:');
  console.log(`   ${redirectUri}\n`);
  console.log('2. Open this URL in your browser:');
  console.log(`\n   ${authUrl}\n`);
  console.log('3. Sign in with the Google account that has access to your Chrome Web Store developer account');
  console.log('4. Click "Allow" to authorize the application');
  console.log('5. After authorization, you will be redirected to localhost:8080');
  console.log('6. Copy the ENTIRE URL from your browser address bar (it will contain ?code=...)');
  console.log('   Example: http://localhost:8080/?code=4/0AeanS...&scope=...\n');
  
  const redirectUrl = await question('Paste the full redirect URL here: ');
  
  // Extract code from redirect URL
  let authCode = null;
  try {
    const url = new URL(redirectUrl);
    authCode = url.searchParams.get('code');
  } catch (error) {
    // If not a full URL, try to extract code manually
    const codeMatch = redirectUrl.match(/[?&]code=([^&]+)/);
    if (codeMatch) {
      authCode = codeMatch[1];
    }
  }
  
  if (!authCode) {
    console.error('\n❌ Could not find authorization code in the URL.');
    console.error('Please paste the full redirect URL, including the ?code=... part');
    console.error('Example: http://localhost:8080/?code=4/0AeanS...&scope=...');
    rl.close();
    process.exit(1);
  }
  
  console.log('\n🔄 Exchanging authorization code for refresh token...');
  
  // Step 2: Exchange authorization code for refresh token
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('code', authCode);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', redirectUri);
  
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
        console.error('\n❌ Error getting refresh token:');
        console.error(`Status: ${res.statusCode}`);
        console.error(`Response: ${data}`);
        console.error('\nCommon issues:');
        console.error('  - Authorization code may have expired (they expire quickly)');
        console.error('  - Client ID or Client Secret may be incorrect');
        console.error('  - Try running the script again to get a fresh authorization code');
        rl.close();
        process.exit(1);
      }
      
      try {
        const response = JSON.parse(data);
        if (response.refresh_token) {
          console.log('\n✅ Success! Your refresh token:');
          console.log(`\n${response.refresh_token}\n`);
          console.log('📝 Save this token securely!');
          console.log('   - Add it to GitHub Secrets as CHROME_REFRESH_TOKEN');
          console.log('   - Or add it to your .env file for local testing');
          console.log('\n⚠️  Keep this token private - it provides access to your Chrome Web Store account');
        } else {
          console.error('\n❌ No refresh token in response:');
          console.error(JSON.stringify(response, null, 2));
          console.error('\n💡 This usually means:');
          console.error('   - The authorization URL didn\'t include access_type=offline and prompt=consent');
          console.error('   - You\'ve already authorized this app before (refresh tokens are only issued on first authorization)');
          console.error('\n🔧 Solution:');
          console.error('   1. Make sure you\'re using the latest version of this script');
          console.error('   2. Try revoking access: https://myaccount.google.com/permissions');
          console.error('   3. Run this script again to get a fresh authorization');
        }
      } catch (error) {
        console.error('\n❌ Error parsing response:', error.message);
        console.error('Response:', data);
      }
      
      rl.close();
    });
  });
  
  req.on('error', (error) => {
    console.error('\n❌ Network error:', error.message);
    rl.close();
    process.exit(1);
  });
  
  req.write(postData);
  req.end();
}

main();

