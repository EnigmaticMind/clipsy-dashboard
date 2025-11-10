import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, initializeAnalytics } from '../services/analytics';

// Component to track page views and initialize analytics
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // Initialize analytics on mount
    initializeAnalytics().catch(console.error);
  }, []);

  useEffect(() => {
    // Track page view on route change
    const pageName = location.pathname || '/';
    trackPageView(pageName).catch(console.error);
  }, [location]);

  return null;
}

