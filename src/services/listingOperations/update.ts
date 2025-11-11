// Update listing operations

import { ProcessedListing } from '../uploadService'
import { Listing, makeEtsyRequest } from '../etsyApi'
import { tagsEqual } from './helpers'
import { encodeHTMLEntities } from '../../utils/dataParsing'

// Update an existing listing (only if changed)
export async function updateListing(
  shopID: number,
  listingID: number,
  listing: ProcessedListing,
  existingListing: Listing | null
): Promise<void> {
  // Check if listing needs update by comparing fields
  let needsUpdate = false
  const requestBody: any = {}

  if (existingListing === null || existingListing.title !== listing.title) {
    // Encode HTML entities for Etsy API (e.g., " becomes &quot;)
    requestBody.title = encodeHTMLEntities(listing.title)
    needsUpdate = true
  }
  if (
    existingListing === null ||
    existingListing.description !== listing.description
  ) {
    // Encode HTML entities for Etsy API (e.g., " becomes &quot;)
    requestBody.description = encodeHTMLEntities(listing.description)
    needsUpdate = true
  }
  if (
    existingListing === null ||
    existingListing.state !== listing.status
  ) {
    requestBody.state = listing.status
    needsUpdate = true
  }

  // Compare tags
  if (
    existingListing === null ||
    !tagsEqual(existingListing.tags, listing.tags)
  ) {
    requestBody.tags = listing.tags
    needsUpdate = true
  }

  // Compare quantity (only if not on property)
  if (listing.quantity !== null) {
    if (
      existingListing === null ||
      existingListing.inventory.quantity_on_property.length === 0
    ) {
      if (
        existingListing === null ||
        existingListing.quantity !== listing.quantity
      ) {
        requestBody.quantity = listing.quantity
        needsUpdate = true
      }
    }
  }

  // Compare price (only if not on property)
  if (listing.price !== null) {
    if (
      existingListing === null ||
      existingListing.inventory.price_on_property.length === 0
    ) {
      const existingPrice =
        existingListing === null
          ? 0
          : existingListing.price.amount / existingListing.price.divisor
      const epsilon = 0.01
      if (
        existingListing === null ||
        Math.abs(existingPrice - listing.price) > epsilon
      ) {
        // Listing endpoint expects price as a float (e.g., 45.99)
        requestBody.price = listing.price
        needsUpdate = true
      }
    }
  }

  // Compare currency code (only if price is not on property)
  if (listing.currencyCode !== '') {
    if (
      existingListing === null ||
      existingListing.inventory.price_on_property.length === 0
    ) {
      if (
        existingListing === null ||
        existingListing.price.currency_code !== listing.currencyCode
      ) {
        requestBody.currency_code = listing.currencyCode
        needsUpdate = true
      }
    }
  }

  // Handle has_variations change (both true and false)
  if (existingListing === null || existingListing.has_variations !== listing.hasVariations) {
    requestBody.has_variations = listing.hasVariations
    needsUpdate = true
  }

  // Compare materials
  if (listing.materials !== undefined) {
    const existingMaterials = existingListing?.materials || []
    const materialsEqual =
      existingMaterials.length === listing.materials.length &&
      existingMaterials.every(
        (m, i) => m.toLowerCase() === listing.materials![i]?.toLowerCase()
      )
    if (!materialsEqual) {
      requestBody.materials = listing.materials
      needsUpdate = true
    }
  }

  // Compare shipping profile ID
  if (listing.shippingProfileID !== undefined) {
    if (
      existingListing === null ||
      existingListing.shipping_profile_id !== listing.shippingProfileID
    ) {
      requestBody.shipping_profile_id = listing.shippingProfileID
      needsUpdate = true
    }
  }

  // Compare processing times
  if (listing.processingMin !== undefined) {
    if (
      existingListing === null ||
      existingListing.processing_min !== listing.processingMin
    ) {
      requestBody.processing_min = listing.processingMin
      needsUpdate = true
    }
  }

  if (listing.processingMax !== undefined) {
    if (
      existingListing === null ||
      existingListing.processing_max !== listing.processingMax
    ) {
      requestBody.processing_max = listing.processingMax
      needsUpdate = true
    }
  }

  if (!needsUpdate) {
    return // No changes needed
  }

  await makeEtsyRequest(
    'PATCH',
    `/application/shops/${shopID}/listings/${listingID}`,
    requestBody
  )
}

