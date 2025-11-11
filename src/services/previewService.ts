// Preview service - generates preview of changes before applying them
// Ported from backend Go code

import { parseUploadCSV, ProcessedListing, ProcessedVariation } from './uploadService'
import { getListing, Listing } from './etsyApi'
import { getValidAccessToken } from './oauth'
import { logger } from '../utils/logger'
import { decodeHTMLEntities } from '../utils/dataParsing'

export interface FieldChange {
  field: string
  before: string | number | null
  after: string | number | null
  changeType: 'modified' | 'added' | 'removed'
}

export interface VariationChange {
  changeId: string
  variationId: string
  changeType: 'create' | 'update' | 'delete'
  fieldChanges: FieldChange[]
}

export interface PreviewChange {
  changeId: string
  changeType: 'create' | 'update' | 'delete'
  listingId: number
  title: string
  fieldChanges?: FieldChange[]
  variationChanges?: VariationChange[]
}

export interface PreviewResponse {
  changes: PreviewChange[]
  summary: {
    totalChanges: number
    creates: number
    updates: number
    deletes: number
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

// Normalize description for comparison
function normalizeDescription(desc: string): string {
  if (desc === '') {
    return ''
  }

  // Decode HTML entities
  let normalized = decodeHTMLEntities(desc)

  // Normalize whitespace: replace multiple spaces/newlines with single space
  normalized = normalized.replace(/\s+/g, ' ')

  // Trim leading/trailing whitespace
  normalized = normalized.trim()

  return normalized
}

// Check if two tag arrays are equal
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

// Helper functions for creating FieldChange objects
function createFieldChange(
  field: string,
  before: string | number | null,
  after: string | number | null,
  changeType: 'modified' | 'added' | 'removed'
): FieldChange {
  return { field, before, after, changeType }
}

function createAddedField(field: string, after: string | number): FieldChange {
  return createFieldChange(field, null, after, 'added')
}

function createModifiedField(field: string, before: string | number, after: string | number): FieldChange {
  return createFieldChange(field, before, after, 'modified')
}

// ============================================================================
// Comparison Functions
// ============================================================================

// Compare variation
function compareVariation(
  existing: Listing['inventory']['products'][0],
  newVariation: ProcessedVariation,
  inventory: Listing['inventory']
): FieldChange[] {
  logger.info(`Comparing variation: `, newVariation)
  logger.info(`Inventory: `, inventory)
  logger.info(`Existing: `, existing)
  return []
  // const changes: FieldChange[] = []

  // // Handle case where existing product has no property values but new variation does
  // // This means we're adding property values to an existing product
  // if (existing.property_values.length === 0) {
  //   // Existing product has no property values, but new variation has them
  //   // This is a significant change - adding variation data to a product
  //   if (newVariation.propertyOption1 !== '') {
  //     changes.push(createAddedField('property_option_1', normalizeDescription(newVariation.propertyOption1)))
  //   }
  //   if (newVariation.propertyOption2 !== '') {
  //     changes.push(createAddedField('property_option_2', normalizeDescription(newVariation.propertyOption2)))
  //   }
    
  //   // Check price/quantity/SKU - always show as changes since we're adding property structure
  //   const hasPriceOnProperty = inventory.price_on_property.length > 0
  //   const hasQuantityOnProperty = inventory.quantity_on_property.length > 0
  //   const hasSKUOnProperty = inventory.sku_on_property.length > 0
    
  //   // Price handling
  //   if (hasPriceOnProperty && newVariation.propertyPrice !== null) {
  //     // Price is on property - compare with existing offering price
  //     if (existing.offerings.length > 0) {
  //       const existingPrice = existing.offerings[0].price.amount / existing.offerings[0].price.divisor
  //       const epsilon = 0.01
  //       if (Math.abs(existingPrice - newVariation.propertyPrice) > epsilon) {
  //         changes.push(createModifiedField('price', existingPrice.toFixed(2), newVariation.propertyPrice.toFixed(2)))
  //       } else {
  //         // Price matches, but we're adding property structure, so show as added
  //         changes.push(createAddedField('price', newVariation.propertyPrice.toFixed(2)))
  //       }
  //     } else {
  //       changes.push(createAddedField('price', newVariation.propertyPrice.toFixed(2)))
  //     }
  //   }
    
  //   // Quantity handling
  //   if (hasQuantityOnProperty && newVariation.propertyQuantity !== null) {
  //     // Quantity is on property - compare with existing offering quantity
  //     if (existing.offerings.length > 0) {
  //       if (existing.offerings[0].quantity !== newVariation.propertyQuantity) {
  //         changes.push(createModifiedField('quantity', existing.offerings[0].quantity, newVariation.propertyQuantity))
  //       } else {
  //         // Quantity matches, but we're adding property structure, so show as added
  //         changes.push(createAddedField('quantity', newVariation.propertyQuantity))
  //       }
  //     } else {
  //       changes.push(createAddedField('quantity', newVariation.propertyQuantity))
  //     }
  //   }
    
  //   // SKU handling
  //   if (hasSKUOnProperty && newVariation.propertySKU !== '') {
  //     // SKU is on property - compare with existing product SKU
  //     if (existing.sku !== newVariation.propertySKU) {
  //       changes.push(createModifiedField('sku', existing.sku || '', newVariation.propertySKU))
  //     } else {
  //       // SKU matches, but we're adding property structure, so show as added
  //       changes.push(createAddedField('sku', newVariation.propertySKU))
  //     }
  //   }
    
  //   return changes // Return early since we've handled the empty property_values case
  // }

  // // Compare property options (existing has property values)
  // if (existing.property_values.length > 0) {
  //   const existingOption1 = normalizeDescription(
  //     existing.property_values[0].values.join(', ')
  //   )
  //   const newOption1 = normalizeDescription(newVariation.propertyOption1)
  //   if (newOption1 !== '' && existingOption1 !== newOption1) {
  //     changes.push(createModifiedField('property_option_1', existingOption1, newOption1))
  //   }
  //   if (existing.property_values.length > 1) {
  //     const existingOption2 = normalizeDescription(
  //       existing.property_values[1].values.join(', ')
  //     )
  //     const newOption2 = normalizeDescription(newVariation.propertyOption2)
  //     if (newOption2 !== '' && existingOption2 !== newOption2) {
  //       changes.push(createModifiedField('property_option_2', existingOption2, newOption2))
  //     }
  //   }
  // }

  // // Compare price (if on property)
  // if (inventory.price_on_property.length > 0 && newVariation.propertyPrice !== null) {
  //   if (existing.offerings.length > 0) {
  //     const existingPrice =
  //       existing.offerings[0].price.amount / existing.offerings[0].price.divisor
  //     const epsilon = 0.01
  //     if (Math.abs(existingPrice - newVariation.propertyPrice) > epsilon) {
  //       changes.push(createModifiedField(
  //         'price',
  //         existingPrice.toFixed(2),
  //         newVariation.propertyPrice.toFixed(2)
  //       ))
  //     }
  //   }
  // }

  // // Compare quantity (if on property)
  // if (
  //   inventory.quantity_on_property.length > 0 &&
  //   newVariation.propertyQuantity !== null
  // ) {
  //   if (existing.offerings.length > 0) {
  //     if (existing.offerings[0].quantity !== newVariation.propertyQuantity) {
  //       changes.push(createModifiedField(
  //         'quantity',
  //         existing.offerings[0].quantity,
  //         newVariation.propertyQuantity
  //       ))
  //     }
  //   }
  // }

  // // Compare SKU (if on property)
  // if (inventory.sku_on_property.length > 0 && newVariation.propertySKU !== '') {
  //   if (existing.sku !== newVariation.propertySKU) {
  //     changes.push(createModifiedField('sku', existing.sku, newVariation.propertySKU))
  //   }
  // }

  // return changes
}

// Compare non-variation product
function compareNonVariationProduct(
  existing: Listing['inventory']['products'][0],
  newListing: ProcessedListing,
  inventory: Listing['inventory']
): FieldChange[] {
  const changes: FieldChange[] = []

  // Compare SKU
  if (inventory.sku_on_property.length === 0 && newListing.sku !== '') {
    if (existing.sku !== newListing.sku) {
      changes.push(createModifiedField('sku', existing.sku, newListing.sku))
    }
  }

  // Compare price (if not on property)
  if (inventory.price_on_property.length === 0 && newListing.price !== null) {
    if (existing.offerings.length > 0) {
      const existingPrice =
        existing.offerings[0].price.amount / existing.offerings[0].price.divisor
      const epsilon = 0.01
      if (Math.abs(existingPrice - newListing.price) > epsilon) {
        changes.push(createModifiedField(
          'price',
          existingPrice.toFixed(2),
          newListing.price.toFixed(2)
        ))
      }
    }
  }

  // Compare quantity (if not on property)
  if (inventory.quantity_on_property.length === 0 && newListing.quantity !== null) {
    if (existing.offerings.length > 0) {
      if (existing.offerings[0].quantity !== newListing.quantity) {
        changes.push(createModifiedField(
          'quantity',
          existing.offerings[0].quantity,
          newListing.quantity
        ))
      }
    }
  }

  return changes
}

// ============================================================================
// Listing Fetching
// ============================================================================

async function fetchExistingListings(listingIDs: number[]): Promise<Map<number, Listing>> {
  const existingListingsMap = new Map<number, Listing>()
  
  if (listingIDs.length === 0) return existingListingsMap
  
  const batchSize = 10
  for (let i = 0; i < listingIDs.length; i += batchSize) {
    const batch = listingIDs.slice(i, i + batchSize)
    const batchPromises = batch.map(id => 
      getListing(id).catch(error => {
        logger.error(`Error fetching listing ${id}:`, error)
        return null
      })
    )
    
    const batchResults = await Promise.all(batchPromises)
    batchResults.forEach((listing, idx) => {
      if (listing) {
        existingListingsMap.set(batch[idx], listing)
      }
    })
  }
  
  return existingListingsMap
}

// ============================================================================
// Change Type Handlers
// ============================================================================

function handleDeleteChange(
  newListing: ProcessedListing,
  existing: Listing | undefined,
  changeID: string
): PreviewChange | null {
  if (!newListing.toDelete || newListing.listingID === 0 || !existing) {
    return null
  }
  
  return {
    changeId: changeID,
    changeType: 'delete',
    listingId: newListing.listingID,
    title: existing.title,
    fieldChanges: [],
    variationChanges: [],
  }
}

function buildCreateFieldChanges(newListing: ProcessedListing): FieldChange[] {
  const fieldChanges: FieldChange[] = [
    createAddedField('title', normalizeDescription(newListing.title)),
    createAddedField('description', normalizeDescription(newListing.description)),
  ]

  if (newListing.price !== null) {
    fieldChanges.push(createAddedField('price', newListing.price.toFixed(2)))
  }
  if (newListing.quantity !== null) {
    fieldChanges.push(createAddedField('quantity', newListing.quantity))
  }
  if (newListing.sku !== '') {
    fieldChanges.push(createAddedField('sku', newListing.sku))
  }
  if (newListing.tags.length > 0) {
    const tagsNormalized = newListing.tags.map(normalizeDescription)
    fieldChanges.push(createAddedField('tags', tagsNormalized.join(', ')))
  }
  if (newListing.status !== '') {
    fieldChanges.push(createAddedField('status', newListing.status))
  }

  return fieldChanges
}

function buildCreateVariationChanges(newListing: ProcessedListing, changeID: string): VariationChange[] {
  const variationChanges: VariationChange[] = []
  
  for (let i = 0; i < newListing.variations.length; i++) {
    const variation = newListing.variations[i]
    if (variation.toDelete) {
      continue
    }
    
    const varChanges: FieldChange[] = []
    if (variation.propertyOption1 !== '') {
      varChanges.push(createAddedField('property_option_1', normalizeDescription(variation.propertyOption1)))
    }
    if (variation.propertyOption2 !== '') {
      varChanges.push(createAddedField('property_option_2', normalizeDescription(variation.propertyOption2)))
    }
    if (variation.propertyPrice !== null) {
      varChanges.push(createAddedField('price', variation.propertyPrice.toFixed(2)))
    }
    if (variation.propertyQuantity !== null) {
      varChanges.push(createAddedField('quantity', variation.propertyQuantity))
    }
    if (variation.propertySKU !== '') {
      varChanges.push(createAddedField('sku', variation.propertySKU))
    }

    variationChanges.push({
      changeId: `${changeID}_var_${i}`,
      variationId: `new_${i}`,
      changeType: 'create',
      fieldChanges: varChanges,
    })
  }
  
  return variationChanges
}

function handleCreateChange(
  newListing: ProcessedListing,
  changeID: string
): PreviewChange {
  const fieldChanges = buildCreateFieldChanges(newListing)
  const variationChanges = buildCreateVariationChanges(newListing, changeID)
  
  return {
    changeId: changeID,
    changeType: 'create',
    listingId: 0,
    title: newListing.title,
    fieldChanges,
    variationChanges,
  }
}

function compareListingFields(
  newListing: ProcessedListing,
  existing: Listing
): FieldChange[] {
  const changes: FieldChange[] = []

  // Title
  const existingTitle = normalizeDescription(existing.title)
  const newTitle = normalizeDescription(newListing.title)
  if (existingTitle !== newTitle) {
    changes.push(createModifiedField('title', existingTitle, newTitle))
  }

  // Description
  const existingDesc = normalizeDescription(existing.description)
  const newDesc = normalizeDescription(newListing.description)
  if (existingDesc !== newDesc) {
    changes.push(createModifiedField('description', existingDesc, newDesc))
  }

  // Status
  if (newListing.status !== '' && existing.state !== newListing.status) {
    changes.push(createModifiedField('status', existing.state, newListing.status))
  }

  // Tags
  const existingTagsNormalized = existing.tags.map(normalizeDescription)
  const newTagsNormalized = newListing.tags.map(normalizeDescription)
  if (!tagsEqual(newTagsNormalized, existingTagsNormalized)) {
    changes.push(createModifiedField(
      'tags',
      existingTagsNormalized.join(', '),
      newTagsNormalized.join(', ')
    ))
  }

  // Price (only if not on property)
  if (newListing.price !== null && existing.inventory.price_on_property.length === 0) {
    const existingPrice = existing.price.amount / existing.price.divisor
    const epsilon = 0.01
    if (Math.abs(existingPrice - newListing.price) > epsilon) {
      changes.push(createModifiedField('price', existingPrice.toFixed(2), newListing.price.toFixed(2)))
    }
  }

  // Quantity (only if not on property)
  if (
    newListing.quantity !== null &&
    existing.inventory.quantity_on_property.length === 0
  ) {
    if (existing.quantity !== newListing.quantity) {
      changes.push(createModifiedField('quantity', existing.quantity, newListing.quantity))
    }
  }

  // SKU (only if not on property)
  if (newListing.sku !== '' && existing.inventory.sku_on_property.length === 0) {
    let existingSKU = ''
    if (
      existing.inventory.products.length > 0 &&
      !existing.inventory.products[0].is_deleted
    ) {
      existingSKU = existing.inventory.products[0].sku
    }
    if (newListing.sku !== existingSKU) {
      changes.push(createModifiedField('sku', existingSKU, newListing.sku))
    }
  }

  return changes
}

function compareVariations(
  newListing: ProcessedListing,
  existing: Listing,
  changeID: string
): VariationChange[] {
  const variationChanges: VariationChange[] = []
  logger.info(`Comparing variations for listing ${newListing.listingID}`)
  logger.info(`New listing has variations: ${newListing.hasVariations}`)
  
  if (!newListing.hasVariations) {
    // Non-variation listing - compare single product
    if (
      existing.inventory.products.length > 0 &&
      !existing.inventory.products[0].is_deleted
    ) {
      const existingProduct = existing.inventory.products[0]
      const varChanges = compareNonVariationProduct(
        existingProduct,
        newListing,
        existing.inventory
      )
      if (varChanges.length > 0) {
        variationChanges.push({
          changeId: `${changeID}_product`,
          variationId: existingProduct.product_id.toString(),
          changeType: 'update',
          fieldChanges: varChanges,
        })
      }
    }
    return variationChanges
  }

  // Check if we're converting from non-variation to variation
  const isConvertingToVariations = !existing.has_variations && newListing.hasVariations

  // Create map of existing variations by product ID
  const existingVariationsMap = new Map<
    number,
    Listing['inventory']['products'][0]
  >()
  for (const product of existing.inventory.products) {
    if (!product.is_deleted) {
      existingVariationsMap.set(product.product_id, product)
    }
  }

  logger.info(`New listing variations map: `, newListing.variations)
  logger.info(`Is converting to variations: ${isConvertingToVariations}`)
  logger.info(`Existing products count: ${existingVariationsMap.size}`)

  // Process new variations
  for (let i = 0; i < newListing.variations.length; i++) {
    const newVariation = newListing.variations[i]
    const varChangeID = `${changeID}_var_${i}`

    if (newVariation.toDelete) {
      // Variation deletion
      if (newVariation.productID > 0 && existingVariationsMap.has(newVariation.productID)) {
        variationChanges.push({
          changeId: varChangeID,
          variationId: newVariation.productID.toString(),
          changeType: 'delete',
          fieldChanges: [],
        })
      }
      continue
    }

    // Check if variation exists
    if (newVariation.productID > 0) {
      const existingVar = existingVariationsMap.get(newVariation.productID)
      logger.info(`Existing variation: `, existingVar)
      logger.info(`New variation: `, newVariation)
      if (existingVar) {
        // Update existing variation
        const varChanges = compareVariation(existingVar, newVariation, existing.inventory)
        logger.info(`Var changes: `, varChanges)
        if (varChanges.length > 0) {
          variationChanges.push({
            changeId: varChangeID,
            variationId: newVariation.productID.toString(),
            changeType: 'update',
            fieldChanges: varChanges,
          })
        }
      } else {
        // New variation (product ID doesn't exist in map)
        const varChanges: FieldChange[] = []
        if (newVariation.propertyOption1 !== '') {
          varChanges.push(createAddedField('property_option_1', normalizeDescription(newVariation.propertyOption1)))
        }
        if (newVariation.propertyOption2 !== '') {
          varChanges.push(createAddedField('property_option_2', normalizeDescription(newVariation.propertyOption2)))
        }
        if (newVariation.propertyPrice !== null) {
          varChanges.push(createAddedField('price', newVariation.propertyPrice.toFixed(2)))
        }
        if (newVariation.propertyQuantity !== null) {
          varChanges.push(createAddedField('quantity', newVariation.propertyQuantity))
        }
        if (newVariation.propertySKU !== '') {
          varChanges.push(createAddedField('sku', newVariation.propertySKU))
        }

        variationChanges.push({
          changeId: varChangeID,
          variationId: `new_${i}`,
          changeType: 'create',
          fieldChanges: varChanges,
        })
      }
    } else {
      // New variation (no product ID) - this is always a new variation
      const varChanges: FieldChange[] = []
      if (newVariation.propertyOption1 !== '') {
        varChanges.push(createAddedField('property_option_1', normalizeDescription(newVariation.propertyOption1)))
      }
      if (newVariation.propertyOption2 !== '') {
        varChanges.push(createAddedField('property_option_2', normalizeDescription(newVariation.propertyOption2)))
      }
      if (newVariation.propertyPrice !== null) {
        varChanges.push(createAddedField('price', newVariation.propertyPrice.toFixed(2)))
      }
      if (newVariation.propertyQuantity !== null) {
        varChanges.push(createAddedField('quantity', newVariation.propertyQuantity))
      }
      if (newVariation.propertySKU !== '') {
        varChanges.push(createAddedField('sku', newVariation.propertySKU))
      }

      variationChanges.push({
        changeId: varChangeID,
        variationId: `new_${i}`,
        changeType: 'create',
        fieldChanges: varChanges,
      })
    }
  }

  // Check for deleted variations (existing not in new)
  // BUT: if converting from non-variation to variation, don't mark the single product as deleted
  // unless it's explicitly in the new variations list with a matching product ID
  for (const productID of existingVariationsMap.keys()) {
    // If converting to variations and this is the only product, check if it should be converted
    if (isConvertingToVariations && existingVariationsMap.size === 1) {
      // The single product might become the first variation - check if it matches any new variation
      const matchesNewVariation = newListing.variations.some(
        (v) => v.productID === productID && !v.toDelete
      )
      if (!matchesNewVariation) {
        // The single product is being replaced by variations - this is expected
        // Don't mark it as deleted, it will be handled by the inventory update
        continue
      }
    }
    
    const found = newListing.variations.some(
      (v) => v.productID === productID && !v.toDelete
    )
    if (!found) {
      variationChanges.push({
        changeId: `${changeID}_var_del_${productID}`,
        variationId: productID.toString(),
        changeType: 'delete',
        fieldChanges: [],
      })
    }
  }

  return variationChanges
}

function handleUpdateChange(
  newListing: ProcessedListing,
  existing: Listing,
  changeID: string
): PreviewChange | null {
  const fieldChanges = compareListingFields(newListing, existing)
  const variationChanges = compareVariations(newListing, existing, changeID)
  
  if (fieldChanges.length === 0 && variationChanges.length === 0) {
    return null // No changes
  }
  
  return {
    changeId: changeID,
    changeType: 'update',
    listingId: newListing.listingID,
    title: newListing.title,
    fieldChanges,
    variationChanges,
  }
}

function buildPreviewResponse(changes: PreviewChange[]): PreviewResponse {
  const summary = {
    totalChanges: changes.length,
    creates: 0,
    updates: 0,
    deletes: 0,
  }

  for (const change of changes) {
    switch (change.changeType) {
      case 'create':
        summary.creates++
        break
      case 'update':
        summary.updates++
        break
      case 'delete':
        summary.deletes++
        break
    }
  }

  return {
    changes,
    summary,
  }
}

// ============================================================================
// Main Function
// ============================================================================

// Generate preview of changes
export async function previewUploadCSV(file: File): Promise<PreviewResponse> {
  await getValidAccessToken()
  const newListings = await parseUploadCSV(file)

  const listingIDsToFetch = newListings
    .filter(l => l.listingID > 0 && !l.toDelete)
    .map(l => l.listingID)

  const existingListingsMap = await fetchExistingListings(listingIDsToFetch)

  const changes: PreviewChange[] = []
  let changeCounter = 0

  for (const newListing of newListings) {
    changeCounter++
    const changeID = `change_${changeCounter}`

    // Handle delete
    if (newListing.toDelete) {
      const deleteChange = handleDeleteChange(
        newListing,
        existingListingsMap.get(newListing.listingID),
        changeID
      )
      if (deleteChange) changes.push(deleteChange)
      continue
    }

    // Handle create
    if (newListing.listingID === 0) {
      changes.push(handleCreateChange(newListing, changeID))
      continue
    }

    // Handle update
    const existing = existingListingsMap.get(newListing.listingID)
    if (!existing) continue

    const updateChange = handleUpdateChange(newListing, existing, changeID)
    if (updateChange) changes.push(updateChange)
  }

  return buildPreviewResponse(changes)
}

