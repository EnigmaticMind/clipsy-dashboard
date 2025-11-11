// Etsy API service - direct API calls from frontend
// No backend needed if CORS allows

import { getValidAccessToken } from './oauth'
import { logger } from '../utils/logger'
import { extractErrorMessage } from '../utils/dataParsing'

const ETSY_API_BASE_URL = 'https://api.etsy.com/v3'

// Helper to get client ID - hardcoded for extension
function getClientID(): string {
  return '5q20ft9kbl9f39p2hxaekkdw'
}

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY_BASE = 1000 // 1 second base delay

// Check if error is retryable
function isRetryableError(_error: any, status?: number): boolean {
  // Retry on network errors, timeouts, and 5xx server errors
  if (!status) return true // Network error
  if (status >= 500 && status < 600) return true // Server errors
  if (status === 429) return true // Rate limit
  if (status === 408) return true // Request timeout
  return false
}

// Make authenticated request to Etsy API with retry logic
export async function makeEtsyRequest(
  method: string, 
  endpoint: string, 
  body?: any,
  retries = MAX_RETRIES
): Promise<Response> {
  const accessToken = await getValidAccessToken()
  const clientID = getClientID()
  
  const url = endpoint.startsWith('http') ? endpoint : `${ETSY_API_BASE_URL}${endpoint}`
  
  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
    'x-api-key': clientID,
  }
  
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json'
  }
  
  const options: RequestInit = {
    method,
    headers,
  }
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body)
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      if (!response.ok) {
        const status = response.status
        let errorData: any
        try {
          errorData = await response.json()
        } catch {
          // If JSON parsing fails, create a basic error object
          const text = await response.text().catch(() => '')
          errorData = { error: `HTTP ${status}`, message: text || `HTTP ${status}` }
        }
        
        // Log full error details for debugging
        logger.error(`Etsy API error (${status}):`, {
          endpoint,
          method,
          status,
          error: errorData,
        })
        
        // If retryable and we have retries left, retry
        if (isRetryableError(errorData, status) && attempt < retries) {
          const delay = RETRY_DELAY_BASE * Math.pow(2, attempt) // Exponential backoff
          logger.log(`Request failed (${status}), retrying in ${delay}ms... (attempt ${attempt + 1}/${retries + 1})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        // Extract error message from various possible formats
        const errorMessage = extractErrorMessage(
          errorData,
          `API request failed: ${status}`
        )
        
        throw new Error(errorMessage)
      }
      
      return response
    } catch (error) {
      // Network error or fetch failed
      if (attempt < retries && isRetryableError(error)) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt)
        logger.log(`Network error, retrying in ${delay}ms... (attempt ${attempt + 1}/${retries + 1})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      throw error
    }
  }
  
  throw new Error('Max retries exceeded')
}

// Get shop ID for authenticated user
export async function getShopID(): Promise<number> {
  const response = await makeEtsyRequest('GET', '/application/users/me')
  const data = await response.json()
  
  if (!data.shop_id) {
    throw new Error('No shop found for the authenticated user')
  }
  
  return data.shop_id
}

// Maximum number of listings allowed for CSV download/upload operations
export const MAX_LISTINGS_FOR_DOWNLOAD_UPLOAD = 1000

// Get total listing count without fetching all listings (lightweight check)
export async function getListingCount(
  shopID: number,
  status?: ListingStatus
): Promise<number> {
  const limit = 1 // Only need 1 result to get the count
  const params = new URLSearchParams({
    includes: 'Inventory',
    limit: limit.toString(),
    offset: '0',
  })
  
  if (status) {
    params.set('state', status)
  }
  
  const response = await makeEtsyRequest(
    'GET',
    `/application/shops/${shopID}/listings?${params.toString()}`
  )
  
  const data: ListingsResponse = await response.json()
  const actualCount = data.count // Total count is in the response
  
  // Apply row count override if set (for testing/debugging)
  const { overrideRowCount } = await import('../utils/listingLimit')
  return overrideRowCount(actualCount)
}

// All possible listing states
export const ALL_LISTING_STATES: ListingStatus[] = ['active', 'inactive', 'draft', 'sold_out', 'expired']

// Listing types
export type ListingStatus = 'active' | 'inactive' | 'draft' | 'sold_out' | 'expired'

// Price type
export interface Price {
  amount: number
  divisor: number
  currency_code: string
}

// Offering type
export interface Offering {
  offering_id: number
  quantity: number
  is_enabled: boolean
  is_deleted: boolean
  price: Price
  readiness_state_id?: number
}

// Property Value type
export interface PropertyValue {
  property_id: number
  property_name: string
  scale_id?: number
  scale_name?: string
  value_ids: number[]
  values: string[]
}

// Product type
export interface Product {
  product_id: number
  sku: string
  is_deleted: boolean
  offerings: Offering[]
  property_values: PropertyValue[]
}

// Inventory type
export interface Inventory {
  products: Product[]
  price_on_property: number[]
  quantity_on_property: number[]
  sku_on_property: number[]
}

// Listing type
export interface Listing {
  listing_id: number
  shop_id: number
  title: string
  description: string
  state: ListingStatus
  quantity: number
  tags: string[]
  price: Price
  has_variations: boolean
  inventory: Inventory
  taxonomy_id?: number // Taxonomy ID for the listing category
  shipping_profile_id?: number // Shipping profile ID (required for physical listings)
  materials?: string[] // Materials used in the product
  processing_min?: number // Minimum processing time in days
  processing_max?: number // Maximum processing time in days
}

// Listings Response type
export interface ListingsResponse {
  count: number
  results: Listing[]
}

