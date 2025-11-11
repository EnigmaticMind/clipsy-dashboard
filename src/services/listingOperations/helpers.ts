// Helper functions for listing operations

import { Listing } from '../etsyApi'
import { logger } from '../../utils/logger'
import { ETSY_MIN_PRICE } from './types'

// Helper to check if tags are equal
export function tagsEqual(tags1: string[], tags2: string[]): boolean {
  if (tags1.length !== tags2.length) {
    return false
  }
  const sorted1 = [...tags1].sort()
  const sorted2 = [...tags2].sort()
  for (let i = 0; i < sorted1.length; i++) {
    if (sorted1[i] !== sorted2[i]) {
      return false
    }
  }
  return true
}

// Helper to get a valid price (ensures it meets Etsy's minimum)
export function getValidPrice(
  newPrice: number | null,
  existingPrice: number | null
): number {
  // If new price is provided and valid, use it
  if (newPrice !== null && newPrice >= ETSY_MIN_PRICE) {
    return newPrice
  }
  
  // If new price is provided but invalid (negative or too low), use minimum or existing
  if (newPrice !== null) {
    if (newPrice < 0) {
      logger.warn(`Price ${newPrice} is negative. Using existing price or minimum.`)
    } else if (newPrice < ETSY_MIN_PRICE) {
      logger.warn(`Price ${newPrice} is below Etsy minimum of $${ETSY_MIN_PRICE}. Using existing price or minimum.`)
    }
    // Fall through to use existing price or minimum
  }
  
  // If no new price but existing price is available and valid, use it
  if (existingPrice !== null && existingPrice >= ETSY_MIN_PRICE) {
    return existingPrice
  }
  
  // Fallback to minimum price
  if (existingPrice !== null && existingPrice < ETSY_MIN_PRICE) {
    logger.warn(`Existing price ${existingPrice} is below Etsy minimum. Using minimum price of $${ETSY_MIN_PRICE}.`)
  } else if (newPrice === null && existingPrice === null) {
    logger.warn(`No price available. Using Etsy minimum price of $${ETSY_MIN_PRICE}.`)
  }
  return ETSY_MIN_PRICE
}

// Helper to extract price from existing listing offering
export function getExistingOfferingPrice(existingListing: Listing | null): number | null {
  if (!existingListing || !existingListing.inventory.products.length) {
    return null
  }
  
  const product = existingListing.inventory.products[0]
  if (!product.offerings || !product.offerings.length) {
    return null
  }
  
  const offering = product.offerings.find((o: any) => !o.is_deleted)
  if (!offering || !offering.price) {
    return null
  }
  
  // Convert from Etsy's amount/divisor format to float
  return offering.price.amount / offering.price.divisor
}

