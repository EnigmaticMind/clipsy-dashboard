// Update listing inventory operations
// IMPORTANT: Etsy requires the COMPLETE product array when updating inventory.
// We must include all existing products plus any new/updated ones from the CSV.

import { ProcessedListing } from '../uploadService'
import { Listing, makeEtsyRequest } from '../etsyApi'
import { logger } from '../../utils/logger'
import { getValidPrice, getExistingOfferingPrice } from './helpers'

export async function updateListingInventory(
  listingID: number,
  listing: ProcessedListing,
  existingListing: Listing | null,
  defaultReadinessStateID?: number,
  shopID?: number // Optional shop ID to search other listings for property values
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
    // If converting from variations, we need to include all existing products marked as deleted
    if (existingListing?.has_variations && existingListing.inventory.products.length > 0) {
      // Include all existing products marked for deletion
      for (const existingProduct of existingListing.inventory.products) {
        if (!existingProduct.is_deleted) {
          inventoryBody.products.push({
            product_id: existingProduct.product_id,
            is_deleted: true,
            sku: existingProduct.sku,
            property_values: existingProduct.property_values,
            offerings: existingProduct.offerings.map((o: any) => ({
              ...o,
              is_deleted: true
            })),
          })
        }
      }
    }
    
    const existingPrice = getExistingOfferingPrice(existingListing)
    const validPrice = getValidPrice(listing.price, existingPrice)
    
    const offering: any = {
      price: validPrice, // Use validated price that meets Etsy minimum
      quantity: 0,
      is_enabled: true,
    }

    // Get readiness_state_id from existing listing if available, otherwise use default
    if (existingListing !== null && 
        existingListing.inventory.products.length > 0 && 
        existingListing.inventory.products[0].offerings.length > 0) {
      const existingOffering = existingListing.inventory.products[0].offerings.find((o: any) => !o.is_deleted)
      if (existingOffering && existingOffering.readiness_state_id) {
        offering.readiness_state_id = existingOffering.readiness_state_id
      } else if (defaultReadinessStateID) {
        offering.readiness_state_id = defaultReadinessStateID
      }
    } else if (defaultReadinessStateID) {
      // New listing - use default readiness_state_id
      offering.readiness_state_id = defaultReadinessStateID
    } else {
      logger.warn('No readiness_state_id available for new listing. This may cause an error.')
    }

    // Price is already set above with validation
    if (listing.quantity !== null) {
      offering.quantity = listing.quantity
    } else {
      // Etsy requires at least one offering to have quantity > 0
      // Default to 1 if quantity is not specified
      offering.quantity = 1
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

    // Determine canonical property order from existing listing (if available)
    // Etsy requires all products to have properties in the same order
    let canonicalPropertyOrder: number[] = []
    if (existingListing !== null && existingListing.inventory.products.length > 0) {
      // Get property order from first existing product
      const firstExistingProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
      if (firstExistingProduct && firstExistingProduct.property_values) {
        canonicalPropertyOrder = firstExistingProduct.property_values.map((pv: any) => pv.property_id)
        logger.log(`Using canonical property order from existing listing: ${canonicalPropertyOrder.join(', ')}`)
      }
    }

    // Helper function to sort property_values to match canonical order
    function sortPropertyValues(propertyValues: any[]): any[] {
      if (canonicalPropertyOrder.length === 0) {
        // No canonical order - sort by property_id
        return propertyValues.sort((a, b) => a.property_id - b.property_id)
      }
      
      // Sort by canonical order
      return propertyValues.sort((a, b) => {
        const indexA = canonicalPropertyOrder.indexOf(a.property_id)
        const indexB = canonicalPropertyOrder.indexOf(b.property_id)
        
        // If property not in canonical order, put it at the end
        if (indexA === -1 && indexB === -1) return a.property_id - b.property_id
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        
        return indexA - indexB
      })
    }

    // Helper function to resolve property IDs and value IDs from property names/options
    // when they're missing (for new variations)
    // This function will search the current listing first, then optionally search other listings in the shop
    async function resolvePropertyIDs(
      propertyName: string,
      propertyOption: string,
      propertyID: number,
      propertyOptionIDs: number[],
      existingListing: Listing | null,
      searchOtherListings: boolean = false
    ): Promise<{ propertyID: number; valueIDs: number[]; hasValueIDs: boolean } | null> {
      // If we already have IDs, return them
      if (propertyID > 0 && propertyOptionIDs.length > 0) {
        return { propertyID, valueIDs: propertyOptionIDs, hasValueIDs: true }
      }

      // If we don't have property name/option, can't resolve
      if (!propertyName || !propertyOption || !existingListing) {
        return null
      }

      let foundPropertyID: number | null = null
      let foundValueIDs: number[] = []

      // Look through existing products to find matching property
      for (const product of existingListing.inventory.products || []) {
        if (product.is_deleted || !product.property_values) continue
        
        for (const pv of product.property_values) {
          // Match by property name (case-insensitive)
          if (pv.property_name && pv.property_name.toLowerCase() === propertyName.toLowerCase()) {
            // Found matching property
            if (!foundPropertyID) {
              foundPropertyID = pv.property_id
            }
            
            // Try to find matching value
            if (pv.values && pv.value_ids) {
              const valueIndex = pv.values.findIndex(
                v => v && v.toLowerCase() === propertyOption.toLowerCase()
              )
              if (valueIndex >= 0 && valueIndex < pv.value_ids.length) {
                foundValueIDs.push(pv.value_ids[valueIndex])
              }
            }
          }
        }
      }

      // If we found the property ID but not the value ID, search other listings if enabled
      if (foundPropertyID && foundValueIDs.length === 0 && searchOtherListings && shopID) {
        try {
          logger.log(`Searching other listings in shop ${shopID} for property "${propertyName}" value "${propertyOption}"...`)
          // Fetch a few listings with variations to search (try multiple states)
          // Etsy API doesn't accept comma-separated states, so we'll try each state separately
          let searchData: any = { results: [] }
          
          for (const state of ['active', 'draft', 'inactive']) {
            try {
              const searchResponse = await makeEtsyRequest(
                'GET',
                `/application/shops/${shopID}/listings?limit=20&includes=Inventory&state=${state}`
              )
              const stateData = await searchResponse.json()
              if (stateData.results && Array.isArray(stateData.results)) {
                searchData.results.push(...stateData.results)
                // Stop if we've found enough listings
                if (searchData.results.length >= 20) {
                  searchData.results = searchData.results.slice(0, 20)
                  break
                }
              }
            } catch (error) {
              // Continue to next state if one fails
              logger.warn(`Error fetching listings with state ${state}:`, error)
            }
          }
          
          if (searchData.results && Array.isArray(searchData.results)) {
            for (const otherListing of searchData.results) {
              // Skip the current listing
              if (otherListing.listing_id === listingID) continue
              
              if (!otherListing.has_variations || !otherListing.inventory?.products) continue
              
              for (const product of otherListing.inventory.products) {
                if (product.is_deleted || !product.property_values) continue
                
                for (const pv of product.property_values) {
                  // Match by property name and property ID
                  if (pv.property_name && 
                      pv.property_name.toLowerCase() === propertyName.toLowerCase() &&
                      pv.property_id === foundPropertyID) {
                    // Try to find matching value
                    if (pv.values && pv.value_ids) {
                      const valueIndex = pv.values.findIndex(
                        (v: string) => v && v.toLowerCase() === propertyOption.toLowerCase()
                      )
                      if (valueIndex >= 0 && valueIndex < pv.value_ids.length) {
                        foundValueIDs.push(pv.value_ids[valueIndex])
                        logger.log(`Found value ID ${pv.value_ids[valueIndex]} for "${propertyOption}" in listing ${otherListing.listing_id}`)
                        break // Found it, no need to continue searching
                      }
                    }
                  }
                }
                if (foundValueIDs.length > 0) break // Found it, exit product loop
              }
              if (foundValueIDs.length > 0) break // Found it, exit listing loop
            }
          }
        } catch (error) {
          logger.warn(`Error searching other listings for property value:`, error)
          // Continue without value IDs - will fail later but at least we tried
        }
      }

      // If we found the property ID but not the value ID, we'll still try to create the variation
      // We'll use an empty value_ids array and let Etsy's API validate it
      // This allows users to create new property values that don't exist in the shop yet
      if (foundPropertyID && foundValueIDs.length === 0) {
        logger.log(`Could not resolve value ID for property "${propertyName}" option "${propertyOption}". Will attempt to create variation with property_id and values text only. Etsy may reject this if the value doesn't exist in their taxonomy.`)
        return {
          propertyID: foundPropertyID,
          valueIDs: [], // Empty array - we'll try without value_ids
          hasValueIDs: false
        }
      }

      if (foundPropertyID && foundValueIDs.length > 0) {
        // Remove duplicates from valueIDs
        const uniqueValueIDs = Array.from(new Set(foundValueIDs))
        return {
          propertyID: foundPropertyID,
          valueIDs: uniqueValueIDs,
          hasValueIDs: true
        }
      }

      return null
    }

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

      // Resolve property IDs if missing (for new variations)
      let resolvedProp1 = { propertyID: variation.propertyID1, valueIDs: variation.propertyOptionIDs1, hasValueIDs: variation.propertyOptionIDs1.length > 0 }
      if (variation.propertyID1 === 0 && variation.propertyName1 !== '' && variation.propertyOption1 !== '') {
        const resolved = await resolvePropertyIDs(
          variation.propertyName1,
          variation.propertyOption1,
          variation.propertyID1,
          variation.propertyOptionIDs1,
          existingListing,
          true // Search other listings if not found
        )
        if (resolved) {
          resolvedProp1 = resolved
          if (resolved.hasValueIDs) {
            logger.log(`Resolved property 1: ${variation.propertyName1}/${variation.propertyOption1} -> ID ${resolved.propertyID}, value IDs ${resolved.valueIDs.join(',')}`)
          }
        }
      }

      let resolvedProp2 = { propertyID: variation.propertyID2, valueIDs: variation.propertyOptionIDs2, hasValueIDs: variation.propertyOptionIDs2.length > 0 }
      if (variation.propertyID2 === 0 && variation.propertyName2 !== '' && variation.propertyOption2 !== '') {
        const resolved = await resolvePropertyIDs(
          variation.propertyName2,
          variation.propertyOption2,
          variation.propertyID2,
          variation.propertyOptionIDs2,
          existingListing,
          true // Search other listings if not found
        )
        if (resolved) {
          resolvedProp2 = resolved
          if (resolved.hasValueIDs) {
            logger.log(`Resolved property 2: ${variation.propertyName2}/${variation.propertyOption2} -> ID ${resolved.propertyID}, value IDs ${resolved.valueIDs.join(',')}`)
          }
        }
      }

      // Build property values - but don't add them in order yet
      // We'll add them in canonical order after building both
      // Try to create property data even if value_ids are empty - let Etsy validate it
      const prop1Data = variation.propertyName1 !== '' && resolvedProp1.propertyID > 0 && variation.propertyOption1 !== ''
        ? {
          property_id: resolvedProp1.propertyID,
          property_name: variation.propertyName1,
          value_ids: resolvedProp1.valueIDs, // May be empty - we'll try anyway
          values: [variation.propertyOption1],
        }
        : null

      const prop2Data = variation.propertyName2 !== '' && resolvedProp2.propertyID > 0 && variation.propertyOption2 !== ''
        ? {
          property_id: resolvedProp2.propertyID,
          property_name: variation.propertyName2,
          value_ids: resolvedProp2.valueIDs, // May be empty - we'll try anyway
          values: [variation.propertyOption2],
        }
        : null

      // Track property IDs and price/quantity/SKU settings
      if (prop1Data) {
        propertyIDSet.add(resolvedProp1.propertyID)
        if (variation.propertyPrice !== null) {
          propertyPriceMap.set(resolvedProp1.propertyID, true)
        }
        if (variation.propertyQuantity !== null) {
          propertyQuantityMap.set(resolvedProp1.propertyID, true)
        }
        if (variation.propertySKU !== '' && variation.propertySKU !== 'DELETE') {
          propertySKUMap.set(resolvedProp1.propertyID, true)
        }
      }

      if (prop2Data) {
        propertyIDSet.add(resolvedProp2.propertyID)
        if (variation.propertyPrice !== null) {
          propertyPriceMap.set(resolvedProp2.propertyID, true)
        }
        if (variation.propertyQuantity !== null) {
          propertyQuantityMap.set(resolvedProp2.propertyID, true)
        }
        if (variation.propertySKU !== '' && variation.propertySKU !== 'DELETE') {
          propertySKUMap.set(resolvedProp2.propertyID, true)
        }
      }

      // Build property values array - add in canonical order if available, otherwise add in CSV order
      const propertyValues: any[] = []
      if (canonicalPropertyOrder.length > 0) {
        // Add properties in canonical order
        for (const propID of canonicalPropertyOrder) {
          if (prop1Data && prop1Data.property_id === propID) {
            propertyValues.push(prop1Data)
          } else if (prop2Data && prop2Data.property_id === propID) {
            propertyValues.push(prop2Data)
          }
        }
        // Add any properties not in canonical order at the end
        if (prop1Data && !canonicalPropertyOrder.includes(prop1Data.property_id)) {
          propertyValues.push(prop1Data)
        }
        if (prop2Data && !canonicalPropertyOrder.includes(prop2Data.property_id)) {
          propertyValues.push(prop2Data)
        }
      } else {
        // No canonical order - add in CSV order (property1, then property2)
        if (prop1Data) {
          propertyValues.push(prop1Data)
        }
        if (prop2Data) {
          propertyValues.push(prop2Data)
        }
      }

      const offering: any = {
        price: 0, // Default price as float (inventory endpoint expects float)
        quantity: 0,
        is_enabled: true, // Always enabled
      }

      // Get readiness_state_id from existing product if updating, or from first existing offering, or use default
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
          } else if (defaultReadinessStateID) {
            offering.readiness_state_id = defaultReadinessStateID
          }
        } else {
          // Fallback: use first existing offering's readiness_state_id
          const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
          if (firstProduct && firstProduct.offerings.length > 0) {
            const firstOffering = firstProduct.offerings.find((o: any) => !o.is_deleted)
            if (firstOffering && firstOffering.readiness_state_id) {
              offering.readiness_state_id = firstOffering.readiness_state_id
            } else if (defaultReadinessStateID) {
              offering.readiness_state_id = defaultReadinessStateID
            }
          } else if (defaultReadinessStateID) {
            offering.readiness_state_id = defaultReadinessStateID
          }
        }
      } else if (defaultReadinessStateID) {
        // New listing - use default readiness_state_id
        offering.readiness_state_id = defaultReadinessStateID
      } else {
        logger.warn('No readiness_state_id available for new variation. This may cause an error.')
      }

      // Set price/quantity if provided
      if (variation.propertyPrice !== null) {
        // Inventory endpoint expects price as a float (e.g., 45.99)
        offering.price = variation.propertyPrice
      }
      if (variation.propertyQuantity !== null) {
        offering.quantity = variation.propertyQuantity
      } else {
        // Etsy requires at least one offering to have quantity > 0
        // For new variations, default to 1 if quantity is not specified
        // We'll check later if any variation has quantity > 0
        offering.quantity = 1
      }

      // For variation-based listings, only include products that have at least one property value
      // Products without property_values are invalid for variation listings
      if (propertyValues.length === 0) {
        // Skip variations without property values (unless they're being deleted, which is handled above)
        logger.warn(`Skipping variation "${variation.propertyOption1 || 'N/A'}" - no valid property values found. Property IDs: ${resolvedProp1.propertyID}, ${resolvedProp2.propertyID}`)
        continue
      }
      
      // Validate that we have required property data
      if (propertyValues.some(pv => !pv.property_id)) {
        logger.warn(`Skipping variation "${variation.propertyOption1 || 'N/A'}" - missing property_id`)
        continue
      }
      
      // Warn if we're creating a variation without value_ids, but still try it
      // Etsy may accept it if the property value exists in their taxonomy
      if (propertyValues.some(pv => !pv.value_ids || pv.value_ids.length === 0)) {
        logger.log(`Creating variation "${variation.propertyOption1 || 'N/A'}" without value_ids. Etsy will validate if this property value exists in their taxonomy.`)
      }

      // Property values are already in canonical order (or CSV order if no canonical order exists)
      // Use them as-is - sortPropertyValues is a safeguard but shouldn't be needed
      const sortedPropertyValues = sortPropertyValues(propertyValues)

      const product: any = {
        sku: variation.propertySKU,
        property_values: sortedPropertyValues,
        offerings: [offering],
      }

      // Note: Etsy's inventory update API does NOT accept product_id in the products array
      // Products are matched by their property_values instead
      // product_id is only used for deletion (handled above with is_deleted flag)

      products.push(product)

      // Store this variation for matching against existing products
      // Create a signature from property_values for matching (use sorted order)
      const signature = JSON.stringify(sortedPropertyValues.map(pv => ({
        property_id: pv.property_id,
        value_ids: pv.value_ids.sort()
      })))
      csvVariationsBySignature.set(signature, variation)
    }
    
    // Third pass: Generate missing combinations for new property values
    // When a new property value is added (e.g., "3XL"), create all combinations with existing property values
    // Mark combinations not explicitly in CSV as is_enabled: false
    if (existingListing !== null && existingListing.inventory.products.length > 0 && canonicalPropertyOrder.length > 0) {
      // Collect all unique property values from existing listing for each property
      const existingPropertyValues = new Map<number, Map<number, { valueID: number; value: string }>>()
      
      for (const product of existingListing.inventory.products) {
        if (product.is_deleted || !product.property_values) continue
        
        for (const pv of product.property_values) {
          if (!existingPropertyValues.has(pv.property_id)) {
            existingPropertyValues.set(pv.property_id, new Map())
          }
          const valueMap = existingPropertyValues.get(pv.property_id)!
          
          if (pv.value_ids && pv.values) {
            for (let i = 0; i < Math.min(pv.value_ids.length, pv.values.length); i++) {
              if (!valueMap.has(pv.value_ids[i])) {
                valueMap.set(pv.value_ids[i], {
                  valueID: pv.value_ids[i],
                  value: pv.values[i]
                })
              }
            }
          }
        }
      }
      
      // Collect new property values from CSV (values that don't exist in existing listing)
      // Track both value IDs (when found) and value text (when value ID not found)
      const newPropertyValues = new Map<number, Set<number>>() // property_id -> Set of value_ids
      const newPropertyValuesByText = new Map<number, Map<string, string>>() // property_id -> Map of value_text -> property_option_text
      
      // Also need to resolve property IDs for variations that might not have been resolved yet
      for (const variation of listing.variations) {
        if (variation.toDelete) continue
        
        // Check property 1 - need to resolve if missing
        let prop1ID = variation.propertyID1
        let prop1ValueIDs = variation.propertyOptionIDs1
        
        if (prop1ID === 0 && variation.propertyName1 !== '' && variation.propertyOption1 !== '') {
          // Try to resolve from existing listing
          for (const product of existingListing.inventory.products || []) {
            if (product.is_deleted || !product.property_values) continue
            for (const pv of product.property_values) {
              if (pv.property_name && pv.property_name.toLowerCase() === variation.propertyName1.toLowerCase()) {
                prop1ID = pv.property_id
                break
              }
            }
            if (prop1ID > 0) break
          }
          
          // If still not found, try to get value ID from other listings
          if (prop1ID > 0 && prop1ValueIDs.length === 0 && shopID) {
            const resolved = await resolvePropertyIDs(
              variation.propertyName1,
              variation.propertyOption1,
              prop1ID,
              prop1ValueIDs,
              existingListing,
              true
            )
            if (resolved) {
              if (resolved.hasValueIDs) {
                prop1ValueIDs = resolved.valueIDs
              } else {
                // Property ID found but value ID not found - track by text
                if (!newPropertyValuesByText.has(prop1ID)) {
                  newPropertyValuesByText.set(prop1ID, new Map())
                }
                newPropertyValuesByText.get(prop1ID)!.set(variation.propertyOption1.toLowerCase(), variation.propertyOption1)
              }
            }
          }
        }
        
        // Check if this is a new property value (by value ID or by text)
        if (prop1ID > 0) {
          const existingValues = existingPropertyValues.get(prop1ID)
          
          if (prop1ValueIDs.length > 0) {
            // Check by value ID
            if (existingValues) {
              for (const valueID of prop1ValueIDs) {
                if (!existingValues.has(valueID)) {
                  if (!newPropertyValues.has(prop1ID)) {
                    newPropertyValues.set(prop1ID, new Set())
                  }
                  newPropertyValues.get(prop1ID)!.add(valueID)
                }
              }
            } else {
              // Property doesn't exist in existing listing - all values are new
              if (!newPropertyValues.has(prop1ID)) {
                newPropertyValues.set(prop1ID, new Set())
              }
              for (const valueID of prop1ValueIDs) {
                newPropertyValues.get(prop1ID)!.add(valueID)
              }
            }
          } else if (variation.propertyOption1 !== '') {
            // No value ID found - check by text if it's a new value
            if (existingValues) {
              // Check if this value text exists in existing values
              const valueTextExists = Array.from(existingValues.values()).some(
                v => v.value.toLowerCase() === variation.propertyOption1.toLowerCase()
              )
              if (!valueTextExists) {
                if (!newPropertyValuesByText.has(prop1ID)) {
                  newPropertyValuesByText.set(prop1ID, new Map())
                }
                newPropertyValuesByText.get(prop1ID)!.set(variation.propertyOption1.toLowerCase(), variation.propertyOption1)
              }
            } else {
              // Property doesn't exist - all values are new
              if (!newPropertyValuesByText.has(prop1ID)) {
                newPropertyValuesByText.set(prop1ID, new Map())
              }
              newPropertyValuesByText.get(prop1ID)!.set(variation.propertyOption1.toLowerCase(), variation.propertyOption1)
            }
          }
        }
        
        // Check property 2 - need to resolve if missing
        let prop2ID = variation.propertyID2
        let prop2ValueIDs = variation.propertyOptionIDs2
        
        if (prop2ID === 0 && variation.propertyName2 !== '' && variation.propertyOption2 !== '') {
          // Try to resolve from existing listing
          for (const product of existingListing.inventory.products || []) {
            if (product.is_deleted || !product.property_values) continue
            for (const pv of product.property_values) {
              if (pv.property_name && pv.property_name.toLowerCase() === variation.propertyName2.toLowerCase()) {
                prop2ID = pv.property_id
                break
              }
            }
            if (prop2ID > 0) break
          }
          
          // If still not found, try to get value ID from other listings
          if (prop2ID > 0 && prop2ValueIDs.length === 0 && shopID) {
            const resolved = await resolvePropertyIDs(
              variation.propertyName2,
              variation.propertyOption2,
              prop2ID,
              prop2ValueIDs,
              existingListing,
              true
            )
            if (resolved) {
              if (resolved.hasValueIDs) {
                prop2ValueIDs = resolved.valueIDs
              } else {
                // Property ID found but value ID not found - track by text
                if (!newPropertyValuesByText.has(prop2ID)) {
                  newPropertyValuesByText.set(prop2ID, new Map())
                }
                newPropertyValuesByText.get(prop2ID)!.set(variation.propertyOption2.toLowerCase(), variation.propertyOption2)
              }
            }
          }
        }
        
        // Check if this is a new property value (by value ID or by text)
        if (prop2ID > 0) {
          const existingValues = existingPropertyValues.get(prop2ID)
          
          if (prop2ValueIDs.length > 0) {
            // Check by value ID
            if (existingValues) {
              for (const valueID of prop2ValueIDs) {
                if (!existingValues.has(valueID)) {
                  if (!newPropertyValues.has(prop2ID)) {
                    newPropertyValues.set(prop2ID, new Set())
                  }
                  newPropertyValues.get(prop2ID)!.add(valueID)
                }
              }
            } else {
              // Property doesn't exist in existing listing - all values are new
              if (!newPropertyValues.has(prop2ID)) {
                newPropertyValues.set(prop2ID, new Set())
              }
              for (const valueID of prop2ValueIDs) {
                newPropertyValues.get(prop2ID)!.add(valueID)
              }
            }
          } else if (variation.propertyOption2 !== '') {
            // No value ID found - check by text if it's a new value
            if (existingValues) {
              // Check if this value text exists in existing values
              const valueTextExists = Array.from(existingValues.values()).some(
                v => v.value.toLowerCase() === variation.propertyOption2.toLowerCase()
              )
              if (!valueTextExists) {
                if (!newPropertyValuesByText.has(prop2ID)) {
                  newPropertyValuesByText.set(prop2ID, new Map())
                }
                newPropertyValuesByText.get(prop2ID)!.set(variation.propertyOption2.toLowerCase(), variation.propertyOption2)
              }
            } else {
              // Property doesn't exist - all values are new
              if (!newPropertyValuesByText.has(prop2ID)) {
                newPropertyValuesByText.set(prop2ID, new Map())
              }
              newPropertyValuesByText.get(prop2ID)!.set(variation.propertyOption2.toLowerCase(), variation.propertyOption2)
            }
          }
        }
      }
      
      // If we have new property values (by ID or by text), generate all missing combinations
      // According to Etsy's rules: "All combinations of property values must be supplied"
      // Reference: https://help.nembol.com/troubleshooting/errors-with-listings/etsy-property-values-must-be-supplied/
      if (newPropertyValues.size > 0 || newPropertyValuesByText.size > 0) {
        logger.log(`Detected new property values. Generating all combinations (Etsy requires all combinations to be supplied)...`)
        
        // Get all property IDs in canonical order
        const propIDs = canonicalPropertyOrder.length > 0 
          ? canonicalPropertyOrder 
          : Array.from(existingPropertyValues.keys())
        
        // Generate all combinations
        const allCombinations: Array<Array<{ property_id: number; value_id: number | null; value: string }>> = []
        
        function generateCombinations(
          current: Array<{ property_id: number; value_id: number | null; value: string }>,
          propIndex: number
        ) {
          if (propIndex >= propIDs.length) {
            // Only add combination if it has ALL properties (required by Etsy)
            if (current.length === propIDs.length) {
              allCombinations.push([...current])
            }
            return
          }
          
          const propID = propIDs[propIndex]
          const values = existingPropertyValues.get(propID)
          
          // CRITICAL: All products must have the same properties in the same order
          // If a property has no values, we cannot create combinations with it
          // Skip this property only if it doesn't exist in existing listing at all
          if (!values || values.size === 0) {
            // If this property doesn't exist in existing listing, we can't include it
            // This means we should only generate combinations for properties that exist
            // But we need to ensure ALL combinations have the same properties
            // So if a property has no values, we skip generating combinations entirely
            logger.warn(`Property ${propID} has no values in existing listing. Skipping combination generation for this property.`)
            return
          }
          
          // If this property has new values (by ID or by text), include both existing and new values
          const newValues = newPropertyValues.get(propID)
          const newValuesByText = newPropertyValuesByText.get(propID)
          const allValues = new Map(values)
          
          // Add new values with value IDs
          if (newValues) {
            for (const variation of listing.variations) {
              if (variation.toDelete) continue
              
              if (variation.propertyID1 === propID && variation.propertyOptionIDs1.length > 0) {
                for (let i = 0; i < variation.propertyOptionIDs1.length; i++) {
                  if (newValues.has(variation.propertyOptionIDs1[i])) {
                    allValues.set(variation.propertyOptionIDs1[i], {
                      valueID: variation.propertyOptionIDs1[i],
                      value: variation.propertyOption1
                    })
                  }
                }
              }
              
              if (variation.propertyID2 === propID && variation.propertyOptionIDs2.length > 0) {
                for (let i = 0; i < variation.propertyOptionIDs2.length; i++) {
                  if (newValues.has(variation.propertyOptionIDs2[i])) {
                    allValues.set(variation.propertyOptionIDs2[i], {
                      valueID: variation.propertyOptionIDs2[i],
                      value: variation.propertyOption2
                    })
                  }
                }
              }
            }
          }
          
          // Add new values without value IDs (tracked by text)
          if (newValuesByText) {
            for (const [valueTextKey, valueText] of newValuesByText.entries()) {
              // Check if we already have this value (by text match)
              const alreadyExists = Array.from(allValues.values()).some(
                v => v.value.toLowerCase() === valueTextKey
              )
              if (!alreadyExists) {
                // Use a placeholder value ID of 0 (we'll try to create without value_id)
                // We need a unique key, so use a negative number based on hash of text
                const placeholderID = -Math.abs(valueTextKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0))
                allValues.set(placeholderID, {
                  valueID: placeholderID, // Placeholder - will be null in final product
                  value: valueText
                })
              }
            }
          }
          
          // Generate combinations for this property
          // Each combination must include a value for this property
          for (const valueData of allValues.values()) {
            current.push({
              property_id: propID,
              value_id: valueData.valueID < 0 ? null : valueData.valueID, // null if placeholder
              value: valueData.value
            })
            generateCombinations(current, propIndex + 1)
            current.pop()
          }
        }
        
        generateCombinations([], 0)
        
        // Filter to only combinations that include at least one new property value
        const combinationsWithNewValues = allCombinations.filter(combo => {
          return combo.some(pv => {
            // Check if this is a new value (by ID or by text)
            const newValues = newPropertyValues.get(pv.property_id)
            const newValuesByText = newPropertyValuesByText.get(pv.property_id)
            
            if (pv.value_id !== null && newValues && newValues.has(pv.value_id)) {
              return true
            }
            if (pv.value_id === null && newValuesByText && newValuesByText.has(pv.value.toLowerCase())) {
              return true
            }
            return false
          })
        })
        
        // Create products for combinations not explicitly in CSV
        for (const combo of combinationsWithNewValues) {
          // Create signature for this combination
          // Use value_id if available, otherwise use value text for matching
          const comboSignature = JSON.stringify(combo
            .sort((a, b) => a.property_id - b.property_id)
            .map(pv => ({
              property_id: pv.property_id,
              value_ids: pv.value_id !== null ? [pv.value_id].sort() : [],
              value_text: pv.value.toLowerCase() // Include text for matching when value_id is null
            })))
          
          // Skip if this combination is already in CSV
          if (csvVariationsBySignature.has(comboSignature)) {
            continue
          }
          
          // Check if already in products array
          // Match by property_id and either value_ids or value text
          const alreadyInProducts = products.some(p => {
            const pSig = JSON.stringify(sortPropertyValues(p.property_values)
              .map((pv: any) => ({
                property_id: pv.property_id,
                value_ids: (pv.value_ids || []).sort(),
                value_text: pv.values && pv.values.length > 0 ? pv.values[0].toLowerCase() : ''
              }))
              .sort((a: any, b: any) => a.property_id - b.property_id))
            return pSig === comboSignature
          })
          
          if (alreadyInProducts) {
            continue
          }
          
          // This is a missing combination - create it with is_enabled: false
          logger.log(`Generating missing combination: ${combo.map(pv => pv.value).join(' / ')} (is_enabled: false)`)
          
          // CRITICAL: Ensure the combination has ALL properties from canonical order
          // If it doesn't, skip it (this shouldn't happen if generateCombinations works correctly)
          if (combo.length !== canonicalPropertyOrder.length) {
            logger.warn(`Skipping combination ${combo.map(pv => pv.value).join(' / ')} - missing properties. Expected ${canonicalPropertyOrder.length}, got ${combo.length}`)
            continue
          }
          
          // Sort by canonical order to ensure consistent property structure
          const propertyValues = canonicalPropertyOrder
            .map(propID => {
              const comboProp = combo.find(pv => pv.property_id === propID)
              if (!comboProp) {
                logger.error(`Missing property ${propID} in combination ${combo.map(pv => pv.value).join(' / ')}`)
                return null
              }
              
              // Find property name from existing listing
              const existingProp = existingListing.inventory.products[0]?.property_values.find(
                (epv: any) => epv.property_id === propID
              )
              
              // If value_id is null, we'll try to create without it (Etsy may resolve from taxonomy)
              return {
                property_id: propID,
                property_name: existingProp?.property_name || '',
                value_ids: comboProp.value_id !== null ? [comboProp.value_id] : [], // Empty if value_id is null
                values: [comboProp.value]
              }
            })
            .filter((pv): pv is NonNullable<typeof pv> => pv !== null)
          
          // Double-check we have all properties
          if (propertyValues.length !== canonicalPropertyOrder.length) {
            logger.warn(`Skipping combination - failed to build property values correctly`)
            continue
          }
          
          // Warn if creating combination without value_ids
          if (propertyValues.some(pv => pv.value_ids.length === 0)) {
            logger.log(`Generating combination "${combo.map(pv => pv.value).join(' / ')}" without value_ids. Etsy will validate if these property values exist in their taxonomy.`)
          }
          
          // Get readiness_state_id from first existing offering
          let readinessStateID = defaultReadinessStateID
          if (existingListing.inventory.products.length > 0) {
            const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
            if (firstProduct && firstProduct.offerings && firstProduct.offerings.length > 0) {
              const firstOffering = firstProduct.offerings.find((o: any) => !o.is_deleted)
              if (firstOffering && firstOffering.readiness_state_id) {
                readinessStateID = firstOffering.readiness_state_id
              }
            }
          }
          
          const product: any = {
            sku: '',
            property_values: propertyValues,
            offerings: [{
              price: 0,
              quantity: 0, // Set to 0 for disabled variations
              is_enabled: false, // Not explicitly in CSV, so disabled
              readiness_state_id: readinessStateID
            }]
          }
          
          products.push(product)
        }
      }
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

        // Create signature for this existing product (use sorted order to match)
        const existingPropertyValuesForSignature = (existingProduct.property_values || [])
          .map((pv: any) => ({
            property_id: pv.property_id,
            property_name: pv.property_name,
            value_ids: pv.value_ids || [],
            values: pv.values || []
          }))
        const sortedForSignature = sortPropertyValues(existingPropertyValuesForSignature)
        const existingSignature = JSON.stringify(
          sortedForSignature.map((pv: any) => ({
            property_id: pv.property_id,
            value_ids: (pv.value_ids || []).sort()
          }))
        )

        // If this product is in the CSV, we've already added it above, so skip
        if (csvVariationsBySignature.has(existingSignature)) {
          continue
        }

        // This is an existing product not in the CSV - include it unchanged
        // Convert existing product to API format (without product_id)
        // IMPORTANT: Include property_id, property_name, value_ids, and values
        // Also ensure value_ids and values are not empty (Etsy requires at least one value)
        // Also ensure properties are in canonical order
        const filteredPropertyValues = (existingProduct.property_values || [])
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
          })
        
        // Sort to match canonical order (required by Etsy API)
        const sortedExistingPropertyValues = sortPropertyValues(filteredPropertyValues)
        
        const existingProductForAPI: any = {
          sku: existingProduct.sku || '',
          property_values: sortedExistingPropertyValues,
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
      throw new Error('Cannot update inventory: at least one product is required. All variations may have been skipped due to missing property IDs or invalid data.')
    }
    
    // Validate that all products have the same property structure (required by Etsy API)
    if (products.length > 1) {
      const firstProductPropertyIds = products[0].property_values.map((pv: any) => pv.property_id)
      for (let i = 1; i < products.length; i++) {
        const productPropertyIds = products[i].property_values.map((pv: any) => pv.property_id)
        if (JSON.stringify(firstProductPropertyIds) !== JSON.stringify(productPropertyIds)) {
          logger.error('Property structure mismatch detected:', {
            firstProduct: {
              propertyIds: firstProductPropertyIds,
              propertyValues: products[0].property_values
            },
            mismatchedProduct: {
              index: i,
              propertyIds: productPropertyIds,
              propertyValues: products[i].property_values
            }
          })
          throw new Error(`Products must all have the same properties in the same order. Product at index ${i} has different property structure. Expected: [${firstProductPropertyIds.join(', ')}], Got: [${productPropertyIds.join(', ')}]`)
        }
      }
    }
    
    // Etsy requires at least one offering to have quantity > 0
    // Check if all offerings have quantity 0 or less, and fix if needed
    let hasQuantityGreaterThanZero = false
    for (const product of products) {
      for (const offering of product.offerings || []) {
        if (offering.quantity > 0) {
          hasQuantityGreaterThanZero = true
          break
        }
      }
      if (hasQuantityGreaterThanZero) break
    }
    
    if (!hasQuantityGreaterThanZero && products.length > 0) {
      // Set the first offering of the first product to quantity 1
      if (products[0].offerings && products[0].offerings.length > 0) {
        products[0].offerings[0].quantity = 1
        logger.log('Set quantity to 1 for first offering (Etsy requires at least one offering with quantity > 0)')
      }
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