// Fetch all listings with pagination and parallel batch fetching
export async function fetchListings(
  shopID: number, 
  status?: ListingStatus,
  onProgress?: (current: number, total: number) => void
): Promise<ListingsResponse> {
  const limit = 100
  const batchSize = 5 // Fetch 5 pages in parallel to respect rate limits
  const batchDelay = 200 // 200ms delay between batches to respect rate limits
  const maxRetries = 2 // Retry failed pages up to 2 times
  
  // First request to get total count
  const firstParams = new URLSearchParams({
    includes: 'Inventory',
    limit: limit.toString(),
    offset: '0',
  })
  
  if (status) {
    firstParams.set('state', status)
  }
  
  const firstResponse = await makeEtsyRequest(
    'GET',
    `/application/shops/${shopID}/listings?${firstParams.toString()}`
  )
  
  const firstPage: ListingsResponse = await firstResponse.json()
  const totalCount = firstPage.count
  const allResults: Listing[] = [...firstPage.results]
  
  // Deduplicate by listing_id (in case of duplicates)
  const seenIds = new Set<number>(allResults.map(l => l.listing_id))
  
  if (onProgress) {
    onProgress(allResults.length, totalCount)
  }
  
  // Early exit if we already have all results
  if (allResults.length >= totalCount) {
    return {
      count: totalCount,
      results: allResults,
    }
  }
  
  // Calculate number of remaining pages
  const pagesNeeded = Math.ceil(totalCount / limit)
  
  // Track failed pages for retry
  const failedPages: number[] = []
  
  // Helper function to fetch a single page with retry
  const fetchPage = async (page: number, retries = maxRetries): Promise<ListingsResponse | null> => {
    const offset = page * limit
    const params = new URLSearchParams({
      includes: 'Inventory',
      limit: limit.toString(),
      offset: offset.toString(),
    })
    
    if (status) {
      params.set('state', status)
    }
    
    try {
      const response = await makeEtsyRequest(
        'GET',
        `/application/shops/${shopID}/listings?${params.toString()}`
      )
      return await response.json()
    } catch (error) {
      if (retries > 0) {
        logger.warn(`Failed to fetch page ${page}, retrying... (${retries} retries left)`)
        await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1s before retry
        return fetchPage(page, retries - 1)
      }
      logger.error(`Error fetching page ${page} after ${maxRetries} retries:`, error)
      return null
    }
  }
  
  // Fetch remaining pages in parallel batches
  for (let batchStart = 1; batchStart < pagesNeeded; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, pagesNeeded)
    const batchPromises: Promise<{ page: number; result: ListingsResponse | null }>[] = []
    
    for (let page = batchStart; page < batchEnd; page++) {
      batchPromises.push(
        fetchPage(page).then(result => ({ page, result }))
      )
    }
    
    // Wait for batch to complete
    const batchResults = await Promise.allSettled(batchPromises)
    
    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        const { page, result } = settled.value
        if (result) {
          // Add results, filtering out duplicates
          for (const listing of result.results) {
            if (!seenIds.has(listing.listing_id)) {
              allResults.push(listing)
              seenIds.add(listing.listing_id)
            }
          }
        } else {
          failedPages.push(page)
        }
      } else {
        logger.error('Error in batch promise:', settled.reason)
        // For rejected promises, we can't access settled.value
        // The page number is lost, but we can still track that a failure occurred
      }
    }
    
    // Update progress
    if (onProgress) {
      onProgress(allResults.length, totalCount)
    }
    
    // Early exit if we've fetched all results
    if (allResults.length >= totalCount) {
      break
    }
    
    // Add delay between batches to respect rate limits (except for last batch)
    if (batchStart + batchSize < pagesNeeded) {
      await new Promise(resolve => setTimeout(resolve, batchDelay))
    }
  }
  
  // Log summary
  if (failedPages.length > 0) {
    logger.warn(`Failed to fetch ${failedPages.length} page(s): ${failedPages.join(', ')}`)
  }
  
  logger.log(`Fetched ${allResults.length} of ${totalCount} listings`)
  
  return {
    count: totalCount,
    results: allResults,
  }
}

// Get a single listing by ID
export async function getListing(listingID: number): Promise<Listing> {
  const response = await makeEtsyRequest(
    'GET',
    `/application/listings/${listingID}?includes=Inventory`
  )
  
  const data = await response.json()
  
  // Handle both array and single object responses
  if (Array.isArray(data.results) && data.results.length > 0) {
    return data.results[0]
  } else if (data.listing_id) {
    return data
  }
  
  throw new Error('Invalid listing response format')
}

// Create a new listing
export async function createListing(shopID: number, listingData: any): Promise<number> {
  const response = await makeEtsyRequest(
    'POST',
    `/application/shops/${shopID}/listings`,
    listingData
  )
  
  const data = await response.json()
  
  // Handle response format
  if (data.results && data.results.length > 0) {
    return data.results[0].listing_id
  } else if (data.listing_id) {
    return data.listing_id
  }
  
  throw new Error('Invalid create listing response format')
}

// Update a listing
export async function updateListing(shopID: number, listingID: number, updates: any): Promise<void> {
  await makeEtsyRequest(
    'PUT',
    `/application/shops/${shopID}/listings/${listingID}`,
    updates
  )
}

// Delete a listing
export async function deleteListing(shopID: number, listingID: number): Promise<void> {
  // shopID parameter kept for backwards compatibility but not used in endpoint
  await makeEtsyRequest(
    'DELETE',
    `/application/listings/${listingID}`
  )
}

// Update listing inventory
export async function updateListingInventory(listingID: number, inventoryData: any): Promise<void> {
  await makeEtsyRequest(
    'PUT',
    `/application/listings/${listingID}/inventory`,
    inventoryData
  )
}

