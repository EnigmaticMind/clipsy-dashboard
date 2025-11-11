// Create listing operations

import { ProcessedListing } from '../uploadService'
import { makeEtsyRequest } from '../etsyApi'
import { logger } from '../../utils/logger'

import { encodeHTMLEntities } from '../../utils/dataParsing'

// Create a new listing
export async function createListing(
  shopID: number,
  listing: ProcessedListing,
  taxonomyID?: number
): Promise<number> {
  // Validate required fields
  if (listing.title === '') {
    throw new Error('title is required')
  }
  if (listing.description === '') {
    throw new Error('description is required')
  }

  // If taxonomy_id, shipping_profile_id, or readiness_state_id not provided, try to fetch them from an existing listing
  let finalTaxonomyID = taxonomyID
  let shippingProfileID: number | undefined = undefined
  let defaultReadinessStateID: number | undefined = undefined
  
  // Always try to fetch required fields if we don't have them (required for physical listings)
  // Also fetch taxonomy_id if not provided
  if (!finalTaxonomyID || !shippingProfileID || !defaultReadinessStateID) {
    try {
      logger.log('Fetching taxonomy_id, shipping_profile_id, and readiness_state_id from existing listing...')
      // Include Shipping and Inventory to get all required fields
      const firstListingResponse = await makeEtsyRequest(
        'GET',
        `/application/shops/${shopID}/listings?limit=1&includes=Inventory,Shipping`
      )
      const firstListingData = await firstListingResponse.json()
      
      if (firstListingData.results && firstListingData.results.length > 0) {
        const firstListing = firstListingData.results[0]
        if (!finalTaxonomyID && firstListing.taxonomy_id) {
          finalTaxonomyID = firstListing.taxonomy_id
          logger.log(`Using taxonomy_id ${finalTaxonomyID} from existing listing`)
        }
        // Always fetch shipping_profile_id if available (required for physical listings)
        if (!shippingProfileID && firstListing.shipping_profile_id) {
          shippingProfileID = firstListing.shipping_profile_id
          logger.log(`Using shipping_profile_id ${shippingProfileID} from existing listing`)
        }
        // Fetch readiness_state_id from first offering (required for physical listings)
        if (!defaultReadinessStateID && firstListing.inventory && firstListing.inventory.products.length > 0) {
          const firstProduct = firstListing.inventory.products.find((p: any) => !p.is_deleted)
          if (firstProduct && firstProduct.offerings && firstProduct.offerings.length > 0) {
            const firstOffering = firstProduct.offerings.find((o: any) => !o.is_deleted)
            if (firstOffering && firstOffering.readiness_state_id) {
              defaultReadinessStateID = firstOffering.readiness_state_id
              logger.log(`Using readiness_state_id ${defaultReadinessStateID} from existing listing`)
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to fetch required listing fields:', error)
    }
  }

  if (!finalTaxonomyID) {
    throw new Error('taxonomy_id is required to create a listing. Please ensure you have at least one existing listing in your shop, or specify a taxonomy_id.')
  }

  if (!shippingProfileID) {
    throw new Error('shipping_profile_id is required for physical listings. Please ensure you have at least one existing listing in your shop with a shipping profile.')
  }

  if (!defaultReadinessStateID) {
    throw new Error('readiness_state_id is required for physical listings. Please ensure you have at least one existing listing in your shop.')
  }

  // Build request body
  // Encode HTML entities for title and description (Etsy API expects HTML entities)
  const requestBody: any = {
    quantity: 1, // Default, will be updated by inventory
    title: encodeHTMLEntities(listing.title),
    description: encodeHTMLEntities(listing.description),
    price: 1, // Default, will be updated by inventory
    who_made: 'i_did',
    when_made: '2020_2024',
    state: listing.status || 'draft', // Use status from listing, default to draft
    taxonomy_id: finalTaxonomyID, // Required by Etsy API
    shipping_profile_id: shippingProfileID, // Required for physical listings
    readiness_state_id: defaultReadinessStateID, // Required for physical listings
  }

  if (listing.quantity !== null) {
    requestBody.quantity = listing.quantity
  }
  if (listing.price !== null) {
    // Listing endpoint expects price as a float (e.g., 45.99)
    requestBody.price = listing.price
  }
  if (listing.tags.length > 0) {
    requestBody.tags = listing.tags
  }
  if (listing.hasVariations) {
    requestBody.has_variations = true
  }
  if (listing.currencyCode !== '') {
    requestBody.currency_code = listing.currencyCode
  }

  // Add materials if provided
  if (listing.materials && listing.materials.length > 0) {
    requestBody.materials = listing.materials
  }

  // Use shipping profile ID from listing if provided, otherwise use default
  if (listing.shippingProfileID) {
    requestBody.shipping_profile_id = listing.shippingProfileID
  }

  // Add processing times if provided
  if (listing.processingMin !== undefined) {
    requestBody.processing_min = listing.processingMin
  }
  if (listing.processingMax !== undefined) {
    requestBody.processing_max = listing.processingMax
  }

  const response = await makeEtsyRequest(
    'POST',
    `/application/shops/${shopID}/listings`,
    requestBody
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

