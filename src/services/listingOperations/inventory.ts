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
      
      // Sort by canonical order - ensure exact match
      const sorted = propertyValues.sort((a, b) => {
        const indexA = canonicalPropertyOrder.indexOf(a.property_id)
        const indexB = canonicalPropertyOrder.indexOf(b.property_id)
        
        // If property not in canonical order, put it at the end
        if (indexA === -1 && indexB === -1) return a.property_id - b.property_id
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        
        return indexA - indexB
      })
      
      // Validate the sorted order matches canonical order
      const sortedPropertyIds = sorted.map(pv => pv.property_id)
      const expectedPropertyIds = canonicalPropertyOrder.filter(pid => 
        sortedPropertyIds.includes(pid)
      )
      
      if (JSON.stringify(sortedPropertyIds) !== JSON.stringify(expectedPropertyIds)) {
        // Force exact match to canonical order
        const reordered: any[] = []
        for (const propID of canonicalPropertyOrder) {
          const propData = sorted.find(pv => pv.property_id === propID)
          if (propData) {
            reordered.push(propData)
          }
        }
        // Add any missing properties at the end
        for (const propData of sorted) {
          if (!reordered.find(pv => pv.property_id === propData.property_id)) {
            reordered.push(propData)
          }
        }
        return reordered
      }
      
      return sorted
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
      if (!propertyName || !propertyOption) {
        return null
      }

      // If we have existingListing, search it first
      // If not, we can still search other listings if enabled
      let foundPropertyID: number | null = null
      let foundValueIDs: number[] = []

      if (existingListing) {
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
      }

      // If we found the property ID but not the value ID, OR if we didn't find the property ID at all,
      // search other listings if enabled
      if ((!foundPropertyID || foundValueIDs.length === 0) && searchOtherListings && shopID) {
        try {
          logger.log(`Searching other listings in shop ${shopID} for property "${propertyName}" value "${propertyOption}"...`)
          // Fetch a few listings with variations to search (try multiple states)
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
              // Skip the current listing if we have one
              if (existingListing && otherListing.listing_id === listingID) continue
              
              if (!otherListing.has_variations || !otherListing.inventory?.products) continue
              
              for (const product of otherListing.inventory.products) {
                if (product.is_deleted || !product.property_values) continue
                
                for (const pv of product.property_values) {
                  // Match by property name (case-insensitive)
                  if (pv.property_name && pv.property_name.toLowerCase() === propertyName.toLowerCase()) {
                    // Found matching property
                    if (!foundPropertyID) {
                      foundPropertyID = pv.property_id
                      logger.log(`Found property ID ${foundPropertyID} for "${propertyName}" in listing ${otherListing.listing_id}`)
                    }
                    
                    // If we already have the property ID, only search for value IDs
                    // If we don't have it yet, we can use this listing's property ID
                    if (foundPropertyID === pv.property_id) {
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
                }
                if (foundPropertyID && foundValueIDs.length > 0) break // Found it, exit product loop
              }
              if (foundPropertyID && foundValueIDs.length > 0) break // Found it, exit listing loop
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

    // Helper function to fetch all property values for a property ID from the shop
    async function fetchAllPropertyValuesFromShop(
      propertyID: number,
      propertyName: string
    ): Promise<Map<number, { valueID: number; value: string }>> {
      const valueMap = new Map<number, { valueID: number; value: string }>()
      
      if (!shopID || propertyID === 0) {
        return valueMap
      }
      
      try {
        logger.log(`Fetching all property values for ${propertyName} (ID: ${propertyID}) from shop ${shopID}...`)
        
        // Fetch listings from multiple states to get all property values
        let allListings: any[] = []
        
        for (const state of ['active', 'draft', 'inactive']) {
          try {
            const searchResponse = await makeEtsyRequest(
              'GET',
              `/application/shops/${shopID}/listings?limit=100&includes=Inventory&state=${state}`
            )
            const stateData = await searchResponse.json()
            if (stateData.results && Array.isArray(stateData.results)) {
              allListings.push(...stateData.results)
            }
          } catch (error) {
            logger.warn(`Error fetching listings with state ${state}:`, error)
          }
        }
        
        // Extract all unique property values for this property ID
        for (const listing of allListings) {
          if (!listing.has_variations || !listing.inventory?.products) continue
          
          for (const product of listing.inventory.products) {
            if (product.is_deleted || !product.property_values) continue
            
            for (const pv of product.property_values) {
              if (pv.property_id === propertyID && pv.value_ids && pv.values) {
                for (let i = 0; i < Math.min(pv.value_ids.length, pv.values.length); i++) {
                  const valueID = pv.value_ids[i]
                  const value = pv.values[i]
                  if (!valueMap.has(valueID)) {
                    valueMap.set(valueID, { valueID, value })
                  }
                }
              }
            }
          }
        }
        
        logger.log(`Found ${valueMap.size} unique property values for ${propertyName} (ID: ${propertyID})`)
        return valueMap
      } catch (error) {
        logger.warn(`Error fetching property values from shop:`, error)
        return valueMap
      }
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
      let inferredPropertyName1 = variation.propertyName1
      if (variation.propertyID1 === 0 && variation.propertyOption1 !== '') {
        // If property name is missing, try to infer it from existing listing
        if (!inferredPropertyName1 && existingListing) {
          // Try to find property name from existing variations
          for (const product of existingListing.inventory.products || []) {
            if (product.is_deleted || !product.property_values) continue
            for (const pv of product.property_values) {
              if (pv.property_name) {
                inferredPropertyName1 = pv.property_name
                break
              }
            }
            if (inferredPropertyName1) break
          }
        }
        
        // Always search other listings if we have a property name, even if existingListing is null
        if (inferredPropertyName1) {
          const resolved = await resolvePropertyIDs(
            inferredPropertyName1,
            variation.propertyOption1,
            variation.propertyID1,
            variation.propertyOptionIDs1,
            existingListing,
            true // Always search other listings
          )
          if (resolved) {
            resolvedProp1 = resolved
            if (resolved.hasValueIDs) {
              logger.log(`Resolved property 1: ${inferredPropertyName1}/${variation.propertyOption1} -> ID ${resolved.propertyID}, value IDs ${resolved.valueIDs.join(',')}`)
            } else {
              logger.log(`Resolved property 1: ${inferredPropertyName1}/${variation.propertyOption1} -> ID ${resolved.propertyID} (value IDs not found, will try without them)`)
            }
          } else {
            logger.warn(`Could not resolve property ID for "${variation.propertyOption1}" with property name "${inferredPropertyName1}"`)
          }
        } else {
          logger.warn(`Cannot resolve property ID for "${variation.propertyOption1}" - property name is missing and cannot be inferred`)
        }
      }

      // Similar fix for property 2
      let resolvedProp2 = { propertyID: variation.propertyID2, valueIDs: variation.propertyOptionIDs2, hasValueIDs: variation.propertyOptionIDs2.length > 0 }
      let inferredPropertyName2 = variation.propertyName2
      if (variation.propertyID2 === 0 && variation.propertyOption2 !== '') {
        // If property name is missing, try to infer it from existing listing
        if (!inferredPropertyName2 && existingListing) {
          // Try to find property name from existing variations (use second property if available)
          for (const product of existingListing.inventory.products || []) {
            if (product.is_deleted || !product.property_values) continue
            if (product.property_values.length > 1 && product.property_values[1].property_name) {
              inferredPropertyName2 = product.property_values[1].property_name
              break
            }
          }
        }
        
        // Always search other listings if we have a property name, even if existingListing is null
        if (inferredPropertyName2) {
          const resolved = await resolvePropertyIDs(
            inferredPropertyName2,
            variation.propertyOption2,
            variation.propertyID2,
            variation.propertyOptionIDs2,
            existingListing,
            true
          )
          if (resolved) {
            resolvedProp2 = resolved
            if (resolved.hasValueIDs) {
              logger.log(`Resolved property 2: ${inferredPropertyName2}/${variation.propertyOption2} -> ID ${resolved.propertyID}, value IDs ${resolved.valueIDs.join(',')}`)
            } else {
              logger.log(`Resolved property 2: ${inferredPropertyName2}/${variation.propertyOption2} -> ID ${resolved.propertyID} (value IDs not found, will try without them)`)
            }
          } else {
            logger.warn(`Could not resolve property ID for "${variation.propertyOption2}" with property name "${inferredPropertyName2}"`)
          }
        } else {
          logger.warn(`Cannot resolve property ID for "${variation.propertyOption2}" - property name is missing and cannot be inferred`)
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

      // Build property values array - MUST be in canonical order for Etsy API
      const propertyValues: any[] = []
      let hasMissingProperties = false
      
      // If we have a canonical order, we MUST use it and ensure all properties are in that exact order
      if (canonicalPropertyOrder.length > 0) {
        // Build a map of property_id -> property_data for easy lookup
        const propDataMap = new Map<number, any>()
        if (prop1Data) propDataMap.set(prop1Data.property_id, prop1Data)
        if (prop2Data) propDataMap.set(prop2Data.property_id, prop2Data)
        
        // Add properties in EXACT canonical order - this is critical for Etsy API
        for (const propID of canonicalPropertyOrder) {
          const propData = propDataMap.get(propID)
          if (propData) {
            propertyValues.push(propData)
          } else {
            // Property is in canonical order but not in CSV - need to add it with a default value
            // Get default value from existing listing
            let defaultPropertyValue: any = null
            
            if (existingListing && existingListing.inventory.products.length > 0) {
              // Find first existing product with this property
              for (const existingProduct of existingListing.inventory.products) {
                if (existingProduct.is_deleted || !existingProduct.property_values) continue
                
                const existingProp = existingProduct.property_values.find(
                  (pv: any) => pv.property_id === propID
                )
                
                if (existingProp && existingProp.values && existingProp.values.length > 0) {
                  // Use the first value from the first existing product
                  defaultPropertyValue = {
                    property_id: propID,
                    property_name: existingProp.property_name || '',
                    value_ids: existingProp.value_ids && existingProp.value_ids.length > 0 
                      ? [existingProp.value_ids[0]] 
                      : [],
                    values: [existingProp.values[0]]
                  }
                  hasMissingProperties = true
                  logger.log(`Adding missing property ${existingProp.property_name || propID} with default value "${existingProp.values[0]}" (not in CSV)`)
                  break
                }
              }
            }
            
            if (defaultPropertyValue) {
              propertyValues.push(defaultPropertyValue)
            } else {
              logger.warn(`Property ${propID} is in canonical order but not found in CSV and no default value available from existing listing`)
            }
          }
        }
        
        // Add any properties not in canonical order at the end (shouldn't happen, but handle it)
        for (const [propID, propData] of propDataMap) {
          if (!canonicalPropertyOrder.includes(propID)) {
            logger.warn(`Property ${propID} not in canonical order ${canonicalPropertyOrder.join(', ')}. Adding at end.`)
            propertyValues.push(propData)
          }
        }
      } else {
        // No canonical order - add in CSV order (property1, then property2)
        if (prop1Data) {
          propertyValues.push(prop1Data)
        }
        if (prop2Data) {
          propertyValues.push(prop2Data)
        }
        
        // If we don't have a canonical order yet, establish one from the first variation
        // This ensures all subsequent variations use the same order
        if (canonicalPropertyOrder.length === 0 && propertyValues.length > 0) {
          canonicalPropertyOrder.push(...propertyValues.map(pv => pv.property_id))
          logger.log(`Establishing canonical property order from first variation: ${canonicalPropertyOrder.join(', ')}`)
        }
      }
      
      // Final validation: ensure property values are in the correct order
      // This is critical - Etsy requires all products to have properties in the same order
      // We'll do the sorting and validation later, after we've built the complete propertyValues array

      const offering: any = {
        price: 0, // Default price as float (inventory endpoint expects float)
        quantity: 0,
        is_enabled: !hasMissingProperties, // Disable if we had to add missing properties
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
      } else if (hasMissingProperties) {
        // If we have missing properties, use price from first existing product
        if (existingListing && existingListing.inventory.products.length > 0) {
          const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
          if (firstProduct && firstProduct.offerings.length > 0) {
            const firstOffering = firstProduct.offerings.find((o: any) => !o.is_deleted)
            if (firstOffering && firstOffering.price) {
              if (typeof firstOffering.price === 'object' && firstOffering.price.amount !== undefined) {
                offering.price = firstOffering.price.amount / (firstOffering.price.divisor || 1)
              } else if (typeof firstOffering.price === 'number') {
                offering.price = firstOffering.price
              }
            }
          }
        }
      }
      
      if (variation.propertyQuantity !== null) {
        offering.quantity = variation.propertyQuantity
      } else if (hasMissingProperties) {
        // If we have missing properties, set quantity to 0 (hidden variation)
        offering.quantity = 0
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
      // Sort and validate to ensure correct order
      let sortedPropertyValues = sortPropertyValues(propertyValues)
      
      // Double-check that the sorted order matches canonical order exactly
      if (canonicalPropertyOrder.length > 0) {
        const actualOrder = sortedPropertyValues.map(pv => pv.property_id)
        const expectedOrder = canonicalPropertyOrder.filter(pid => 
          sortedPropertyValues.some(pv => pv.property_id === pid)
        )
        
        if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
          logger.warn(`Property order mismatch after sorting. Expected: [${expectedOrder.join(', ')}], Got: [${actualOrder.join(', ')}]. Reordering to match canonical order.`)
          
          // Force reorder to match canonical order exactly
          const reordered: any[] = []
          for (const propID of canonicalPropertyOrder) {
            const propData = sortedPropertyValues.find(pv => pv.property_id === propID)
            if (propData) {
              reordered.push(propData)
            }
          }
          // Add any properties not in canonical order at the end (shouldn't happen)
          for (const propData of sortedPropertyValues) {
            if (!reordered.find(pv => pv.property_id === propData.property_id)) {
              reordered.push(propData)
            }
          }
          
          // Replace with reordered version
          sortedPropertyValues = reordered
        }
      }

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
    
    // After processing all CSV variations, if we have property IDs, fetch ALL their values from the shop
    // and generate all missing combinations
    if (canonicalPropertyOrder.length > 0 && shopID) {
      const allPropertyValuesMap = new Map<number, Map<number, { valueID: number; value: string }>>()
      
      // Fetch all property values for each property in canonical order
      for (const propID of canonicalPropertyOrder) {
        // Find property name from existing listing or CSV
        let propertyName = ''
        if (existingListing && existingListing.inventory.products.length > 0) {
          const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
          if (firstProduct && firstProduct.property_values) {
            const prop = firstProduct.property_values.find((pv: any) => pv.property_id === propID)
            if (prop) propertyName = prop.property_name || ''
          }
        }
        
        // Also check CSV variations for property name
        if (!propertyName) {
          for (const variation of listing.variations) {
            if (variation.toDelete) continue
            if (variation.propertyID1 === propID && variation.propertyName1) {
              propertyName = variation.propertyName1
              break
            }
            if (variation.propertyID2 === propID && variation.propertyName2) {
              propertyName = variation.propertyName2
              break
            }
          }
        }
        
        if (propertyName) {
          const values = await fetchAllPropertyValuesFromShop(propID, propertyName)
          if (values.size > 0) {
            allPropertyValuesMap.set(propID, values)
            logger.log(`Fetched ${values.size} values for property ${propertyName} (ID: ${propID})`)
          }
        }
      }
      
      // Generate all combinations of property values
      if (allPropertyValuesMap.size > 0) {
        const allCombinations: Array<Array<{ property_id: number; value_id: number; value: string }>> = []
        
        function generateAllCombinations(
          current: Array<{ property_id: number; value_id: number; value: string }>,
          propIndex: number
        ) {
          if (propIndex >= canonicalPropertyOrder.length) {
            if (current.length > 0) {
              allCombinations.push([...current])
            }
            return
          }
          
          const propID = canonicalPropertyOrder[propIndex]
          const values = allPropertyValuesMap.get(propID)
          
          if (values && values.size > 0) {
            for (const { valueID, value } of values.values()) {
              generateAllCombinations([...current, { property_id: propID, value_id: valueID, value }], propIndex + 1)
            }
          } else {
            // Property has no values - skip it
            generateAllCombinations(current, propIndex + 1)
          }
        }
        
        generateAllCombinations([], 0)
        logger.log(`Generated ${allCombinations.length} total combinations from shop property values`)
        
        // Create signatures for CSV variations to check which combinations are already in CSV
        const csvVariationSignatures = new Set<string>()
        for (const variation of listing.variations) {
          if (variation.toDelete) continue
          
          const sig: number[] = []
          if (variation.propertyID1 > 0 && variation.propertyOptionIDs1.length > 0) {
            sig.push(...variation.propertyOptionIDs1)
          }
          if (variation.propertyID2 > 0 && variation.propertyOptionIDs2.length > 0) {
            sig.push(...variation.propertyOptionIDs2)
          }
          if (sig.length > 0) {
            csvVariationSignatures.add(JSON.stringify(sig.sort()))
          }
        }
        
        // Create products for combinations not in CSV (mark as hidden)
        for (const combo of allCombinations) {
          // Create signature for this combination
          const comboValueIDs = combo.map(c => c.value_id).sort()
          const comboSignature = JSON.stringify(comboValueIDs)
          
          // Check if this combination is already in CSV
          if (csvVariationSignatures.has(comboSignature)) {
            continue // Already handled by CSV processing
          }
          
          // Check if this combination already exists in the listing
          const existingSignature = JSON.stringify(
            combo.map(c => ({ property_id: c.property_id, value_ids: [c.value_id] }))
              .sort((a, b) => a.property_id - b.property_id)
          )
          if (csvVariationsBySignature.has(existingSignature)) {
            continue // Already exists
          }
          
          // This is a missing combination - create it as hidden
          logger.log(`Creating hidden combination: ${combo.map(c => c.value).join(' / ')} (not in CSV/Sheet)`)
          
          // Build property values in canonical order
          const propertyValues = canonicalPropertyOrder
            .map(propID => {
              const comboProp = combo.find(c => c.property_id === propID)
              if (!comboProp) return null
              
              // Find property name
              let propertyName = ''
              if (existingListing && existingListing.inventory.products.length > 0) {
                const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
                if (firstProduct && firstProduct.property_values) {
                  const prop = firstProduct.property_values.find((pv: any) => pv.property_id === propID)
                  if (prop) propertyName = prop.property_name || ''
                }
              }
              
              return {
                property_id: propID,
                property_name: propertyName,
                value_ids: [comboProp.value_id],
                values: [comboProp.value]
              }
            })
            .filter((pv): pv is NonNullable<typeof pv> => pv !== null)
          
          if (propertyValues.length !== canonicalPropertyOrder.length) {
            logger.warn(`Skipping combination - failed to build property values correctly`)
            continue
          }
          
          // Get readiness_state_id
          let readinessStateID = defaultReadinessStateID
          if (existingListing && existingListing.inventory.products.length > 0) {
            const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
            if (firstProduct && firstProduct.offerings && firstProduct.offerings.length > 0) {
              const firstOffering = firstProduct.offerings.find((o: any) => !o.is_deleted)
              if (firstOffering && firstOffering.readiness_state_id) {
                readinessStateID = firstOffering.readiness_state_id
              }
            }
          }
          
          // Get default price from first existing product
          let defaultPrice = 0
          if (existingListing && existingListing.inventory.products.length > 0) {
            const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
            if (firstProduct && firstProduct.offerings.length > 0) {
              const firstOffering = firstProduct.offerings.find((o: any) => !o.is_deleted)
              if (firstOffering && firstOffering.price) {
                if (typeof firstOffering.price === 'object' && firstOffering.price.amount !== undefined) {
                  defaultPrice = firstOffering.price.amount / (firstOffering.price.divisor || 1)
                } else if (typeof firstOffering.price === 'number') {
                  defaultPrice = firstOffering.price
                }
              }
            }
          }
          
          const product: any = {
            sku: '',
            property_values: propertyValues,
            offerings: [{
              price: defaultPrice,
              quantity: 0, // Hidden variation
              is_enabled: false, // Mark as hidden since not in CSV/Sheet
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
        
        // CRITICAL: Skip products that have no valid property values after filtering
        // This can happen if an existing product has invalid property data
        if (sortedExistingPropertyValues.length === 0) {
          logger.warn(`Skipping existing product ${existingProduct.product_id} - no valid property values after filtering`)
          continue
        }
        
        // CRITICAL: Ensure the product has ALL properties from canonical order
        // If it's missing any, we need to add them with default values
        if (canonicalPropertyOrder.length > 0) {
          const existingPropertyIds = sortedExistingPropertyValues.map((pv: any) => pv.property_id)
          const missingPropertyIds = canonicalPropertyOrder.filter(pid => !existingPropertyIds.includes(pid))
          
          if (missingPropertyIds.length > 0) {
            logger.warn(`Existing product ${existingProduct.product_id} is missing properties: ${missingPropertyIds.join(', ')}. Adding default values.`)
            
            // Add missing properties with default values from first existing product
            for (const missingPropID of missingPropertyIds) {
              // Find property name and default value from first existing product
              const firstProduct = existingListing.inventory.products.find((p: any) => !p.is_deleted)
              if (firstProduct && firstProduct.property_values) {
                const defaultProp = firstProduct.property_values.find((pv: any) => pv.property_id === missingPropID)
                if (defaultProp && defaultProp.values && defaultProp.values.length > 0) {
                  sortedExistingPropertyValues.push({
                    property_id: missingPropID,
                    property_name: defaultProp.property_name || '',
                    value_ids: defaultProp.value_ids && defaultProp.value_ids.length > 0 ? [defaultProp.value_ids[0]] : [],
                    values: [defaultProp.values[0]]
                  })
                }
              }
            }
            
            // Re-sort to ensure canonical order
            const reordered = canonicalPropertyOrder
              .map(propID => sortedExistingPropertyValues.find((pv: any) => pv.property_id === propID))
              .filter((pv): pv is NonNullable<typeof pv> => pv !== null)
            
            // Replace with reordered version
            sortedExistingPropertyValues.length = 0
            sortedExistingPropertyValues.push(...reordered)
          }
        }
        
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

    // CRITICAL: If quantity is NOT on property, all products must have the same quantity
    // Etsy API requires: "quantity must be consistent across all products"
    if (quantityPropertyIDs.length === 0 && products.length > 0) {
      // Find the first non-zero quantity, or use 1 as default
      let consistentQuantity = 1
      for (const product of products) {
        if (product.offerings && product.offerings.length > 0) {
          const offering = product.offerings[0]
          if (offering.quantity > 0) {
            consistentQuantity = offering.quantity
            break
          }
        }
      }
      
      // Set all products to the same quantity
      for (const product of products) {
        if (product.offerings && product.offerings.length > 0) {
          product.offerings[0].quantity = consistentQuantity
        }
      }
      
      logger.log(`Quantity is not on property - setting all products to consistent quantity: ${consistentQuantity}`)
    }

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

