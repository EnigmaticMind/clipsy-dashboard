// OAuth service for Etsy authentication - client-side only
// Based on PKCE flow, no backend needed

import { logger } from '../utils/logger'

const ETSY_AUTH_URL = 'https://www.etsy.com/oauth/connect'
const ETSY_SIGNIN_URL = 'https://www.etsy.com/oauth2/signin'
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'

// Get Etsy Client ID - hardcoded for extension
// Note: Client ID is public and safe to include in the extension
function getClientID(): string {
  // Get it from https://www.etsy.com/developers
  return '5q20ft9kbl9f39p2hxaekkdw'
}

function getRedirectURL(): string {
  // For Chrome extension, use chrome.identity.getRedirectURL()
  // We can include dashboard.html#/auth in the redirect URL so that:
  // 1. Etsy redirects to: https://<extension-id>.chromiumapp.org/dashboard.html?code=...&state=...#/auth
  // 2. The browser loads dashboard.html with query params and hash
  // 3. React Router routes to /auth based on the hash
  // 4. AuthPage can read the code/state from query params
  if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL) {
    // Get base redirect URL and append dashboard.html#/auth
    const redirectURL = chrome.identity.getRedirectURL('dashboard.html')
    logger.log('Chrome extension redirect URL:', redirectURL)
    return redirectURL
  }
  
  // Fallback for development (web app mode)
  return window.location.origin + '/auth'
}

export interface EtsyToken {
  access_token: string
  token_type: string
  expires_in: number
  expires_on: number // Calculated: Date.now() + expires_in * 1000
  refresh_token: string
}

export const STORAGE_TOKEN_NAME = 'clipsy:etsyToken'

// PKCE Helper Functions
function dec2hex(dec: number): string {
  return ('0' + dec.toString(16)).substr(-2)
}

function generateCodeVerifier(): string {
  const array = new Uint32Array(56 / 2)
  crypto.getRandomValues(array)
  return Array.from(array, dec2hex).join('')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return crypto.subtle.digest('SHA-256', data)
}

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i])
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const hashed = await sha256(codeVerifier)
  return base64URLEncode(hashed)
}

// Generate random state for CSRF protection
function generateState(): string {
  const array = new Uint32Array(8)
  crypto.getRandomValues(array)
  return Array.from(array, dec2hex).join('')
}

// Initialize OAuth flow - returns auth URL
// For Chrome extension, uses chrome.identity.launchWebAuthFlow
// For web app, returns URL for redirect
export async function initOAuthFlow(): Promise<{ authUrl: string; state: string; codeVerifier: string }> {
  const clientID = getClientID()
  const redirectURL = getRedirectURL()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateState()

  logger.log('Redirect URL:', redirectURL)
  
  const scopes = ['listings_r', 'listings_w', 'shops_r', 'listings_d']
  
  // First, construct the OAuth connect URL
  const oauthParams = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectURL,
    scope: scopes.join(' '),
    client_id: clientID,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state,
  })
  
  const oauthConnectUrl = `${ETSY_AUTH_URL}?${oauthParams.toString()}`
  
  // Use the signin URL directly with from_page parameter
  // This works around chrome.identity.launchWebAuthFlow not handling redirects properly
  // The signin URL works both when logged in and when not logged in, and is less likely to be blocked
  const signinParams = new URLSearchParams({
    from_page: oauthConnectUrl,
    lp: '1',
    show_social_sign_in: '1',
    is_from_etsyapp: '0',
    initial_state: 'sign-in',
    client_id: clientID,
  })
  
  const authUrl = `${ETSY_SIGNIN_URL}?${signinParams.toString()}`

  // Store code verifier and state in sessionStorage for later use
  sessionStorage.setItem('oauth_code_verifier', codeVerifier)
  sessionStorage.setItem('oauth_state', state)
  sessionStorage.setItem('oauth_redirect_uri', redirectURL)

  // For Chrome extension, launch auth flow directly
  if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.launchWebAuthFlow) {
    logger.log('Starting OAuth flow with redirect URL:', redirectURL)
    logger.log('OAuth connect URL:', oauthConnectUrl)
    logger.log('Auth URL (signin):', authUrl)
    
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        async (redirectUrl) => {
          logger.log('Redirect URL Response:', redirectUrl)
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message
            logger.error('OAuth error:', errorMsg)
            logger.error('Chrome runtime error details:', {
              message: chrome.runtime.lastError.message,
              error: chrome.runtime.lastError
            })

            // Provide more helpful error messages
            if (errorMsg && (errorMsg.includes('redirect_uri_mismatch') || errorMsg.includes('redirect'))) {
              reject(new Error(
                `Redirect URI mismatch. Please register this redirect URL in your Etsy app settings: ${redirectURL}\n\n` +
                `Go to https://www.etsy.com/developers and add this URL to your app's redirect URIs.`
              ))
            } else if (errorMsg && errorMsg.includes('Authorization page could not be loaded')) {
              // Fallback: Try opening in a new tab as a last resort
              logger.warn('Popup blocked or failed to load. Attempting fallback...')
              try {
                // Open in new tab - user will need to manually complete the flow
                await chrome.tabs.create({ url: authUrl })
                reject(new Error(
                  `Authorization popup was blocked or failed to load.\n\n` +
                  `A new tab has been opened with the authentication page.\n` +
                  `Please complete the authentication in that tab.\n\n` +
                  `After authentication, you'll be redirected back to the extension.\n\n` +
                  `To prevent this in the future:\n` +
                  `1. Allow popups for this extension\n` +
                  `2. Check Chrome's popup blocker settings\n` +
                  `3. Ensure the redirect URL is registered: ${redirectURL}`
                ))
              } catch (tabError) {
                reject(new Error(
                  `Authorization page could not be loaded.\n\n` +
                  `Possible causes:\n` +
                  `1. Network connectivity issue - check your internet connection\n` +
                  `2. Popup blocker - make sure popups are allowed for this extension\n` +
                  `3. Etsy OAuth service issue - try again in a few moments\n` +
                  `4. Redirect URL mismatch - verify this URL is registered in Etsy: ${redirectURL}\n\n` +
                  `Registered redirect URL should be: ${redirectURL}\n` +
                  `Check your Etsy app settings at https://www.etsy.com/developers\n\n` +
                  `You can also try manually opening this URL:\n${authUrl}`
                ))
              }
            } else {
              reject(new Error(errorMsg))
            }
            return
          }
          
          if (!redirectUrl) {
            reject(new Error('No redirect URL received from OAuth flow'))
            return
          }
          
          logger.log('Received redirect URL:', redirectUrl)
          logger.log('Full redirect URL for debugging:', JSON.stringify(redirectUrl))
          
          // Parse code and state from redirect URL
          const url = new URL(redirectUrl)
          const urlSearchParams = url.searchParams
          logger.log('Parsed URL search params:', url.search)
          logger.log('URL search params entries:', Array.from(url.searchParams.entries()))
          
          const code = urlSearchParams.get('code')
          const returnedState = urlSearchParams.get('state')
          const error = urlSearchParams.get('error')
          const errorDescription = urlSearchParams.get('error_description')
          
          // Check for OAuth errors in redirect
          if (error) {
            reject(new Error(errorDescription || error))
            return
          }
          
          if (!code) {
            logger.error('No code found in redirect URL. URL details:', {
              href: redirectUrl,
              search: url.search,
              searchParams: Array.from(urlSearchParams.entries()),
              hash: url.hash
            })
            reject(new Error(`No authorization code received in redirect URL. Redirect URL was: ${redirectUrl}`))
            return
          }
          
          if (returnedState !== state) {
            reject(new Error('Invalid state parameter - possible CSRF attack'))
            return
          }
          
          // Exchange code for token
          try {
            logger.log('Exchanging code for token...')
            await exchangeCodeForToken(code, returnedState)
            logger.log('Token exchange successful')
            resolve({ authUrl, state, codeVerifier }) // Token already stored
          } catch (error) {
            logger.error('Token exchange failed:', error)
            reject(error)
          }
        }
      )
    })
  }
  
  return { authUrl, state, codeVerifier }
}

