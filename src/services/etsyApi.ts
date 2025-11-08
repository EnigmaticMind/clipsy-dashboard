// Etsy API service - direct API calls from frontend
// No backend needed if CORS allows

import { getValidAccessToken } from './oauth'

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
        const error = await response.json().catch(() => ({ error: `HTTP ${status}` }))
        
        // If retryable and we have retries left, retry
        if (isRetryableError(error, status) && attempt < retries) {
          const delay = RETRY_DELAY_BASE * Math.pow(2, attempt) // Exponential backoff
          console.log(`Request failed (${status}), retrying in ${delay}ms... (attempt ${attempt + 1}/${retries + 1})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        throw new Error(error.error || error.message || `API request failed: ${status}`)
      }
      
      return response
    } catch (error) {
      // Network error or fetch failed
      if (attempt < retries && isRetryableError(error)) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt)
        console.log(`Network error, retrying in ${delay}ms... (attempt ${attempt + 1}/${retries + 1})`)
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
  
  if (onProgress) {
    onProgress(allResults.length, totalCount)
  }
  
  // Calculate number of remaining pages
  const pagesNeeded = Math.ceil(totalCount / limit)
  
  // Fetch remaining pages in parallel batches
  for (let batchStart = 1; batchStart < pagesNeeded; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, pagesNeeded)
    const batchPromises: Promise<ListingsResponse>[] = []
    
    for (let page = batchStart; page < batchEnd; page++) {
      const offset = page * limit
      const params = new URLSearchParams({
        includes: 'Inventory',
        limit: limit.toString(),
        offset: offset.toString(),
      })
      
      if (status) {
        params.set('state', status)
      }
      
      batchPromises.push(
        makeEtsyRequest(
          'GET',
          `/application/shops/${shopID}/listings?${params.toString()}`
        ).then(r => r.json())
      )
    }
    
    // Wait for batch to complete
    const batchResults = await Promise.allSettled(batchPromises)
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value.results)
      } else {
        console.error('Error fetching batch:', result.reason)
        // Continue with other batches even if one fails
      }
    }
    
    if (onProgress) {
      onProgress(allResults.length, totalCount)
    }
  }
  
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
  await makeEtsyRequest(
    'DELETE',
    `/application/shops/${shopID}/listings/${listingID}`
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

