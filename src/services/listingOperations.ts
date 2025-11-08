// Listing operations - create, update, delete, update inventory
// Ported from backend Go code

import { ProcessedListing } from './uploadService'
import { Listing } from './etsyApi'
import { makeEtsyRequest } from './etsyApi'

// Helper to check if tags are equal
function tagsEqual(tags1: string[], tags2: string[]): boolean {
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

// Create a new listing
export async function createListing(
  shopID: number,
  listing: ProcessedListing
): Promise<number> {
  // Validate required fields
  if (listing.title === '') {
    throw new Error('title is required')
  }
  if (listing.description === '') {
    throw new Error('description is required')
  }

  // Build request body
  const requestBody: any = {
    quantity: 1, // Default, will be updated by inventory
    title: listing.title,
    description: listing.description,
    price: 1, // Default, will be updated by inventory
    who_made: 'i_did',
    when_made: '2020_2024',
    state: 'draft',
    // Note: taxonomy_id is typically required but we'll let the API return an error
    // if it's missing, as it varies by shop/category
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
    requestBody.title = listing.title
    needsUpdate = true
  }
  if (
    existingListing === null ||
    existingListing.description !== listing.description
  ) {
    requestBody.description = listing.description
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

  if (listing.hasVariations) {
    requestBody.has_variations = true
    needsUpdate = true
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

// Update listing inventory
// IMPORTANT: Etsy requires the COMPLETE product array when updating inventory.
// We must include all existing products plus any new/updated ones from the CSV.
export async function updateListingInventory(
  listingID: number,
  listing: ProcessedListing,
  existingListing: Listing | null
): Promise<void> {
  // Build inventory request
  const inventoryBody: any = {
    products: [],
    price_on_property: [],
    quantity_on_property: [],
    sku_on_property: [],
  }

  if (!listing.hasVariations) {
    // No variations - single product
    const offering: any = {
      price: 0, // Default price as float (inventory endpoint expects float)
      quantity: 0,
      is_enabled: true,
    }

    // Get readiness_state_id from existing listing if available
    if (existingListing !== null && 
        existingListing.inventory.products.length > 0 && 
        existingListing.inventory.products[0].offerings.length > 0) {
      const existingOffering = existingListing.inventory.products[0].offerings.find((o: any) => !o.is_deleted)
      if (existingOffering && existingOffering.readiness_state_id) {
        offering.readiness_state_id = existingOffering.readiness_state_id
      }
    }

    if (listing.price !== null) {
      // Inventory endpoint expects price as a float (e.g., 45.99)
      offering.price = listing.price
    }
    if (listing.quantity !== null) {
      offering.quantity = listing.quantity
    }

    const product: any = {
      sku: listing.sku,
      property_values: [],
      offerings: [offering],
    }

    // Note: Etsy's inventory update API does NOT accept product_id in the products array
    // For non-variation listings, the single product is identified by the listing ID in the URL

    inventoryBody.products = [product]
  } else {
    // Has variations
    // IMPORTANT: Etsy requires the COMPLETE product array. We must include:
    // 1. All existing products (from existingListing)
    // 2. Updated/new products from CSV
    // 3. Products marked for deletion
    
    const products: any[] = []
    const propertyIDSet = new Set<number>()

    // Track per-property whether they have price/quantity/SKU
    const propertyPriceMap = new Map<number, boolean>()
    const propertyQuantityMap = new Map<number, boolean>()
    const propertySKUMap = new Map<number, boolean>()

    // Create a map of CSV variations by their property_values signature for matching
    const csvVariationsBySignature = new Map<string, typeof listing.variations[0]>()
    const csvProductIDsToDelete = new Set<number>()

    // First pass: collect all variations from CSV and track property-level fields
    for (const variation of listing.variations) {
      if (variation.toDelete) {
        // For deleted variations, include them with is_deleted flag
        if (variation.productID > 0) {
          // Existing variation to delete
          csvProductIDsToDelete.add(variation.productID)
          products.push({
            product_id: variation.productID,
            is_deleted: true,
            sku: '',
            property_values: [],
            offerings: [],
          })
        }
        // If ProductID is 0, it's a new variation marked for deletion, skip it
        continue
      }

      const propertyValues: any[] = []
      if (variation.propertyName1 !== '' && variation.propertyID1 > 0) {
        propertyIDSet.add(variation.propertyID1)
        // Ensure value_ids and values arrays are not empty
        if (variation.propertyOptionIDs1.length > 0 && variation.propertyOption1 !== '') {
          propertyValues.push({
            property_id: variation.propertyID1,
            property_name: variation.propertyName1, // Include property_name
            value_ids: variation.propertyOptionIDs1,
            values: [variation.propertyOption1],
          })
        }

        // Track if this property has price/quantity/SKU
        if (variation.propertyPrice !== null) {
          propertyPriceMap.set(variation.propertyID1, true)
        }
        if (variation.propertyQuantity !== null) {
          propertyQuantityMap.set(variation.propertyID1, true)
        }
        if (variation.propertySKU !== '' && variation.propertySKU !== 'DELETE') {
          propertySKUMap.set(variation.propertyID1, true)
        }
      }
      if (variation.propertyName2 !== '' && variation.propertyID2 > 0) {
        propertyIDSet.add(variation.propertyID2)
        // Ensure value_ids and values arrays are not empty
        if (variation.propertyOptionIDs2.length > 0 && variation.propertyOption2 !== '') {
          propertyValues.push({
            property_id: variation.propertyID2,
            property_name: variation.propertyName2, // Include property_name
            value_ids: variation.propertyOptionIDs2,
            values: [variation.propertyOption2],
          })
        }

        // Track if this property has price/quantity/SKU
        if (variation.propertyPrice !== null) {
          propertyPriceMap.set(variation.propertyID2, true)
        }
        if (variation.propertyQuantity !== null) {
          propertyQuantityMap.set(variation.propertyID2, true)
        }
        if (variation.propertySKU !== '' && variation.propertySKU !== 'DELETE') {
          propertySKUMap.set(variation.propertyID2, true)
        }
      }

      const offering: any = {
        price: 0, // Default price as float (inventory endpoint expects float)
        quantity: 0,
        is_enabled: variation.propertyIsEnabled,
      }

      // Get readiness_state_id from existing product if updating, or from first existing offering
      if (existingListing !== null && existingListing.inventory.products.length > 0) {
        // Try to find existing product with same property_values to get readiness_state_id
        const existingProduct = existingListing.inventory.products.find((p: any) => {
          if (p.is_deleted || !p.property_values || p.property_values.length === 0) return false
          // Match by property_values signature
          const existingSig = JSON.stringify(
            p.property_values.map((pv: any) => ({ property_id: pv.property_id, value_ids: (pv.value_ids || []).sort() }))
              .sort((a: any, b: any) => a.property_id - b.property_id)
          )
          const csvSig = JSON.stringify(propertyValues.map(pv => ({
            property_id: pv.property_id,
            value_ids: (pv.value_ids || []).sort()
          })).sort((a, b) => a.property_id - b.property_id))
          return existingSig === csvSig
        })
        
        if (existingProduct) {
          const existingOffering = existingProduct.offerings.find((o: any) => !o.is_deleted)
          if (existingOffering && existingOffering.readiness_state_id) {
            offering.readiness_state_id = existingOffering.readiness_state_id
          }
        } else {
          // Fallback: use first existing offering's readiness_state_id
          const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
          if (firstProduct && firstProduct.offerings.length > 0) {
            const firstOffering = firstProduct.offerings.find((o: any) => !o.is_deleted)
            if (firstOffering && firstOffering.readiness_state_id) {
              offering.readiness_state_id = firstOffering.readiness_state_id
            }
          }
        }
      }

      // Set price/quantity if provided
      if (variation.propertyPrice !== null) {
        // Inventory endpoint expects price as a float (e.g., 45.99)
        offering.price = variation.propertyPrice
      }
      if (variation.propertyQuantity !== null) {
        offering.quantity = variation.propertyQuantity
      }

      // For variation-based listings, only include products that have at least one property value
      // Products without property_values are invalid for variation listings
      if (propertyValues.length === 0) {
        // Skip variations without property values (unless they're being deleted, which is handled above)
        continue
      }

      const product: any = {
        sku: variation.propertySKU,
        property_values: propertyValues,
        offerings: [offering],
      }

      // Note: Etsy's inventory update API does NOT accept product_id in the products array
      // Products are matched by their property_values instead
      // product_id is only used for deletion (handled above with is_deleted flag)

      products.push(product)

      // Store this variation for matching against existing products
      // Create a signature from property_values for matching
      const signature = JSON.stringify(propertyValues.map(pv => ({
        property_id: pv.property_id,
        value_ids: pv.value_ids.sort()
      })).sort((a, b) => a.property_id - b.property_id))
      csvVariationsBySignature.set(signature, variation)
    }

    // Second pass: Include existing products that aren't in the CSV (they remain unchanged)
    // This ensures we send the COMPLETE product array as required by Etsy API
    if (existingListing !== null && existingListing.inventory.products) {
      for (const existingProduct of existingListing.inventory.products) {
        // Skip products already marked for deletion
        if (existingProduct.is_deleted) {
          continue
        }

        // Skip if this product is marked for deletion in CSV
        if (existingProduct.product_id && csvProductIDsToDelete.has(existingProduct.product_id)) {
          continue
        }

        // Create signature for this existing product
        const existingSignature = JSON.stringify(
          (existingProduct.property_values || [])
            .map((pv: any) => ({
              property_id: pv.property_id,
              value_ids: (pv.value_ids || []).sort()
            }))
            .sort((a: any, b: any) => a.property_id - b.property_id)
        )

        // If this product is in the CSV, we've already added it above, so skip
        if (csvVariationsBySignature.has(existingSignature)) {
          continue
        }

        // This is an existing product not in the CSV - include it unchanged
        // Convert existing product to API format (without product_id)
        // IMPORTANT: Include property_id, property_name, value_ids, and values
        // Also ensure value_ids and values are not empty (Etsy requires at least one value)
        const existingProductForAPI: any = {
          sku: existingProduct.sku || '',
          property_values: (existingProduct.property_values || [])
            .filter((pv: any) => {
              // Only include property_values that have property_id, property_name, and at least one value
              return pv.property_id && 
                     pv.property_name && // property_name is required
                     Array.isArray(pv.value_ids) && pv.value_ids.length > 0 &&
                     Array.isArray(pv.values) && pv.values.length > 0
            })
            .map((pv: any) => {
              // Include all required fields including property_name
              return {
                property_id: pv.property_id,
                property_name: pv.property_name, // Include property_name
                value_ids: pv.value_ids,
                values: pv.values
              }
            }),
          offerings: (existingProduct.offerings || []).map((off: any) => {
            // Convert price to float format (inventory endpoint expects float)
            let priceFloat = 0
            if (off.price) {
              if (typeof off.price === 'object' && off.price.amount !== undefined) {
                // Price is {amount: number, divisor: number} - convert to float
                priceFloat = off.price.amount / (off.price.divisor || 1)
              } else if (typeof off.price === 'number') {
                // Price is already a number - use as-is (should already be in dollars)
                priceFloat = off.price
              }
            }
            return {
              price: priceFloat,
              quantity: off.quantity || 0,
              is_enabled: off.is_enabled !== false,
              readiness_state_id: off.readiness_state_id || undefined
            }
          })
        }

        products.push(existingProductForAPI)

        // Track properties from existing products too
        for (const pv of existingProduct.property_values || []) {
          propertyIDSet.add(pv.property_id)
          // Check if this property has price/quantity/SKU in existing product
          if (existingListing.inventory.price_on_property?.includes(pv.property_id)) {
            propertyPriceMap.set(pv.property_id, true)
          }
          if (existingListing.inventory.quantity_on_property?.includes(pv.property_id)) {
            propertyQuantityMap.set(pv.property_id, true)
          }
          if (existingListing.inventory.sku_on_property?.includes(pv.property_id)) {
            propertySKUMap.set(pv.property_id, true)
          }
        }
      }
    }

    // Ensure we have at least one product (required by API)
    if (products.length === 0) {
      throw new Error('cannot update inventory: at least one product is required')
    }

    // Build property arrays - include properties from both CSV and existing listing
    // Start with existing listing's property arrays (if available) to preserve configuration
    const pricePropertyIDs = existingListing?.inventory?.price_on_property 
      ? [...existingListing.inventory.price_on_property] 
      : []
    const quantityPropertyIDs = existingListing?.inventory?.quantity_on_property 
      ? [...existingListing.inventory.quantity_on_property] 
      : []
    const skuPropertyIDs = existingListing?.inventory?.sku_on_property 
      ? [...existingListing.inventory.sku_on_property] 
      : []

    // Add properties from CSV that have price/quantity/SKU
    for (const pid of propertyIDSet) {
      if (propertyPriceMap.get(pid) && !pricePropertyIDs.includes(pid)) {
        pricePropertyIDs.push(pid)
      }
      if (propertyQuantityMap.get(pid) && !quantityPropertyIDs.includes(pid)) {
        quantityPropertyIDs.push(pid)
      }
      if (propertySKUMap.get(pid) && !skuPropertyIDs.includes(pid)) {
        skuPropertyIDs.push(pid)
      }
    }

    // Sort arrays for consistency
    pricePropertyIDs.sort((a, b) => a - b)
    quantityPropertyIDs.sort((a, b) => a - b)
    skuPropertyIDs.sort((a, b) => a - b)

    // Set property arrays (even if empty, as they may be required)
    inventoryBody.price_on_property = pricePropertyIDs
    inventoryBody.quantity_on_property = quantityPropertyIDs
    inventoryBody.sku_on_property = skuPropertyIDs

    inventoryBody.products = products
  }

  await makeEtsyRequest(
    'PUT',
    `/application/listings/${listingID}/inventory`,
    inventoryBody
  )
}

