// Google Sheets OAuth service - client-side only
// Uses chrome.identity.getAuthToken() for Chrome Extension OAuth

import { logger } from '../utils/logger'

// Check if user has opted out of Google Sheets
export async function checkGoogleSheetsOptOut(): Promise<boolean> {
  const result = await chrome.storage.local.get("clipsy:googleSheetsOptOut");
  return result["clipsy:googleSheetsOptOut"] === true;
}

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly'
].join(' ')

export interface GoogleToken {
  access_token: string
  token_type: string
  expires_in?: number
  expires_on?: number
  scope: string
}

export const STORAGE_TOKEN_NAME = 'clipsy:googleToken'

// Store token in chrome.storage
async function storeToken(token: GoogleToken): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_TOKEN_NAME]: token })
}

// Get stored token
export async function getStoredToken(): Promise<GoogleToken | null> {
  const result = await chrome.storage.local.get(STORAGE_TOKEN_NAME)
  return result[STORAGE_TOKEN_NAME] || null
}

// Remove token
export async function removeToken(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_TOKEN_NAME)
  
  // Also remove from Chrome's identity cache
  const token = await getStoredToken()
  if (token && chrome.identity && chrome.identity.removeCachedAuthToken) {
    chrome.identity.removeCachedAuthToken({ token: token.access_token })
  }
}

// Initialize Google OAuth flow using chrome.identity.getAuthToken()
export async function initGoogleOAuthFlow(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.getAuthToken) {
    throw new Error('Chrome identity API not available')
  }

  // Get extension ID for error messages
  const extensionId = chrome.runtime.id
  logger.log('Starting Google OAuth flow with getAuthToken')
  logger.log('Extension ID:', extensionId)

  return new Promise((resolve, reject) => {
    // getAuthToken() reads client_id and scopes from manifest.json oauth2 field
    // Scopes are optional here since they're in the manifest, but we include them for clarity
    chrome.identity.getAuthToken(
      {
        interactive: true,
        // scopes: GOOGLE_SCOPES.split(' '), // Optional - also defined in manifest.json oauth2.scopes
      },
      async (token) => {
        // getAuthToken() callback receives the token as a string directly, not an object
        logger.log('Google OAuth token received:', token ? 'Token present' : 'No token')
        logger.log('Token type:', typeof token)
        
        // Check for errors first
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || 'Unknown error'
          logger.error('Google OAuth error:', errorMsg)
          logger.error('Chrome runtime lastError:', chrome.runtime.lastError)
          
          // Provide helpful error messages
          if (errorMsg.includes('Invalid OAuth2 Client ID') || errorMsg.includes('OAuth2')) {
            const helpfulError = new Error(
              `Invalid OAuth2 Client ID. For chrome.identity.getAuthToken() to work:\n\n` +
              `1. Go to Google Cloud Console → APIs & Services → Credentials\n` +
              `2. Find or create a "Chrome Extension" type OAuth client\n` +
              `3. Register your extension ID: ${extensionId}\n` +
              `4. Make sure the extension ID matches exactly\n\n` +
              `Alternatively, you can use a "Web Application" client ID with launchWebAuthFlow() instead.`
            )
            reject(helpfulError)
            return
          }
          
          reject(new Error(errorMsg))
          return
        }

        // Check if token is empty or missing
        if (!token || typeof token !== 'string') {
          logger.error('Token is empty/null/undefined or not a string')
          reject(new Error('No token received from getAuthToken - extension ID may not be registered in Chrome Extension OAuth client'))
          return
        }

        logger.log('Google OAuth token received successfully')

        // Store token
        const googleToken: GoogleToken = {
          access_token: token,
          token_type: 'Bearer',
          scope: GOOGLE_SCOPES, // Chrome handles scopes automatically
        }

        await storeToken(googleToken)
        resolve()
      }
    )
  })
}

// Get valid access token (Chrome handles refresh automatically)
export async function getValidAccessToken(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.getAuthToken) {
    // Fallback: try to use stored token
    const token = await getStoredToken()
    if (!token) {
      throw new Error('Not authenticated with Google Sheets. Chrome identity API not available.')
    }
    return token.access_token
  }

  // Use Chrome's getAuthToken - it automatically handles refresh
  // Client ID and scopes are read from manifest.json oauth2 field
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      {
        interactive: false, // Don't show UI if token is cached
        scopes: GOOGLE_SCOPES.split(' '), // Optional - also defined in manifest.json oauth2.scopes
      },
      (token) => {
        // getAuthToken() callback receives the token as a string directly
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || 'Unknown error'
          
          // If user needs to re-authenticate, they need to call initGoogleOAuthFlow
          if (errorMsg.includes('OAuth2') || errorMsg.includes('authentication')) {
            reject(new Error('Google Sheets authentication expired. Please reconnect.'))
            return
          }
          
          logger.error('Failed to get Google token:', errorMsg)
          reject(new Error(errorMsg))
          return
        }

        if (!token || typeof token !== 'string') {
          reject(new Error('No token available. Please authenticate first.'))
          return
        }

        // Update stored token
        const googleToken: GoogleToken = {
          access_token: token,
          token_type: 'Bearer',
          scope: GOOGLE_SCOPES, // Chrome handles scopes automatically
        }
        storeToken(googleToken).catch(err => logger.error('Failed to store token:', err))

        resolve(token)
      }
    )
  })
}

// Check Google Sheets authentication status
export async function checkGoogleSheetsAuthStatus(): Promise<{ authenticated: boolean; expiresAt?: number }> {
  if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.getAuthToken) {
    // Fallback: check stored token
    const token = await getStoredToken()
    return { authenticated: !!token }
  }

  // Try to get token (non-interactive) to check if authenticated
  // Client ID and scopes are read from manifest.json oauth2 field
  return new Promise((resolve) => {
    chrome.identity.getAuthToken(
      {
        interactive: false,
        scopes: GOOGLE_SCOPES.split(' '), // Optional - also defined in manifest.json oauth2.scopes
      },
      (token) => {
        // getAuthToken() callback receives the token as a string directly
        if (chrome.runtime.lastError || !token || typeof token !== 'string') {
          resolve({ authenticated: false })
          return
        }

        // Update stored token
        const googleToken: GoogleToken = {
          access_token: token,
          token_type: 'Bearer',
          scope: GOOGLE_SCOPES, // Chrome handles scopes automatically
        }
        storeToken(googleToken).catch(err => logger.error('Failed to store token:', err))

        resolve({ authenticated: true })
      }
    )
  })
}
