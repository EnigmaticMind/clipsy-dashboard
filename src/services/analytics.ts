// Google Analytics service for Chrome extension
// Privacy-focused: respects user opt-out and disables in development
// Uses Measurement Protocol API (no external scripts needed, works with CSP)

const GA_MEASUREMENT_ID = 'G-V5492WJDH1';
const GA_API_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const GA_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

// Check if we're in development mode
const isDev =
  import.meta.env?.MODE === 'development' || import.meta.env?.DEV === true;

// TEMPORARY: Set to true to enable analytics in development mode for testing
const ENABLE_ANALYTICS_IN_DEV = false; // Changed from true to false

// Storage key for analytics opt-out
const ANALYTICS_OPT_OUT_KEY = 'clipsy:analytics_opt_out';
const CLIENT_ID_KEY = 'clipsy:ga_client_id';

// Generate or get a unique client ID for this user
async function getOrCreateClientId(): Promise<string> {
  const result = await chrome.storage.local.get(CLIENT_ID_KEY);
  if (result[CLIENT_ID_KEY]) {
    return result[CLIENT_ID_KEY];
  }

  // Generate a new client ID (UUID v4 format)
  const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
  await chrome.storage.local.set({ [CLIENT_ID_KEY]: clientId });
  return clientId;
}

// Check if analytics is enabled (not in dev, not opted out)
async function isAnalyticsEnabled(): Promise<boolean> {
  // Disabled in development unless ENABLE_ANALYTICS_IN_DEV is true
  if (isDev && !ENABLE_ANALYTICS_IN_DEV) {
    return false;
  }

  // Check if user has opted out
  const result = await chrome.storage.local.get(ANALYTICS_OPT_OUT_KEY);
  return result[ANALYTICS_OPT_OUT_KEY] !== true;
}

// Send event to Google Analytics using Measurement Protocol
// Note: GA4 Measurement Protocol requires an API secret for server-side tracking
// For client-side, we'll use a GET request format that works without API secret
async function sendToGA(
  eventName: string,
  eventParams?: Record<string, any>
): Promise<void> {
  if (!(await isAnalyticsEnabled())) {
    if (isDev && !ENABLE_ANALYTICS_IN_DEV) {
      console.log('[Analytics] Event:', eventName, eventParams);
    }
    return;
  }

  try {
    const clientId = await getOrCreateClientId();
    
    // Build query parameters for GET request (works without API secret)
    const params = new URLSearchParams({
      v: '2', // Protocol version
      tid: GA_MEASUREMENT_ID, // Measurement ID
      cid: clientId, // Client ID
      en: eventName, // Event name
    });

    // Add event parameters
    if (eventParams) {
      Object.entries(eventParams).forEach(([key, value]) => {
        // GA4 uses ep.{param_name} format for event parameters
        params.append(`ep.${key}`, String(value));
      });
    }

    // Use the collect endpoint (GET request works without API secret)
    const url = `https://www.google-analytics.com/g/collect?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors', // Required for cross-origin requests
    });

    if (isDev) {
      console.log('[Analytics] Event sent:', eventName, eventParams);
      console.log('[Analytics] URL:', url);
      // Note: With no-cors, we can't read the response, but the event should be sent
    }
  } catch (error) {
    console.error('[Analytics] Error sending event:', error);
  }
}

// Initialize analytics (no-op for Measurement Protocol, but kept for compatibility)
export async function initializeAnalytics(): Promise<void> {
  const enabled = await isAnalyticsEnabled();
  if (!enabled) {
    if (isDev && !ENABLE_ANALYTICS_IN_DEV) {
      console.log('[Analytics] Disabled in development mode');
    } else {
      console.log('[Analytics] Disabled by user preference');
    }
    return;
  }

  console.log('[Analytics] Initialized (using Measurement Protocol)');
}

// Track a page view
export async function trackPageView(pageName: string): Promise<void> {
  await sendToGA('page_view', {
    page_title: pageName,
    page_location: `chrome-extension://${chrome.runtime.id}/dashboard.html#${pageName}`,
  });
}

// Track custom events
export async function trackEvent(
  eventName: string,
  eventParams?: Record<string, any>
): Promise<void> {
  await sendToGA(eventName, eventParams);
}

// Track download events
export async function trackDownload(
  type: 'csv' | 'googleSheets',
  listingCount: number
): Promise<void> {
  await trackEvent('download', {
    download_type: type,
    listing_count: listingCount,
    event_category: 'download',
  });
}

// Track upload events
export async function trackUpload(
  type: 'csv' | 'googleSheets',
  changesCount: number
): Promise<void> {
  await trackEvent('upload', {
    upload_type: type,
    changes_count: changesCount,
    event_category: 'upload',
  });
}

// Track authentication events
export async function trackAuth(
  provider: 'etsy' | 'google',
  action: 'start' | 'success' | 'error'
): Promise<void> {
  await trackEvent('auth', {
    provider,
    action,
    event_category: 'authentication',
  });
}

// Track feature usage
export async function trackFeature(featureName: string, action: string): Promise<void> {
  await trackEvent('feature_usage', {
    feature_name: featureName,
    action,
    event_category: 'feature',
  });
}

// Track errors
export async function trackError(errorMessage: string, errorContext?: Record<string, any>): Promise<void> {
  await trackEvent('error', {
    error_message: errorMessage,
    ...errorContext,
    event_category: 'error',
  });
}

// Check if user has opted out of analytics
export async function isAnalyticsOptedOut(): Promise<boolean> {
  const result = await chrome.storage.local.get(ANALYTICS_OPT_OUT_KEY);
  return result[ANALYTICS_OPT_OUT_KEY] === true;
}

// Set analytics opt-out preference
export async function setAnalyticsOptOut(optedOut: boolean): Promise<void> {
  await chrome.storage.local.set({ [ANALYTICS_OPT_OUT_KEY]: optedOut });
}

// Test function - call from console: window.testAnalytics()
// This helps verify analytics is working
export async function testAnalytics(): Promise<void> {
  console.log('🧪 Testing Google Analytics...');
  console.log('Development mode:', isDev);
  console.log('Analytics enabled:', await isAnalyticsEnabled());
  console.log('Client ID:', await getOrCreateClientId());
  
  // Send a test event
  await trackEvent('test_event', {
    test: true,
    timestamp: Date.now(),
    event_category: 'test',
  });
  
  console.log('✅ Test event sent! Check Google Analytics Real-Time reports.');
  console.log('💡 In dev mode, check console for debug response');
}