// Exchange authorization code for token
export async function exchangeCodeForToken(code: string, state: string): Promise<EtsyToken> {
  const clientID = getClientID()
  const codeVerifier = sessionStorage.getItem('oauth_code_verifier')
  const redirectURI = sessionStorage.getItem('oauth_redirect_uri')
  const storedState = sessionStorage.getItem('oauth_state')
  
  if (!codeVerifier || !redirectURI) {
    throw new Error('OAuth flow not properly initialized')
  }
  
  if (state !== storedState) {
    throw new Error('Invalid state parameter - possible CSRF attack')
  }
  
  const response = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientID,
      redirect_uri: redirectURI,
      code: code,
      code_verifier: codeVerifier,
    }),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Token exchange failed' }))
    throw new Error(error.error || error.message || 'Token exchange failed')
  }
  
  const token: EtsyToken = await response.json()
  token.expires_on = Date.now() + token.expires_in * 1000
  
  // Clean up session storage
  sessionStorage.removeItem('oauth_code_verifier')
  sessionStorage.removeItem('oauth_state')
  sessionStorage.removeItem('oauth_redirect_uri')
  
  // Store token
  await storeToken(token)
  
  return token
}

// Refresh access token
export async function refreshAccessToken(token: EtsyToken): Promise<EtsyToken> {
  const clientID = getClientID()
  
  const response = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': clientID,
      'Authorization': `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientID,
      refresh_token: token.refresh_token,
    }),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Token refresh failed' }))
    throw new Error(error.error || error.message || 'Token refresh failed')
  }
  
  const newToken: EtsyToken = await response.json()
  newToken.expires_on = Date.now() + newToken.expires_in * 1000
  
  // Store new token
  await storeToken(newToken)
  
  return newToken
}

// Get stored token
export async function getStoredToken(): Promise<EtsyToken | null> {
  const result = await chrome.storage.local.get(STORAGE_TOKEN_NAME)
  return result[STORAGE_TOKEN_NAME] || null
}

// Store token
async function storeToken(token: EtsyToken): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_TOKEN_NAME]: token })
}

// Remove token
export async function removeToken(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_TOKEN_NAME)
}

// Get valid access token (checks expiration and refreshes if needed)
export async function getValidAccessToken(): Promise<string> {
  let token = await getStoredToken()
  
  if (!token) {
    throw new Error('No token found. Please authenticate first.')
  }
  
  // Check if token is expired (with 5 minute buffer)
  const buffer = 5 * 60 * 1000 // 5 minutes
  if (token.expires_on < Date.now() + buffer) {
    // Token expired or about to expire, refresh it
    token = await refreshAccessToken(token)
  }
  
  return token.access_token
}

// Check authentication status
export async function checkAuthStatus(): Promise<{ authenticated: boolean; expiresAt?: number }> {
  const token = await getStoredToken()
  
  if (!token) {
    return { authenticated: false }
  }
  
  // Check if token is expired
  if (token.expires_on < Date.now()) {
    // Try to refresh
    try {
      await refreshAccessToken(token)
      return { authenticated: true, expiresAt: token.expires_on }
    } catch (error) {
      await removeToken()
      return { authenticated: false }
    }
  }
  
  return { authenticated: true, expiresAt: token.expires_on }
}

