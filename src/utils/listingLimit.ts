import { MAX_LISTINGS_FOR_DOWNLOAD_UPLOAD } from '../services/etsyApi'
import { logger } from './logger'

/**
 * Override row count if query parameter is set (for testing/debugging)
 * In non-production builds, the actual row count can be overridden via the `rowCount` query parameter.
 * 
 * @param actualCount - The actual number of rows/listings
 * @returns The overridden count if query param is set, otherwise the actual count
 */
export function overrideRowCount(actualCount: number): number {
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'
  
  if (isDevelopment && typeof window !== 'undefined') {
    // Check both search params and hash (for HashRouter compatibility)
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const overrideCount = searchParams.get('rowCount') || hashParams.get('rowCount')
    
    if (overrideCount) {
      const parsedCount = parseInt(overrideCount, 10)
      if (!isNaN(parsedCount) && parsedCount > 0) {
        console.log(`[DEV] Overriding row count from ${actualCount} to ${parsedCount} via ?rowCount=${overrideCount}`)
        return parsedCount
      }
    }
  }
  
  return actualCount
}

/**
 * Check if a row count exceeds the download/upload limit.
 * In non-production builds, the limit can be overridden via the `rowCount` query parameter.
 * 
 * @param rowCount - The number of rows/listings to check (will be overridden if query param is set)
 * @returns true if the row count exceeds the limit, false otherwise
 */
export function exceedsListingLimit(rowCount: number): boolean {
  // First apply row count override (for testing)
  const overriddenCount = overrideRowCount(rowCount)
  
  // Then check against the limit
  const limit = getListingLimit()
  const exceedsLimit = overriddenCount > limit

  logger.log(`[DEV] Overridden count: ${overriddenCount}, Limit: ${limit}`)
  logger.log(`[DEV] Exceeds limit: ${exceedsLimit}`)
  
  return exceedsLimit
}

/**
 * Get the current listing limit (always returns the constant, never overridden)
 * 
 * @returns The current listing limit
 */
export function getListingLimit(): number {
  return MAX_LISTINGS_FOR_DOWNLOAD_UPLOAD
}


