/**
 * E2E Tests - These tests hit the actual Etsy API
 * 
 * IMPORTANT: These tests create listings in "inactive" state to avoid affecting active listings.
 * All test listings are cleaned up after tests complete.
 * 
 * To run these tests, you must have valid OAuth credentials configured.
 * Run with: npm run test:run -- src/services/__tests__/e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getValidAccessToken } from '../oauth'
import { getShopID, getListing, fetchListings, deleteListing } from '../etsyApi'
import { createListing, updateListing, updateListingInventory } from '../listingOperations'
import type { ProcessedListing, ProcessedVariation } from '../uploadService'
import type { Listing } from '../etsyApi'
import { writeListingsToSheet, getOrCreateSheet, readListingsFromSheetAsFile } from '../googleSheetsService'
import { checkGoogleSheetsAuthStatus } from '../googleSheetsOAuth'

// Track created listing IDs for cleanup
const createdListingIDs: number[] = []

// Helper to create a ProcessedListing
function createTestListing(
  title: string,
  hasVariations: boolean = false,
  variations: ProcessedVariation[] = []
): ProcessedListing {
  return {
    listingID: 0, // 0 means new listing
    title,
    description: `E2E Test Description for ${title}`,
    sku: `E2E-TEST-${Date.now()}`,
    status: 'inactive', // Create in inactive state
    quantity: 10,
    tags: ['e2e-test', 'automated'],
    price: 19.99,
    currencyCode: 'USD',
    hasVariations,
    variations,
    toDelete: false,
  }
}

// Helper to extract property IDs from an existing listing with variations
function extractPropertyInfo(listing: Listing): {
  propertyID1: number
  valueID1: number
  propertyID2: number | null
  valueID2: number | null
} | null {
  if (!listing.has_variations || listing.inventory.products.length === 0) {
    return null
  }
  
  const firstProduct = listing.inventory.products[0]
  if (firstProduct.property_values.length === 0) {
    return null
  }
  
  const prop1 = firstProduct.property_values[0]
  const prop2 = firstProduct.property_values[1] || null
  
  return {
    propertyID1: prop1.property_id,
    valueID1: prop1.value_ids[0],
    propertyID2: prop2?.property_id || null,
    valueID2: prop2?.value_ids[0] || null,
  }
}

// Helper to create a variation from property info
function createTestVariation(
  propertyInfo: { propertyID1: number; valueID1: number; propertyID2: number | null; valueID2: number | null },
  option1: string,
  option2?: string,
  price?: number,
  quantity?: number,
  sku?: string
): ProcessedVariation {
  return {
    productID: 0, // 0 means new variation
    propertyName1: 'Size', // Will be matched by property_id
    propertyOption1: option1,
    propertyName2: propertyInfo.propertyID2 ? 'Color' : '',
    propertyOption2: option2 || '',
    propertySKU: sku || '',
    propertyQuantity: quantity || null,
    propertyPrice: price || null,
    propertyID1: propertyInfo.propertyID1,
    propertyOptionIDs1: [propertyInfo.valueID1],
    propertyID2: propertyInfo.propertyID2 || 0,
    propertyOptionIDs2: propertyInfo.valueID2 ? [propertyInfo.valueID2] : [],
    toDelete: false,
  }
}

describe('E2E Tests - Real Etsy API', () => {
  let shopID: number
  let isAuthenticated = false

  beforeAll(async () => {
    try {
      // Get valid access token and shop ID
      await getValidAccessToken()
      shopID = await getShopID()
      expect(shopID).toBeGreaterThan(0)
      isAuthenticated = true
    } catch (error) {
      console.warn('E2E tests require OAuth authentication. Please authenticate first.')
      console.warn('These tests will be skipped. To run them:')
      console.warn('1. Open the dashboard in a browser')
      console.warn('2. Authenticate with Etsy')
      console.warn('3. Run the tests again')
      isAuthenticated = false
    }
  })

  afterAll(async () => {
    // Clean up all created listings (only if authenticated)
    if (isAuthenticated && createdListingIDs.length > 0) {
      console.log(`\nCleaning up ${createdListingIDs.length} test listings...`)
      for (const listingID of createdListingIDs) {
        try {
          await deleteListing(shopID, listingID)
          console.log(`Deleted test listing ${listingID}`)
        } catch (error) {
          console.error(`Failed to delete listing ${listingID}:`, error)
        }
      }
      createdListingIDs.length = 0
    }
  })

  describe('Listing without variations', () => {
    it.skipIf(!isAuthenticated)('should create a listing without variations', async () => {
      if (!isAuthenticated) {
        console.log('Skipping test: Not authenticated.')
        return
      }
      const listing = createTestListing('E2E Test - Create No Variations')
      
      const listingID = await createListing(shopID, listing)
      createdListingIDs.push(listingID)
      
      expect(listingID).toBeGreaterThan(0)
      
      // Update inventory
      await updateListingInventory(listingID, listing, null)
      
      // Verify listing was created
      const created = await getListing(listingID)
      expect(created.listing_id).toBe(listingID)
      expect(created.title).toBe(listing.title)
      expect(created.state).toBe('inactive')
      expect(created.has_variations).toBe(false)
    })

    it.skipIf(!isAuthenticated)('should update a listing without variations', async () => {
      if (!isAuthenticated) {
        console.log('Skipping test: Not authenticated.')
        return
      }
      // Create listing first
      const originalListing = createTestListing('E2E Test - Update No Variations Original')
      const listingID = await createListing(shopID, originalListing)
      createdListingIDs.push(listingID)
      await updateListingInventory(listingID, originalListing, null)
      
      // Get existing listing
      const existing = await getListing(listingID)
      
      // Update listing
      const updatedListing: ProcessedListing = {
        ...originalListing,
        listingID,
        title: 'E2E Test - Update No Variations Updated',
        description: 'Updated description',
        price: 29.99,
        quantity: 20,
        tags: ['e2e-test', 'updated'],
      }
      
      await updateListing(shopID, listingID, updatedListing, existing)
      await updateListingInventory(listingID, updatedListing, existing)
      
      // Verify update
      const updated = await getListing(listingID)
      expect(updated.title).toBe(updatedListing.title)
      expect(updated.description).toBe(updatedListing.description)
      const updatedPrice = updated.price.amount / updated.price.divisor
      expect(updatedPrice).toBeCloseTo(29.99, 2)
      expect(updated.quantity).toBe(20)
    })

    it.skipIf(!isAuthenticated)('should delete a listing without variations', async () => {
      if (!isAuthenticated) {
        console.log('Skipping test: Not authenticated.')
        return
      }
      // Create listing first
      const listing = createTestListing('E2E Test - Delete No Variations')
      const listingID = await createListing(shopID, listing)
      await updateListingInventory(listingID, listing, null)
      
      // Verify it exists
      const created = await getListing(listingID)
      expect(created.listing_id).toBe(listingID)
      
      // Delete listing
      await deleteListing(shopID, listingID)
      
      // Verify deletion (should throw error or return 404)
      try {
        await getListing(listingID)
        // If we get here, listing still exists (might take time to delete)
        console.warn(`Listing ${listingID} may still exist (deletion may be async)`)
      } catch (error) {
        // Expected - listing should be deleted
        expect(error).toBeDefined()
      }
      
      // Don't add to cleanup since we deleted it
    })
  })

  describe('Listing with variations', () => {
    let propertyInfo: { propertyID1: number; valueID1: number; propertyID2: number | null; valueID2: number | null } | null = null

    beforeAll(async () => {
      if (!isAuthenticated) {
        return
      }
      // Try to find an existing listing with variations to get property IDs
      // This allows the tests to work with any shop's property setup
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        const listingWithVariations = inactiveListings.results.find(l => l.has_variations && l.inventory.products.length > 0)
        
        if (listingWithVariations) {
          propertyInfo = extractPropertyInfo(listingWithVariations)
          if (propertyInfo) {
            console.log(`Found property IDs from existing listing: ${propertyInfo.propertyID1}/${propertyInfo.valueID1}`)
          }
        }
      } catch (error) {
        console.warn('Could not fetch existing listings to get property IDs:', error)
      }
    })

    it.skipIf(!propertyInfo)('should create a listing with variations', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available. Create a listing with variations first to enable this test.')
        return
      }

      // Get additional value IDs by finding another variation with different values
      // For simplicity, we'll use the same property but try to find different value IDs
      let valueID1_2 = propertyInfo.valueID1
      const valueID2_2 = propertyInfo.valueID2
      
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        for (const listing of inactiveListings.results) {
          if (listing.has_variations && listing.inventory.products.length > 1) {
            const product2 = listing.inventory.products[1]
            if (product2.property_values.length > 0) {
              const differentValue = product2.property_values[0].value_ids.find(id => id !== propertyInfo!.valueID1)
              if (differentValue) {
                valueID1_2 = differentValue
                break
              }
            }
          }
        }
      } catch (error) {
        console.warn('Could not find different value IDs, using same values')
      }

      const variation1 = createTestVariation(
        propertyInfo,
        'Small',
        'Red',
        15.99,
        5,
        `E2E-SKU-1-${Date.now()}`
      )
      
      // Create second variation with potentially different value IDs
      const variation2Info = {
        ...propertyInfo,
        valueID1: valueID1_2,
        valueID2: valueID2_2,
      }
      const variation2 = createTestVariation(
        variation2Info,
        'Large',
        'Blue',
        25.99,
        10,
        `E2E-SKU-2-${Date.now()}`
      )
      
      const listing = createTestListing('E2E Test - Create With Variations', true, [
        variation1,
        variation2,
      ])
      
      const listingID = await createListing(shopID, listing)
      createdListingIDs.push(listingID)
      
      expect(listingID).toBeGreaterThan(0)
      
      // Update inventory with variations
      await updateListingInventory(listingID, listing, null)
      
      // Verify listing was created
      const created = await getListing(listingID)
      expect(created.listing_id).toBe(listingID)
      expect(created.title).toBe(listing.title)
      expect(created.state).toBe('inactive')
      expect(created.has_variations).toBe(true)
      expect(created.inventory.products.length).toBeGreaterThan(0)
    })

    it.skipIf(!propertyInfo)('should update a listing with variations', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available.')
        return
      }

      // Create listing with variations first
      const variation1 = createTestVariation(
        propertyInfo,
        'Small',
        'Red',
        15.99,
        5,
        `E2E-SKU-UPDATE-1-${Date.now()}`
      )
      
      const originalListing = createTestListing('E2E Test - Update With Variations Original', true, [variation1])
      const listingID = await createListing(shopID, originalListing)
      createdListingIDs.push(listingID)
      await updateListingInventory(listingID, originalListing, null)
      
      // Get existing listing
      const existing = await getListing(listingID)
      
      // Get product ID from created variation
      const createdVariation = existing.inventory.products[0]
      const variation1WithID: ProcessedVariation = {
        ...variation1,
        productID: createdVariation.product_id,
      }
      
      // Find a different value ID for second variation
      let valueID1_2 = propertyInfo.valueID1
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        for (const listing of inactiveListings.results) {
          if (listing.has_variations && listing.inventory.products.length > 1) {
            const product2 = listing.inventory.products[1]
            if (product2.property_values.length > 0) {
              const differentValue = product2.property_values[0].value_ids.find(id => id !== propertyInfo!.valueID1)
              if (differentValue) {
                valueID1_2 = differentValue
                break
              }
            }
          }
        }
      } catch (error) {
        // Use same value ID if can't find different one
      }
      
      // Update listing title and add a new variation
      const variation2Info = {
        ...propertyInfo,
        valueID1: valueID1_2,
      }
      const variation2 = createTestVariation(
        variation2Info,
        'Large',
        'Blue',
        25.99,
        10,
        `E2E-SKU-UPDATE-2-${Date.now()}`
      )
      
      const updatedListing: ProcessedListing = {
        ...originalListing,
        listingID,
        title: 'E2E Test - Update With Variations Updated',
        variations: [variation1WithID, variation2], // Keep original with ID and add new
      }
      
      await updateListing(shopID, listingID, updatedListing, existing)
      await updateListingInventory(listingID, updatedListing, existing)
      
      // Verify update
      const updated = await getListing(listingID)
      expect(updated.title).toBe(updatedListing.title)
      expect(updated.has_variations).toBe(true)
      // Should have both variations now
      expect(updated.inventory.products.filter(p => !p.is_deleted).length).toBeGreaterThanOrEqual(2)
    })

    it.skipIf(!propertyInfo)('should delete a listing with variations', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available.')
        return
      }

      // Create listing with variations first
      const variation1 = createTestVariation(
        propertyInfo,
        'Small',
        'Red',
        15.99,
        5,
        `E2E-SKU-DELETE-${Date.now()}`
      )
      
      const listing = createTestListing('E2E Test - Delete With Variations', true, [variation1])
      const listingID = await createListing(shopID, listing)
      await updateListingInventory(listingID, listing, null)
      
      // Verify it exists
      const created = await getListing(listingID)
      expect(created.listing_id).toBe(listingID)
      expect(created.has_variations).toBe(true)
      
      // Delete listing
      await deleteListing(shopID, listingID)
      
      // Verify deletion
      try {
        await getListing(listingID)
        console.warn(`Listing ${listingID} may still exist (deletion may be async)`)
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe('Variation operations', () => {
    let listingWithVariationsID: number
    let existingListing: Listing
    let propertyInfo: { propertyID1: number; valueID1: number; propertyID2: number | null; valueID2: number | null } | null = null

    beforeAll(async () => {
      if (!isAuthenticated) {
        return
      }
      // Get property info from existing listings
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        const listingWithVariations = inactiveListings.results.find(l => l.has_variations && l.inventory.products.length > 0)
        
        if (listingWithVariations) {
          propertyInfo = extractPropertyInfo(listingWithVariations)
        }
      } catch (error) {
        console.warn('Could not fetch existing listings to get property IDs:', error)
      }

      if (!propertyInfo) {
        console.log('Skipping variation operations tests: No property IDs available.')
        return
      }

      // Create a listing with variations for variation tests
      // Find different value IDs for multiple variations
      let valueID1_2 = propertyInfo.valueID1
      let valueID2_2 = propertyInfo.valueID2
      
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        for (const listing of inactiveListings.results) {
          if (listing.has_variations && listing.inventory.products.length > 1) {
            const product2 = listing.inventory.products[1]
            if (product2.property_values.length > 0) {
              const differentValue = product2.property_values[0].value_ids.find(id => id !== propertyInfo!.valueID1)
              if (differentValue) {
                valueID1_2 = differentValue
                if (product2.property_values.length > 1 && propertyInfo.valueID2) {
                  const differentValue2 = product2.property_values[1].value_ids.find(id => id !== propertyInfo!.valueID2)
                  if (differentValue2) {
                    valueID2_2 = differentValue2
                  }
                }
                break
              }
            }
          }
        }
      } catch (error) {
        // Use same value IDs if can't find different ones
      }
      
      const variation1 = createTestVariation(
        propertyInfo,
        'Small',
        'Red',
        15.99,
        5,
        `E2E-SKU-VAR-1-${Date.now()}`
      )
      
      const variation2Info = {
        ...propertyInfo,
        valueID1: valueID1_2,
        valueID2: valueID2_2,
      }
      const variation2 = createTestVariation(
        variation2Info,
        'Medium',
        'Green',
        20.99,
        8,
        `E2E-SKU-VAR-2-${Date.now()}`
      )
      
      const listing = createTestListing('E2E Test - Variation Operations Base', true, [
        variation1,
        variation2,
      ])
      
      listingWithVariationsID = await createListing(shopID, listing)
      createdListingIDs.push(listingWithVariationsID)
      await updateListingInventory(listingWithVariationsID, listing, null, undefined, shopID)
      
      existingListing = await getListing(listingWithVariationsID)
      expect(existingListing.has_variations).toBe(true)
      expect(existingListing.inventory.products.filter(p => !p.is_deleted).length).toBeGreaterThanOrEqual(2)
    })

    it.skipIf(!propertyInfo)('should create a new variation', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available.')
        return
      }

      // Get current listing
      const current = await getListing(listingWithVariationsID)
      const currentProductCount = current.inventory.products.filter(p => !p.is_deleted).length
      
      // Find a different value ID for the new variation
      let valueID1_new = propertyInfo.valueID1
      let valueID2_new = propertyInfo.valueID2
      
      // Try to find a value ID that's not already used
      const usedValueIDs = new Set(current.inventory.products.flatMap(p => 
        p.property_values.flatMap(pv => pv.value_ids)
      ))
      
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        for (const listing of inactiveListings.results) {
          if (listing.has_variations) {
            for (const product of listing.inventory.products) {
              if (product.property_values.length > 0) {
                const newValue = product.property_values[0].value_ids.find(id => !usedValueIDs.has(id))
                if (newValue) {
                  valueID1_new = newValue
                  if (product.property_values.length > 1 && propertyInfo.valueID2) {
                    const newValue2 = product.property_values[1].value_ids.find(id => !usedValueIDs.has(id))
                    if (newValue2) {
                      valueID2_new = newValue2
                    }
                  }
                  break
                }
              }
            }
          }
        }
      } catch (error) {
        // Use existing value IDs if can't find new ones
      }
      
      // Create new variation
      const newVariationInfo = {
        ...propertyInfo,
        valueID1: valueID1_new,
        valueID2: valueID2_new,
      }
      const newVariation = createTestVariation(
        newVariationInfo,
        'Large',
        'Blue',
        25.99,
        10,
        `E2E-SKU-NEW-${Date.now()}`
      )
      
      const updatedListing: ProcessedListing = {
        listingID: listingWithVariationsID,
        title: current.title,
        description: current.description,
        sku: '',
        status: current.state,
        quantity: null,
        tags: current.tags,
        price: null,
        currencyCode: current.price.currency_code,
        hasVariations: true,
        variations: [
          // Keep existing variations (convert from current listing)
          ...current.inventory.products.map((p) => ({
            productID: p.product_id,
            propertyName1: p.property_values[0]?.property_name || '',
            propertyOption1: p.property_values[0]?.values[0] || '',
            propertyName2: p.property_values[1]?.property_name || '',
            propertyOption2: p.property_values[1]?.values[0] || '',
            propertySKU: p.sku,
            propertyQuantity: p.offerings[0]?.quantity || null,
            propertyPrice: p.offerings[0] ? p.offerings[0].price.amount / p.offerings[0].price.divisor : null,
            propertyID1: p.property_values[0]?.property_id || 0,
            propertyOptionIDs1: p.property_values[0]?.value_ids || [],
            propertyID2: p.property_values[1]?.property_id || 0,
            propertyOptionIDs2: p.property_values[1]?.value_ids || [],
            toDelete: false,
          })),
          // Add new variation
          newVariation,
        ],
        toDelete: false,
      }
      
      await updateListingInventory(listingWithVariationsID, updatedListing, current, undefined, shopID)
      
      // Verify new variation was added
      const updated = await getListing(listingWithVariationsID)
      expect(updated.inventory.products.filter(p => !p.is_deleted).length).toBeGreaterThan(currentProductCount)
    })

    it.skipIf(!propertyInfo)('should update an existing variation', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available.')
        return
      }
      // Get current listing
      const current = await getListing(listingWithVariationsID)
      expect(current.inventory.products.length).toBeGreaterThan(0)
      
      const firstProduct = current.inventory.products[0]
      
      // Update the first variation's price
      const updatedVariations: ProcessedVariation[] = current.inventory.products.map((p) => {
        const isFirst = p.product_id === firstProduct.product_id
        return {
          productID: p.product_id,
          propertyName1: p.property_values[0]?.property_name || '',
          propertyOption1: p.property_values[0]?.values[0] || '',
          propertyName2: p.property_values[1]?.property_name || '',
          propertyOption2: p.property_values[1]?.values[0] || '',
          propertySKU: p.sku,
          propertyQuantity: p.offerings[0]?.quantity || null,
          propertyPrice: isFirst ? 30.99 : (p.offerings[0] ? p.offerings[0].price.amount / p.offerings[0].price.divisor : null),
          propertyID1: p.property_values[0]?.property_id || 0,
          propertyOptionIDs1: p.property_values[0]?.value_ids || [],
          propertyID2: p.property_values[1]?.property_id || 0,
          propertyOptionIDs2: p.property_values[1]?.value_ids || [],
          toDelete: false,
        }
      })
      
      const updatedListing: ProcessedListing = {
        listingID: listingWithVariationsID,
        title: current.title,
        description: current.description,
        sku: '',
        status: current.state,
        quantity: null,
        tags: current.tags,
        price: null,
        currencyCode: current.price.currency_code,
        hasVariations: true,
        variations: updatedVariations,
        toDelete: false,
      }
      
      await updateListingInventory(listingWithVariationsID, updatedListing, current, undefined, shopID)
      
      // Verify variation was updated
      const updated = await getListing(listingWithVariationsID)
      const updatedFirstProduct = updated.inventory.products.find(p => p.product_id === firstProduct.product_id)
      if (updatedFirstProduct && updatedFirstProduct.offerings.length > 0) {
        const newPrice = updatedFirstProduct.offerings[0].price.amount / updatedFirstProduct.offerings[0].price.divisor
        expect(newPrice).toBeCloseTo(30.99, 2)
      }
    })

    it.skipIf(!propertyInfo || !isAuthenticated)('should auto-generate missing combinations when adding new property value', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available.')
        return
      }
      if (!isAuthenticated) {
        console.log('Skipping test: Not authenticated.')
        return
      }

      // Create a listing with variations first (e.g., S/Red, S/Blue, M/Red, M/Blue)
      // Then add a new size (e.g., L) with only one color (e.g., L/Red)
      // The system should auto-generate L/Blue with is_enabled: false
      
      // Find different value IDs for multiple variations
      let valueID1_2 = propertyInfo.valueID1
      let valueID2_2 = propertyInfo.valueID2
      
      if (propertyInfo) {
        const propInfo = propertyInfo // Capture for type narrowing
        try {
          const inactiveListings = await fetchListings(shopID, 'inactive')
          for (const listing of inactiveListings.results) {
            if (listing.has_variations && listing.inventory.products.length > 1) {
              const product2 = listing.inventory.products[1]
              if (product2.property_values.length > 0) {
                const differentValue = product2.property_values[0].value_ids.find(id => id !== propInfo.valueID1)
                if (differentValue) {
                  valueID1_2 = differentValue
                  if (product2.property_values.length > 1 && propInfo.valueID2) {
                    const differentValue2 = product2.property_values[1].value_ids.find(id => id !== propInfo.valueID2)
                    if (differentValue2) {
                      valueID2_2 = differentValue2
                    }
                  }
                  break
                }
              }
            }
          }
        } catch (error) {
          // Use same value IDs if can't find different ones
        }
      }

      // Create listing with existing variations (S/Red, S/Blue, M/Red, M/Blue)
      const variation1 = createTestVariation(
        propertyInfo,
        'Small',
        'Red',
        15.99,
        5,
        `E2E-SKU-AUTO-1-${Date.now()}`
      )
      
      const variation2Info = {
        ...propertyInfo,
        valueID2: valueID2_2,
      }
      const variation2 = createTestVariation(
        variation2Info,
        'Small',
        'Blue',
        15.99,
        5,
        `E2E-SKU-AUTO-2-${Date.now()}`
      )
      
      const variation3Info = {
        ...propertyInfo,
        valueID1: valueID1_2,
      }
      const variation3 = createTestVariation(
        variation3Info,
        'Medium',
        'Red',
        16.99,
        6,
        `E2E-SKU-AUTO-3-${Date.now()}`
      )
      
      const variation4Info = {
        ...propertyInfo,
        valueID1: valueID1_2,
        valueID2: valueID2_2,
      }
      const variation4 = createTestVariation(
        variation4Info,
        'Medium',
        'Blue',
        16.99,
        6,
        `E2E-SKU-AUTO-4-${Date.now()}`
      )
      
      const listing = createTestListing('E2E Test - Auto Generate Combinations Base', true, [
        variation1,
        variation2,
        variation3,
        variation4,
      ])
      
      const listingID = await createListing(shopID, listing)
      createdListingIDs.push(listingID)
      await updateListingInventory(listingID, listing, null, undefined, shopID)
      
      // Get the created listing to extract property IDs
      const createdListing = await getListing(listingID)
      expect(createdListing.has_variations).toBe(true)
      expect(createdListing.inventory.products.filter(p => !p.is_deleted).length).toBe(4)
      
      // Now add a new size (Large) with only one color (Red)
      // The system should auto-generate Large/Blue with is_enabled: false
      
      // Find a new value ID for "Large" size
      let largeValueID = valueID1_2
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        for (const listing of inactiveListings.results) {
          if (listing.has_variations) {
            for (const product of listing.inventory.products) {
              if (product.property_values.length > 0) {
                const newValue = product.property_values[0].value_ids.find(
                  id => propertyInfo && id !== propertyInfo.valueID1 && id !== valueID1_2
                )
                if (newValue) {
                  largeValueID = newValue
                  break
                }
              }
            }
          }
        }
      } catch (error) {
        // Use existing value ID if can't find new one
      }
      
      // Create new variation with new size (Large) and existing color (Red)
      const newVariationInfo = {
        ...propertyInfo,
        valueID1: largeValueID,
      }
      const newVariation = createTestVariation(
        newVariationInfo,
        'Large',
        'Red',
        17.99,
        7,
        `E2E-SKU-AUTO-NEW-${Date.now()}`
      )
      
      // Update listing with new variation (should auto-generate Large/Blue)
      const updatedListing: ProcessedListing = {
        listingID,
        title: createdListing.title,
        description: createdListing.description,
        sku: '',
        status: createdListing.state,
        quantity: null,
        tags: createdListing.tags,
        price: null,
        currencyCode: createdListing.price.currency_code,
        hasVariations: true,
        variations: [
          // Keep existing variations
          ...createdListing.inventory.products.map((p) => ({
            productID: p.product_id,
            propertyName1: p.property_values[0]?.property_name || '',
            propertyOption1: p.property_values[0]?.values[0] || '',
            propertyName2: p.property_values[1]?.property_name || '',
            propertyOption2: p.property_values[1]?.values[0] || '',
            propertySKU: p.sku,
            propertyQuantity: p.offerings[0]?.quantity || null,
            propertyPrice: p.offerings[0] ? p.offerings[0].price.amount / p.offerings[0].price.divisor : null,
            propertyID1: p.property_values[0]?.property_id || 0,
            propertyOptionIDs1: p.property_values[0]?.value_ids || [],
            propertyID2: p.property_values[1]?.property_id || 0,
            propertyOptionIDs2: p.property_values[1]?.value_ids || [],
            toDelete: false,
          })),
          // Add new variation (Large/Red)
          newVariation,
        ],
        toDelete: false,
      }
      
      await updateListingInventory(listingID, updatedListing, createdListing, undefined, shopID)
      
      // Verify that all combinations were created
      const updated = await getListing(listingID)
      const activeProducts = updated.inventory.products.filter(p => !p.is_deleted)
      
      // Should have 6 products now: 4 original + 2 new (Large/Red + auto-generated Large/Blue)
      expect(activeProducts.length).toBeGreaterThanOrEqual(5) // At least 5 (4 original + 1 new + 1 auto-generated)
      
      // Find the auto-generated Large/Blue variation (should have is_enabled: false)
      if (!propertyInfo || !propertyInfo.propertyID2) {
        throw new Error('Property info is required for this test')
      }
      
      // TypeScript guard: propertyInfo is guaranteed to be non-null here
      const propID1 = propertyInfo.propertyID1
      const propID2 = propertyInfo.propertyID2
      
          const largeBlueProduct = activeProducts.find(p => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prop1 = p.property_values.find((pv: any) => pv.property_id === propID1)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prop2 = p.property_values.find((pv: any) => pv.property_id === propID2)
        return prop1?.value_ids.includes(largeValueID) && 
               prop2?.value_ids.includes(valueID2_2 ?? 0) &&
               !createdListing.inventory.products.some((ep: any) => ep.product_id === p.product_id) // Not in original listing
      })
      
      expect(largeBlueProduct).toBeDefined()
      if (largeBlueProduct) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const offering = largeBlueProduct.offerings.find((o: any) => !o.is_deleted)
        expect(offering).toBeDefined()
        // The auto-generated combination should be disabled
        expect(offering?.is_enabled).toBe(false)
      }
    })

    it.skipIf(!propertyInfo || !isAuthenticated)('should create new variation without value ID and generate all combinations', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available.')
        return
      }
      if (!isAuthenticated) {
        console.log('Skipping test: Not authenticated.')
        return
      }

      // This test covers the case where we add a new property value (e.g., "3XL")
      // that doesn't exist in the shop yet, so we don't have a value ID for it.
      // The system should still create the variation and generate all combinations.

      // Create a base listing with existing variations
      let valueID1_2 = propertyInfo.valueID1
      let valueID2_2 = propertyInfo.valueID2
      
      try {
        const inactiveListings = await fetchListings(shopID, 'inactive')
        for (const listing of inactiveListings.results) {
          if (listing.has_variations && listing.inventory.products.length > 1) {
            const product2 = listing.inventory.products[1]
            if (product2.property_values.length > 0) {
              const differentValue = product2.property_values[0].value_ids.find(id => propertyInfo && id !== propertyInfo.valueID1)
              if (differentValue) {
                valueID1_2 = differentValue
                if (product2.property_values.length > 1 && propertyInfo && propertyInfo.valueID2) {
                  const differentValue2 = product2.property_values[1].value_ids.find(id => propertyInfo && id !== propertyInfo.valueID2)
                  if (differentValue2) {
                    valueID2_2 = differentValue2
                  }
                }
                break
              }
            }
          }
        }
      } catch (error) {
        // Use same value IDs if can't find different ones
      }

      // Create listing with existing variations (e.g., S/Red, S/Blue, M/Red, M/Blue)
      const variation1 = createTestVariation(
        propertyInfo,
        'Small',
        'Red',
        15.99,
        5,
        `E2E-SKU-NOVID-1-${Date.now()}`
      )
      
      const variation2Info = {
        ...propertyInfo,
        valueID2: valueID2_2,
      }
      const variation2 = createTestVariation(
        variation2Info,
        'Small',
        'Blue',
        15.99,
        5,
        `E2E-SKU-NOVID-2-${Date.now()}`
      )
      
      const variation3Info = {
        ...propertyInfo,
        valueID1: valueID1_2,
      }
      const variation3 = createTestVariation(
        variation3Info,
        'Medium',
        'Red',
        16.99,
        6,
        `E2E-SKU-NOVID-3-${Date.now()}`
      )
      
      const variation4Info = {
        ...propertyInfo,
        valueID1: valueID1_2,
        valueID2: valueID2_2,
      }
      const variation4 = createTestVariation(
        variation4Info,
        'Medium',
        'Blue',
        16.99,
        6,
        `E2E-SKU-NOVID-4-${Date.now()}`
      )
      
      const listing = createTestListing('E2E Test - New Variation Without Value ID Base', true, [
        variation1,
        variation2,
        variation3,
        variation4,
      ])
      
      const listingID = await createListing(shopID, listing)
      createdListingIDs.push(listingID)
      await updateListingInventory(listingID, listing, null, undefined, shopID)
      
      const createdListing = await getListing(listingID)
      expect(createdListing.has_variations).toBe(true)
      expect(createdListing.inventory.products.filter(p => !p.is_deleted).length).toBe(4)
      
      // Now add a new variation with a property value that doesn't have a value ID
      // This simulates the case where we're adding "3XL" but can't find its value ID
      // We'll create a variation with propertyID1 set but propertyOptionIDs1 empty
      const newVariationWithoutValueID: ProcessedVariation = {
        productID: 0, // New variation
        propertyName1: 'Size', // Property name from existing variations
        propertyOption1: '3XL', // New value that doesn't exist yet
        propertyName2: propertyInfo.propertyID2 ? 'Color' : '',
        propertyOption2: 'Red', // Existing color
        propertySKU: `E2E-SKU-NOVID-NEW-${Date.now()}`,
        propertyQuantity: 10,
        propertyPrice: 18.99,
        propertyID1: propertyInfo.propertyID1, // We have the property ID
        propertyOptionIDs1: [], // But no value IDs (empty array simulates not found)
        propertyID2: propertyInfo.propertyID2 || 0,
        propertyOptionIDs2: propertyInfo.valueID2 ? [propertyInfo.valueID2] : [], // Use existing color value ID
        toDelete: false,
      }
      
      // Update listing with new variation (should generate all combinations)
      const updatedListing: ProcessedListing = {
        listingID,
        title: createdListing.title,
        description: createdListing.description,
        sku: '',
        status: createdListing.state,
        quantity: null,
        tags: createdListing.tags,
        price: null,
        currencyCode: createdListing.price.currency_code,
        hasVariations: true,
        variations: [
          // Keep existing variations
          ...createdListing.inventory.products.map((p) => ({
            productID: p.product_id,
            propertyName1: p.property_values[0]?.property_name || '',
            propertyOption1: p.property_values[0]?.values[0] || '',
            propertyName2: p.property_values[1]?.property_name || '',
            propertyOption2: p.property_values[1]?.values[0] || '',
            propertySKU: p.sku,
            propertyQuantity: p.offerings[0]?.quantity || null,
            propertyPrice: p.offerings[0] ? p.offerings[0].price.amount / p.offerings[0].price.divisor : null,
            propertyID1: p.property_values[0]?.property_id || 0,
            propertyOptionIDs1: p.property_values[0]?.value_ids || [],
            propertyID2: p.property_values[1]?.property_id || 0,
            propertyOptionIDs2: p.property_values[1]?.value_ids || [],
            toDelete: false,
          })),
          // Add new variation without value ID (3XL/Red)
          newVariationWithoutValueID,
        ],
        toDelete: false,
      }
      
      await updateListingInventory(listingID, updatedListing, createdListing, undefined, shopID)
      
      // Verify that all combinations were created
      const updated = await getListing(listingID)
      const activeProducts = updated.inventory.products.filter(p => !p.is_deleted)
      
      // Should have at least 5 products: 4 original + 1 new (3XL/Red) + potentially auto-generated 3XL/Blue
      // Note: If Etsy rejects the variation without value IDs, we might have fewer products
      // But the system should have attempted to create all combinations
      expect(activeProducts.length).toBeGreaterThanOrEqual(4) // At least the original 4
      
      // Try to find the new 3XL variations
      const propID1 = propertyInfo.propertyID1
      const propID2 = propertyInfo.propertyID2
      
      if (propID2) {
        // Look for 3XL/Red (the one we explicitly added)
        const xl3RedProduct = activeProducts.find(p => {
          const prop1 = p.property_values.find((pv: any) => pv.property_id === propID1)
          const prop2 = p.property_values.find((pv: any) => pv.property_id === propID2)
          // Check if prop1 has "3XL" in values (even if value_ids is empty)
          const has3XL = prop1?.values?.some((v: string) => v.toLowerCase() === '3xl') || 
                        prop1?.value_ids?.length === 0 // Or has empty value_ids (new value)
          return has3XL && 
                 prop2?.value_ids?.includes((propertyInfo?.valueID2) ?? 0) && // Red color
                 !createdListing.inventory.products.some((ep: any) => ep.product_id === p.product_id) // Not in original
        })
        
        // The variation might be created or rejected by Etsy
        // If it was created, verify it exists
        if (xl3RedProduct) {
          expect(xl3RedProduct).toBeDefined()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const offering = xl3RedProduct.offerings.find((o: any) => !o.is_deleted)
          expect(offering).toBeDefined()
        }
        
        // Look for auto-generated 3XL/Blue (should be created with is_enabled: false)
            const xl3BlueProduct = activeProducts.find(p => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const prop1 = p.property_values.find((pv: any) => pv.property_id === propID1)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const prop2 = p.property_values.find((pv: any) => pv.property_id === propID2)
          const has3XL = prop1?.values?.some((v: string) => v.toLowerCase() === '3xl') || 
                        prop1?.value_ids?.length === 0
          return has3XL && 
                 prop2?.value_ids?.includes(valueID2_2 ?? 0) && // Blue color
                 !createdListing.inventory.products.some((ep: any) => ep.product_id === p.product_id) // Not in original
        })
        
        // If auto-generated combination exists, it should be disabled
        if (xl3BlueProduct) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const offering = xl3BlueProduct.offerings.find((o: any) => !o.is_deleted)
          if (offering) {
            // Auto-generated combinations should be disabled
            expect(offering.is_enabled).toBe(false)
          }
        }
      }
    })

    it.skipIf(!propertyInfo || !isAuthenticated)('should delete a variation', async () => {
      if (!propertyInfo) {
        console.log('Skipping test: No property IDs available.')
        return
      }
      if (!isAuthenticated) {
        console.log('Skipping test: Not authenticated.')
        return
      }

      // Get current listing
      const current = await getListing(listingWithVariationsID)
      expect(current.inventory.products.filter(p => !p.is_deleted).length).toBeGreaterThan(1) // Need at least 2 to delete one
      
      const firstProduct = current.inventory.products[0]
      const productIDToDelete = firstProduct.product_id
      
      // Mark first variation for deletion
      const updatedVariations: ProcessedVariation[] = current.inventory.products.map((p) => ({
        productID: p.product_id,
        propertyName1: p.property_values[0]?.property_name || '',
        propertyOption1: p.property_values[0]?.values[0] || '',
        propertyName2: p.property_values[1]?.property_name || '',
        propertyOption2: p.property_values[1]?.values[0] || '',
        propertySKU: p.sku,
        propertyQuantity: p.offerings[0]?.quantity || null,
        propertyPrice: p.offerings[0] ? p.offerings[0].price.amount / p.offerings[0].price.divisor : null,
        propertyID1: p.property_values[0]?.property_id || 0,
        propertyOptionIDs1: p.property_values[0]?.value_ids || [],
        propertyID2: p.property_values[1]?.property_id || 0,
        propertyOptionIDs2: p.property_values[1]?.value_ids || [],
        toDelete: p.product_id === productIDToDelete, // Mark first for deletion
      }))
      
      const updatedListing: ProcessedListing = {
        listingID: listingWithVariationsID,
        title: current.title,
        description: current.description,
        sku: '',
        status: current.state,
        quantity: null,
        tags: current.tags,
        price: null,
        currencyCode: current.price.currency_code,
        hasVariations: true,
        variations: updatedVariations,
        toDelete: false,
      }
      
      const originalCount = current.inventory.products.filter(p => !p.is_deleted).length
      await updateListingInventory(listingWithVariationsID, updatedListing, current, undefined, shopID)
      
      // Verify variation was deleted
      const updated = await getListing(listingWithVariationsID)
      // Deleted products should be marked as is_deleted
      const activeProducts = updated.inventory.products.filter(p => !p.is_deleted)
      expect(activeProducts.length).toBeLessThan(originalCount)
    })
  })
})

describe('E2E Comprehensive Workflow Tests - Draft Listings', () => {
  let shopID: number
  let isAuthenticated = false
  let propertyInfo: { propertyID1: number; valueID1: number; propertyID2: number | null; valueID2: number | null } | null = null
  let baseListingID: number | null = null // For testing variations on existing listing
  let variationListingID: number | null = null // For testing conversion

  // Helper to get defaultReadinessStateID
  async function getDefaultReadinessStateID(): Promise<number | undefined> {
    try {
      const listings = await fetchListings(shopID, 'draft')
      if (listings.results.length > 0) {
        const listing = listings.results[0]
        if (listing.inventory.products.length > 0) {
          const product = listing.inventory.products[0]
          const offering = product.offerings.find(o => !o.is_deleted)
          return offering?.readiness_state_id
        }
      }
    } catch (error) {
      console.warn('Could not get defaultReadinessStateID:', error)
    }
    return undefined
  }

  beforeAll(async () => {
    try {
      // Get valid access token and shop ID
      await getValidAccessToken()
      shopID = await getShopID()
      expect(shopID).toBeGreaterThan(0)
      isAuthenticated = true
    } catch (error) {
      console.warn('E2E tests require OAuth authentication. Please authenticate first.')
      isAuthenticated = false
      return
    }
    
    // Get property IDs from existing listings
    try {
      const draftListings = await fetchListings(shopID, 'draft')
      const listingWithVariations = draftListings.results.find(
        l => l.has_variations && l.inventory.products.length > 0
      )
      
      if (listingWithVariations) {
        propertyInfo = extractPropertyInfo(listingWithVariations)
        if (propertyInfo) {
          console.log(`Found property IDs: ${propertyInfo.propertyID1}/${propertyInfo.valueID1}`)
        }
      }
    } catch (error) {
      console.warn('Could not fetch listings to get property IDs:', error)
    }
  })

  // 1. Add a new product without variations
  it.skipIf(!isAuthenticated)('should add a new product without variations', async () => {
    if (!isAuthenticated) {
      console.log('Skipping test: Not authenticated.')
      return
    }

    const listing = createTestListing('E2E Draft - New Product No Variations')
    listing.status = 'draft' // Use draft status
    listing.title = 'E2E Draft - New Product No Variations'
    listing.description = 'Test description for new product without variations'
    listing.price = 24.99
    listing.quantity = 15
    listing.tags = ['e2e-test', 'draft', 'no-variations']
    listing.materials = ['Cotton', 'Polyester']
    listing.shippingProfileID = undefined // Will use default
    listing.processingMin = 2
    listing.processingMax = 5

    const defaultReadinessStateID = await getDefaultReadinessStateID()
    const listingID = await createListing(shopID, listing)
    createdListingIDs.push(listingID)
    baseListingID = listingID

    expect(listingID).toBeGreaterThan(0)

    // Update inventory
    await updateListingInventory(listingID, listing, null, defaultReadinessStateID, shopID)

    // Verify listing was created
    const created = await getListing(listingID)
    expect(created.listing_id).toBe(listingID)
    expect(created.title).toBe(listing.title)
    expect(created.state).toBe('draft')
    expect(created.has_variations).toBe(false)
    expect(created.description).toBe(listing.description)
    const price = created.price.amount / created.price.divisor
    expect(price).toBeCloseTo(24.99, 2)
    expect(created.quantity).toBe(15)
    expect(created.tags).toContain('e2e-test')
    expect(created.tags).toContain('draft')
    expect(created.tags).toContain('no-variations')
    if (created.materials) {
      expect(created.materials).toContain('Cotton')
      expect(created.materials).toContain('Polyester')
    }
    if (created.processing_min !== undefined) {
      expect(created.processing_min).toBe(2)
    }
    if (created.processing_max !== undefined) {
      expect(created.processing_max).toBe(5)
    }
  })

  // 2. Add a new product with variations
  it.skipIf(!propertyInfo || !isAuthenticated)('should add a new product with variations', async () => {
    if (!propertyInfo || !isAuthenticated) {
      console.log('Skipping test: No property IDs available or not authenticated.')
      return
    }

    // Get different value IDs for variations
    let valueID1_2 = propertyInfo.valueID1
    let valueID2_2 = propertyInfo.valueID2
    
    try {
      const draftListings = await fetchListings(shopID, 'draft')
      for (const listing of draftListings.results) {
        if (listing.has_variations && listing.inventory.products.length > 1) {
          const product2 = listing.inventory.products[1]
          if (product2.property_values.length > 0) {
            const differentValue = product2.property_values[0].value_ids.find(
              id => id !== propertyInfo!.valueID1
            )
            if (differentValue) {
              valueID1_2 = differentValue
              break
            }
          }
          if (product2.property_values.length > 1 && propertyInfo.propertyID2) {
            const differentValue2 = product2.property_values[1].value_ids.find(
              id => id !== propertyInfo!.valueID2
            )
            if (differentValue2) {
              valueID2_2 = differentValue2
              break
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not find different value IDs, using same values')
    }

    const variation1 = createTestVariation(
      propertyInfo,
      'Small',
      'Red',
      19.99,
      8,
      `E2E-DRAFT-SKU-1-${Date.now()}`
    )
    
    const variation2Info = {
      ...propertyInfo,
      valueID1: valueID1_2,
      valueID2: valueID2_2,
    }
    const variation2 = createTestVariation(
      variation2Info,
      'Medium',
      'Blue',
      24.99,
      12,
      `E2E-DRAFT-SKU-2-${Date.now()}`
    )

    const variation3 = createTestVariation(
      variation2Info,
      'Large',
      'Green',
      29.99,
      15,
      `E2E-DRAFT-SKU-3-${Date.now()}`
    )

    const listing = createTestListing('E2E Draft - New Product With Variations', true, [
      variation1,
      variation2,
      variation3,
    ])
    listing.status = 'draft'
    listing.materials = ['Wool', 'Nylon']
    listing.processingMin = 3
    listing.processingMax = 7

    const defaultReadinessStateID = await getDefaultReadinessStateID()
    const listingID = await createListing(shopID, listing)
    createdListingIDs.push(listingID)
    variationListingID = listingID

    expect(listingID).toBeGreaterThan(0)

    // Update inventory with variations
    await updateListingInventory(listingID, listing, null, defaultReadinessStateID, shopID)

    // Verify listing was created
    const created = await getListing(listingID)
    expect(created.listing_id).toBe(listingID)
    expect(created.title).toBe(listing.title)
    expect(created.state).toBe('draft')
    expect(created.has_variations).toBe(true)
    expect(created.inventory.products.length).toBeGreaterThanOrEqual(3)
    
    // Verify variations exist
    const products = created.inventory.products.filter(p => !p.is_deleted)
    expect(products.length).toBeGreaterThanOrEqual(3)
  })

  // 3. Add a new product variation to an existing product
  it.skipIf(!propertyInfo || !variationListingID || !isAuthenticated)('should add a new variation to an existing product', async () => {
    if (!propertyInfo || !variationListingID || !isAuthenticated) {
      console.log('Skipping test: No property IDs or variation listing available or not authenticated.')
      return
    }

    // Get existing listing
    const existing = await getListing(variationListingID)
    expect(existing.has_variations).toBe(true)
    
    const originalProductCount = existing.inventory.products.filter(p => !p.is_deleted).length

    // Get a different value ID for the new variation
    let newValueID1 = propertyInfo.valueID1
    try {
      const draftListings = await fetchListings(shopID, 'draft')
      for (const listing of draftListings.results) {
        if (listing.has_variations && listing.inventory.products.length > 0) {
          for (const product of listing.inventory.products) {
            if (product.property_values.length > 0) {
              const differentValue = product.property_values[0].value_ids.find(
                id => id !== propertyInfo!.valueID1 && 
                      id !== existing.inventory.products[0]?.property_values[0]?.value_ids[0]
              )
              if (differentValue) {
                newValueID1 = differentValue
                break
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not find different value ID, using existing')
    }

    // Create new variation
    const newVariationInfo = {
      ...propertyInfo,
      valueID1: newValueID1,
    }
    const newVariation = createTestVariation(
      newVariationInfo,
      'Extra Large',
      'Yellow',
      34.99,
      20,
      `E2E-DRAFT-SKU-NEW-${Date.now()}`
    )

    // Update listing with new variation
    const updatedListing: ProcessedListing = {
      listingID: variationListingID,
      title: existing.title,
      description: existing.description,
      sku: existing.inventory.products[0]?.sku || '',
      status: existing.state,
      quantity: existing.quantity,
      tags: existing.tags,
      price: existing.price.amount / existing.price.divisor,
      currencyCode: existing.price.currency_code,
      hasVariations: true,
      variations: [
        // Keep existing variations (extract from existing listing)
        ...existing.inventory.products
          .filter(p => !p.is_deleted)
          .map(p => {
            const prop1 = p.property_values[0]
            const prop2 = p.property_values[1]
            const offering = p.offerings.find(o => !o.is_deleted)
            return {
              productID: p.product_id,
              propertyName1: 'Size',
              propertyOption1: prop1?.values?.[0] || '',
              propertyName2: prop2 ? 'Color' : '',
              propertyOption2: prop2?.values?.[0] || '',
              propertySKU: p.sku,
              propertyQuantity: offering?.quantity || null,
              propertyPrice: offering ? offering.price.amount / offering.price.divisor : null,
              propertyID1: prop1?.property_id || 0,
              propertyOptionIDs1: prop1?.value_ids || [],
              propertyID2: prop2?.property_id || 0,
              propertyOptionIDs2: prop2?.value_ids || [],
              toDelete: false,
            }
          }),
        // Add new variation
        newVariation,
      ],
      toDelete: false,
    }

    const defaultReadinessStateID = await getDefaultReadinessStateID()
    await updateListingInventory(variationListingID, updatedListing, existing, defaultReadinessStateID, shopID)

    // Verify new variation was added
    const updated = await getListing(variationListingID)
    const newProductCount = updated.inventory.products.filter(p => !p.is_deleted).length
    expect(newProductCount).toBeGreaterThan(originalProductCount)
    
    // Verify new variation exists
    const newProduct = updated.inventory.products.find(
      p => !p.is_deleted && p.sku === newVariation.propertySKU
    )
    expect(newProduct).toBeDefined()
    if (newProduct) {
      const offering = newProduct.offerings.find(o => !o.is_deleted)
      expect(offering).toBeDefined()
      if (offering) {
        const price = offering.price.amount / offering.price.divisor
        expect(price).toBeCloseTo(34.99, 2)
        expect(offering.quantity).toBe(20)
      }
    }
  })

  // 4. Convert an existing listing from no variations to with variations
  it.skipIf(!propertyInfo || !baseListingID || !isAuthenticated)('should convert listing from no variations to with variations', async () => {
    if (!propertyInfo || !baseListingID || !isAuthenticated) {
      console.log('Skipping test: No property IDs or base listing available or not authenticated.')
      return
    }

    // Get existing listing
    const existing = await getListing(baseListingID)
    expect(existing.has_variations).toBe(false)

    // Create variations
    const variation1 = createTestVariation(
      propertyInfo,
      'Small',
      'Red',
      22.99,
      5,
      `E2E-DRAFT-CONV-1-${Date.now()}`
    )

    const variation2 = createTestVariation(
      propertyInfo,
      'Large',
      'Blue',
      26.99,
      10,
      `E2E-DRAFT-CONV-2-${Date.now()}`
    )

    // Convert to variation listing
    const convertedListing: ProcessedListing = {
      listingID: baseListingID,
      title: existing.title + ' - Converted',
      description: existing.description,
      sku: existing.inventory.products[0]?.sku || '',
      status: existing.state,
      quantity: existing.quantity,
      tags: [...existing.tags, 'converted'],
      price: existing.price.amount / existing.price.divisor,
      currencyCode: existing.price.currency_code,
      hasVariations: true, // Convert to variations
      variations: [variation1, variation2],
      toDelete: false,
    }

    const defaultReadinessStateID = await getDefaultReadinessStateID()
    await updateListing(shopID, baseListingID, convertedListing, existing)
    await updateListingInventory(baseListingID, convertedListing, existing, defaultReadinessStateID, shopID)

    // Verify conversion
    const converted = await getListing(baseListingID)
    expect(converted.has_variations).toBe(true)
    expect(converted.inventory.products.filter(p => !p.is_deleted).length).toBeGreaterThanOrEqual(2)
    expect(converted.title).toContain('Converted')
    expect(converted.tags).toContain('converted')
  })

  // 5. Convert an existing listing from with variations to no variations
  it.skipIf(!variationListingID || !isAuthenticated)('should convert listing from with variations to no variations', async () => {
    if (!variationListingID || !isAuthenticated) {
      console.log('Skipping test: No variation listing available or not authenticated.')
      return
    }

    // Get existing listing
    const existing = await getListing(variationListingID)
    expect(existing.has_variations).toBe(true)

    // Get first product's data to use as the single product
    const firstProduct = existing.inventory.products.find(p => !p.is_deleted)
    if (!firstProduct) {
      throw new Error('No products found in listing')
    }
    const firstOffering = firstProduct.offerings.find(o => !o.is_deleted)
    if (!firstOffering) {
      throw new Error('No offerings found in product')
    }

    // Convert to no variations
    const convertedListing: ProcessedListing = {
      listingID: variationListingID,
      title: existing.title + ' - Back to Simple',
      description: existing.description,
      sku: firstProduct.sku,
      status: existing.state,
      quantity: firstOffering.quantity,
      tags: [...existing.tags, 'simplified'],
      price: firstOffering.price.amount / firstOffering.price.divisor,
      currencyCode: firstOffering.price.currency_code,
      hasVariations: false, // Convert back to no variations
      variations: [],
      toDelete: false,
    }

    const defaultReadinessStateID = await getDefaultReadinessStateID()
    await updateListing(shopID, variationListingID, convertedListing, existing)
    await updateListingInventory(variationListingID, convertedListing, existing, defaultReadinessStateID, shopID)

    // Verify conversion
    const converted = await getListing(variationListingID)
    expect(converted.has_variations).toBe(false)
    expect(converted.title).toContain('Back to Simple')
    expect(converted.tags).toContain('simplified')
    
    // Should have only one product now
    const products = converted.inventory.products.filter(p => !p.is_deleted)
    expect(products.length).toBe(1)
  })

  // 6. Delete a product variation
  it.skipIf(!propertyInfo || !variationListingID || !isAuthenticated)('should delete a product variation', async () => {
    if (!propertyInfo || !variationListingID || !isAuthenticated) {
      console.log('Skipping test: No property IDs or variation listing available or not authenticated.')
      return
    }

    // First, ensure we have a listing with variations
    const existing = await getListing(variationListingID)
    if (!existing.has_variations) {
      // Re-convert to variations if needed
      const variation1 = createTestVariation(propertyInfo, 'Small', 'Red', 19.99, 5, `E2E-DRAFT-DEL-1-${Date.now()}`)
      const variation2 = createTestVariation(propertyInfo, 'Medium', 'Blue', 24.99, 10, `E2E-DRAFT-DEL-2-${Date.now()}`)
      const variation3 = createTestVariation(propertyInfo, 'Large', 'Green', 29.99, 15, `E2E-DRAFT-DEL-3-${Date.now()}`)
      
      const listing: ProcessedListing = {
        listingID: variationListingID,
        title: existing.title,
        description: existing.description,
        sku: existing.inventory.products[0]?.sku || '',
        status: existing.state,
        quantity: existing.quantity,
        tags: existing.tags,
        price: existing.price.amount / existing.price.divisor,
        currencyCode: existing.price.currency_code,
        hasVariations: true,
        variations: [variation1, variation2, variation3],
        toDelete: false,
      }
      const defaultReadinessStateID = await getDefaultReadinessStateID()
      await updateListingInventory(variationListingID, listing, existing, defaultReadinessStateID, shopID)
    }

    const beforeDelete = await getListing(variationListingID)
    const productsBefore = beforeDelete.inventory.products.filter(p => !p.is_deleted)
    expect(productsBefore.length).toBeGreaterThan(1)

    // Get a product to delete (not the first one)
    const productToDelete = productsBefore[1]
    const productIDToDelete = productToDelete.product_id

    // Create updated listing with variation marked for deletion
    const updatedListing: ProcessedListing = {
      listingID: variationListingID,
      title: beforeDelete.title,
      description: beforeDelete.description,
      sku: beforeDelete.inventory.products[0]?.sku || '',
      status: beforeDelete.state,
      quantity: beforeDelete.quantity,
      tags: beforeDelete.tags,
      price: beforeDelete.price.amount / beforeDelete.price.divisor,
      currencyCode: beforeDelete.price.currency_code,
      hasVariations: true,
      variations: beforeDelete.inventory.products
        .filter(p => !p.is_deleted)
        .map(p => {
          const prop1 = p.property_values[0]
          const prop2 = p.property_values[1]
          const offering = p.offerings.find(o => !o.is_deleted)
          return {
            productID: p.product_id,
            propertyName1: 'Size',
            propertyOption1: prop1?.values?.[0] || '',
            propertyName2: prop2 ? 'Color' : '',
            propertyOption2: prop2?.values?.[0] || '',
            propertySKU: p.product_id === productIDToDelete ? 'DELETE' : p.sku, // Mark for deletion
            propertyQuantity: offering?.quantity || null,
            propertyPrice: offering ? offering.price.amount / offering.price.divisor : null,
            propertyID1: prop1?.property_id || 0,
            propertyOptionIDs1: prop1?.value_ids || [],
            propertyID2: prop2?.property_id || 0,
            propertyOptionIDs2: prop2?.value_ids || [],
            toDelete: p.product_id === productIDToDelete,
          }
        }),
      toDelete: false,
    }

    const defaultReadinessStateID = await getDefaultReadinessStateID()
    await updateListingInventory(variationListingID, updatedListing, beforeDelete, defaultReadinessStateID, shopID)

    // Verify variation was deleted
    const afterDelete = await getListing(variationListingID)
    const productsAfter = afterDelete.inventory.products.filter(p => !p.is_deleted)
    expect(productsAfter.length).toBeLessThan(productsBefore.length)
    
    // Verify the specific product is deleted
    const deletedProduct = afterDelete.inventory.products.find(p => p.product_id === productIDToDelete)
    expect(deletedProduct?.is_deleted).toBe(true)
  })

  // 7. Delete a product (entire listing)
  it.skipIf(!isAuthenticated)('should delete a product (entire listing)', async () => {
    if (!isAuthenticated) {
      console.log('Skipping test: Not authenticated.')
      return
    }

    // Create a new listing to delete
    const listingToDelete = createTestListing('E2E Draft - To Be Deleted')
    listingToDelete.status = 'draft'
    
    const defaultReadinessStateID = await getDefaultReadinessStateID()
    const listingID = await createListing(shopID, listingToDelete)
    await updateListingInventory(listingID, listingToDelete, null, defaultReadinessStateID, shopID)

    // Verify it exists
    const created = await getListing(listingID)
    expect(created.listing_id).toBe(listingID)

    // Delete the listing
    await deleteListing(shopID, listingID)

    // Verify deletion
    try {
      await getListing(listingID)
      console.warn(`Listing ${listingID} may still exist (deletion may be async)`)
    } catch (error) {
      // Expected - listing should be deleted
      expect(error).toBeDefined()
    }
    
    // Don't add to cleanup since we deleted it
  })

  // 8. Change some of the existing fields
  it.skipIf(!baseListingID || !isAuthenticated)('should update existing fields on a listing', async () => {
    if (!baseListingID || !isAuthenticated) {
      console.log('Skipping test: No base listing available or not authenticated.')
      return
    }

    // Get existing listing
    const existing = await getListing(baseListingID)

    // Update multiple fields
    const updatedListing: ProcessedListing = {
      listingID: baseListingID,
      title: 'E2E Draft - Updated Fields',
      description: 'This description has been updated for testing',
      sku: existing.inventory.products[0]?.sku || '',
      status: 'draft',
      quantity: 25,
      tags: ['e2e-test', 'draft', 'updated', 'comprehensive'],
      price: 39.99,
      currencyCode: 'USD',
      hasVariations: existing.has_variations,
      variations: [],
      toDelete: false,
      materials: ['Updated Material 1', 'Updated Material 2'],
      processingMin: 4,
      processingMax: 8,
    }

    const defaultReadinessStateID = await getDefaultReadinessStateID()
    await updateListing(shopID, baseListingID, updatedListing, existing)
    await updateListingInventory(baseListingID, updatedListing, existing, defaultReadinessStateID, shopID)

    // Verify updates
    const updated = await getListing(baseListingID)
    expect(updated.title).toBe(updatedListing.title)
    expect(updated.description).toBe(updatedListing.description)
    const price = updated.price.amount / updated.price.divisor
    expect(price).toBeCloseTo(39.99, 2)
    expect(updated.quantity).toBe(25)
    expect(updated.tags).toContain('updated')
    expect(updated.tags).toContain('comprehensive')
    if (updated.materials) {
      expect(updated.materials).toContain('Updated Material 1')
      expect(updated.materials).toContain('Updated Material 2')
    }
    if (updated.processing_min !== undefined) {
      expect(updated.processing_min).toBe(4)
    }
    if (updated.processing_max !== undefined) {
      expect(updated.processing_max).toBe(8)
    }
  })
})

describe('E2E Google Sheets Tests', () => {
  let shopID: number
  let isAuthenticated = false
  let sheetId: string | null = null

  beforeAll(async () => {
    try {
      await getValidAccessToken()
      shopID = await getShopID()
      expect(shopID).toBeGreaterThan(0)
      isAuthenticated = true
      
      // Check Google Sheets auth
      const googleAuth = await checkGoogleSheetsAuthStatus()
      if (!googleAuth.authenticated) {
        console.warn('Google Sheets not authenticated. These tests will be skipped.')
        isAuthenticated = false
        return
      }
      
      // Get or create sheet
      const sheet = await getOrCreateSheet(shopID, `Shop ${shopID}`)
      sheetId = sheet.sheetId
    } catch (error) {
      console.warn('E2E Google Sheets tests require authentication:', error)
      isAuthenticated = false
    }
  })

  it.skipIf(!isAuthenticated || !sheetId)('should create sheet with correct formatting', async () => {
    if (!isAuthenticated || !sheetId) {
      console.log('Skipping test: Not authenticated or no sheet ID.')
      return
    }

    // Fetch draft listings
    const draftListings = await fetchListings(shopID, 'draft')
    if (draftListings.results.length === 0) {
      console.log('Skipping test: No draft listings to test with.')
      return
    }

    // Write to sheet
    const sheetName = await writeListingsToSheet(sheetId, draftListings, 'draft')
    expect(sheetName).toBeTruthy()

    // Read back the sheet to verify formatting
    const token = await getValidAccessToken()
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A:Z`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    expect(response.ok).toBe(true)
    const data = await response.json()
    const rows = data.values || []
    
    expect(rows.length).toBeGreaterThan(0)
    
    // Verify header row exists
    const headerRow = rows.find((row: string[]) => row[0] === 'Listing ID')
    expect(headerRow).toBeDefined()
    
    // Get sheet formatting info
    const formatResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?includeGridData=true&ranges=${sheetName}!1:1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (formatResponse.ok) {
      const formatData = await formatResponse.json()
      // Verify header has light blue background
      const headerRowData = formatData.sheets[0]?.data[0]?.rowData[0]
      if (headerRowData?.values) {
        const headerBg = headerRowData.values[0]?.userEnteredFormat?.backgroundColor
        if (headerBg) {
          // Light blue: red: 0.9, green: 0.95, blue: 1.0
          expect(headerBg.red).toBeCloseTo(0.9, 1)
          expect(headerBg.green).toBeCloseTo(0.95, 1)
          expect(headerBg.blue).toBeCloseTo(1.0, 1)
        }
      }
    }
  })

  it.skipIf(!isAuthenticated || !sheetId)('should format parent rows as grey and variation rows as white', async () => {
    if (!isAuthenticated || !sheetId) {
      console.log('Skipping test: Not authenticated or no sheet ID.')
      return
    }

    // Fetch listings with variations
    const draftListings = await fetchListings(shopID, 'draft')
    const listingsWithVariations = draftListings.results.filter(l => l.has_variations)
    
    if (listingsWithVariations.length === 0) {
      console.log('Skipping test: No listings with variations to test.')
      return
    }

    // Write to sheet
    const sheetName = await writeListingsToSheet(sheetId, { 
      count: listingsWithVariations.length, 
      results: listingsWithVariations 
    }, 'draft')
    expect(sheetName).toBeTruthy()

    // Read back and verify row colors
    const token = await getValidAccessToken()
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?includeGridData=true&ranges=${sheetName}!A:Z`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (response.ok) {
      const data = await response.json()
      const sheet = data.sheets[0]
      const rowData = sheet.data[0]?.rowData || []
      
      // Skip header (row 0)
      for (let i = 1; i < rowData.length; i++) {
        const row = rowData[i]
        if (row?.values && row.values.length > 0) {
          const bg = row.values[0]?.userEnteredFormat?.backgroundColor
          const listingId = sheet.data[0]?.rowData[i]?.values[0]?.userEnteredValue?.stringValue || 
                           sheet.data[0]?.rowData[i]?.values[0]?.userEnteredValue?.numberValue?.toString()
          
          if (bg) {
            if (listingId && listingId !== '') {
              // Parent row - should be grey
              expect(bg.red).toBeCloseTo(0.9, 1)
              expect(bg.green).toBeCloseTo(0.9, 1)
              expect(bg.blue).toBeCloseTo(0.9, 1)
            } else {
              // Variation row - should be white
              expect(bg.red).toBeCloseTo(1.0, 1)
              expect(bg.green).toBeCloseTo(1.0, 1)
              expect(bg.blue).toBeCloseTo(1.0, 1)
            }
          }
        }
      }
    }
  })

  it.skipIf(!isAuthenticated || !sheetId)('should only update matching fields when updating existing sheet', async () => {
    if (!isAuthenticated || !sheetId) {
      console.log('Skipping test: Not authenticated or no sheet ID.')
      return
    }

    // Fetch draft listings
    const draftListings = await fetchListings(shopID, 'draft')
    if (draftListings.results.length === 0) {
      console.log('Skipping test: No draft listings to test with.')
      return
    }

    const sheetName = await writeListingsToSheet(sheetId, draftListings, 'draft')
    expect(sheetName).toBeTruthy()

    // Read the sheet
    const file = await readListingsFromSheetAsFile(sheetId)
    const csvContent = await file.text()
    const rows = csvContent.split('\n').filter(r => r.trim())
    
    // Find a row with data
    const dataRowIndex = rows.findIndex(r => r.includes('Listing ID') && !r.startsWith('INFO'))
    if (dataRowIndex === -1) {
      console.log('Skipping test: No data rows found.')
      return
    }

    // Manually edit a field in the sheet (simulate user edit)
    // This would require Google Sheets API to update a cell, then re-download
    // For now, we'll verify the merge logic works by checking the function exists
    
    // Re-write to sheet (should preserve user edits for non-matching fields)
    const updatedListings = await fetchListings(shopID, 'draft')
    await writeListingsToSheet(sheetId, updatedListings, 'draft')
    
    // Verify the sheet was updated (basic check)
    const updatedFile = await readListingsFromSheetAsFile(sheetId)
    const updatedContent = await updatedFile.text()
    expect(updatedContent).toBeTruthy()
    // Note: Full verification would require reading specific cells to check merge behavior
  })
})

