// Preview service - generates preview of changes before applying them
// Ported from backend Go code

import { parseUploadCSV, ProcessedListing, ProcessedVariation } from './uploadService'
import { getListing, Listing } from './etsyApi'
import { getValidAccessToken } from './oauth'
import { logger } from '../utils/logger'

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

// Normalize description for comparison
function normalizeDescription(desc: string): string {
  if (desc === '') {
    return ''
  }

  // Decode HTML entities
  const textarea = document.createElement('textarea')
  textarea.innerHTML = desc
  let normalized = textarea.value

  // Handle numeric entities like &#39;
  normalized = normalized.replace(/&#(\d+);/g, (_match, numStr) => {
    const num = parseInt(numStr, 10)
    return String.fromCharCode(num)
  })

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

// Compare variation
function compareVariation(
  existing: Listing['inventory']['products'][0],
  newVariation: ProcessedVariation,
  inventory: Listing['inventory']
): FieldChange[] {
  const changes: FieldChange[] = []

  // Compare property options
  if (existing.property_values.length > 0) {
    const existingOption1 = normalizeDescription(
      existing.property_values[0].values.join(', ')
    )
    const newOption1 = normalizeDescription(newVariation.propertyOption1)
    if (newOption1 !== '' && existingOption1 !== newOption1) {
      changes.push({
        field: 'property_option_1',
        before: existingOption1,
        after: newOption1,
        changeType: 'modified',
      })
    }
    if (existing.property_values.length > 1) {
      const existingOption2 = normalizeDescription(
        existing.property_values[1].values.join(', ')
      )
      const newOption2 = normalizeDescription(newVariation.propertyOption2)
      if (newOption2 !== '' && existingOption2 !== newOption2) {
        changes.push({
          field: 'property_option_2',
          before: existingOption2,
          after: newOption2,
          changeType: 'modified',
        })
      }
    }
  }

  // Compare price (if on property)
  if (inventory.price_on_property.length > 0 && newVariation.propertyPrice !== null) {
    if (existing.offerings.length > 0) {
      const existingPrice =
        existing.offerings[0].price.amount / existing.offerings[0].price.divisor
      const epsilon = 0.01
      if (Math.abs(existingPrice - newVariation.propertyPrice) > epsilon) {
        changes.push({
          field: 'price',
          before: existingPrice.toFixed(2),
          after: newVariation.propertyPrice.toFixed(2),
          changeType: 'modified',
        })
      }
    }
  }

  // Compare quantity (if on property)
  if (
    inventory.quantity_on_property.length > 0 &&
    newVariation.propertyQuantity !== null
  ) {
    if (existing.offerings.length > 0) {
      if (existing.offerings[0].quantity !== newVariation.propertyQuantity) {
        changes.push({
          field: 'quantity',
          before: existing.offerings[0].quantity,
          after: newVariation.propertyQuantity,
          changeType: 'modified',
        })
      }
    }
  }

  // Compare SKU (if on property)
  if (inventory.sku_on_property.length > 0 && newVariation.propertySKU !== '') {
    if (existing.sku !== newVariation.propertySKU) {
      changes.push({
        field: 'sku',
        before: existing.sku,
        after: newVariation.propertySKU,
        changeType: 'modified',
      })
    }
  }

  // Compare is_enabled
  if (existing.offerings.length > 0) {
    if (existing.offerings[0].is_enabled !== newVariation.propertyIsEnabled) {
        changes.push({
          field: 'is_enabled',
          before: existing.offerings[0].is_enabled ? 'true' : 'false',
          after: newVariation.propertyIsEnabled ? 'true' : 'false',
          changeType: 'modified',
        })
    }
  }

  return changes
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
      changes.push({
        field: 'sku',
        before: existing.sku,
        after: newListing.sku,
        changeType: 'modified',
      })
    }
  }

  // Compare price (if not on property)
  if (inventory.price_on_property.length === 0 && newListing.price !== null) {
    if (existing.offerings.length > 0) {
      const existingPrice =
        existing.offerings[0].price.amount / existing.offerings[0].price.divisor
      const epsilon = 0.01
      if (Math.abs(existingPrice - newListing.price) > epsilon) {
        changes.push({
          field: 'price',
          before: existingPrice.toFixed(2),
          after: newListing.price.toFixed(2),
          changeType: 'modified',
        })
      }
    }
  }

  // Compare quantity (if not on property)
  if (inventory.quantity_on_property.length === 0 && newListing.quantity !== null) {
    if (existing.offerings.length > 0) {
      if (existing.offerings[0].quantity !== newListing.quantity) {
        changes.push({
          field: 'quantity',
          before: existing.offerings[0].quantity,
          after: newListing.quantity,
          changeType: 'modified',
        })
      }
    }
  }

  return changes
}

// Generate preview of changes
export async function previewUploadCSV(file: File): Promise<PreviewResponse> {
  // Get access token
  await getValidAccessToken()

  // Parse CSV
  const newListings = await parseUploadCSV(file)

  // Extract listing IDs from CSV (only fetch listings we're actually updating)
  const listingIDsToFetch = newListings
    .filter(l => l.listingID > 0 && !l.toDelete)
    .map(l => l.listingID)

  // Fetch only the existing listings we need for comparison
  const existingListingsMap = new Map<number, Listing>()
  
  if (listingIDsToFetch.length > 0) {
    // Fetch only the existing listings we need for comparison
    const batchSize = 10 // Fetch 10 listings in parallel
    
    for (let i = 0; i < listingIDsToFetch.length; i += batchSize) {
      const batch = listingIDsToFetch.slice(i, i + batchSize)
      const batchPromises = batch.map(id => 
        getListing(id).catch(error => {
          logger.error(`Error fetching listing ${id}:`, error)
          return null // Return null on error, we'll handle it later
        })
      )
      
      const batchResults = await Promise.all(batchPromises)
      
      batchResults.forEach((listing, idx) => {
        if (listing) {
          existingListingsMap.set(batch[idx], listing)
        }
      })
    }
  }

  const changes: PreviewChange[] = []
  let changeCounter = 0

  // Process each listing from CSV
  for (const newListing of newListings) {
    changeCounter++
    const changeID = `change_${changeCounter}`

    // Handle delete
    if (newListing.toDelete) {
      if (newListing.listingID === 0) {
        continue // Skip deletes without listing ID
      }

      const existing = existingListingsMap.get(newListing.listingID)
      if (!existing) {
        continue // Listing doesn't exist, skip
      }

      changes.push({
        changeId: changeID,
        changeType: 'delete',
        listingId: newListing.listingID,
        title: existing.title,
        fieldChanges: [],
        variationChanges: [],
      })
      continue
    }

    // Handle create (no listing ID)
    if (newListing.listingID === 0) {
      const fieldChanges: FieldChange[] = [
        {
          field: 'title',
          before: null,
          after: normalizeDescription(newListing.title),
          changeType: 'added',
        },
        {
          field: 'description',
          before: null,
          after: normalizeDescription(newListing.description),
          changeType: 'added',
        },
      ]

      if (newListing.price !== null) {
        fieldChanges.push({
          field: 'price',
          before: null,
          after: newListing.price.toFixed(2),
          changeType: 'added',
        })
      }
      if (newListing.quantity !== null) {
        fieldChanges.push({
          field: 'quantity',
          before: null,
          after: newListing.quantity,
          changeType: 'added',
        })
      }
      if (newListing.sku !== '') {
        fieldChanges.push({
          field: 'sku',
          before: null,
          after: newListing.sku,
          changeType: 'added',
        })
      }
      if (newListing.tags.length > 0) {
        const tagsNormalized = newListing.tags.map((tag) =>
          normalizeDescription(tag)
        )
        fieldChanges.push({
          field: 'tags',
          before: null,
          after: tagsNormalized.join(', '),
          changeType: 'added',
        })
      }
      if (newListing.status !== '') {
        fieldChanges.push({
          field: 'status',
          before: null,
          after: newListing.status,
          changeType: 'added',
        })
      }

      // Process variations for new listing
      const variationChanges: VariationChange[] = []
      for (let i = 0; i < newListing.variations.length; i++) {
        const variation = newListing.variations[i]
        if (variation.toDelete) {
          continue // Skip deleted variations in new listings
        }
        const varChanges: FieldChange[] = []
        if (variation.propertyOption1 !== '') {
          varChanges.push({
            field: 'property_option_1',
            before: null,
            after: normalizeDescription(variation.propertyOption1),
            changeType: 'added',
          })
        }
        if (variation.propertyOption2 !== '') {
          varChanges.push({
            field: 'property_option_2',
            before: null,
            after: normalizeDescription(variation.propertyOption2),
            changeType: 'added',
          })
        }
        if (variation.propertyPrice !== null) {
          varChanges.push({
            field: 'price',
            before: null,
            after: variation.propertyPrice.toFixed(2),
            changeType: 'added',
          })
        }
        if (variation.propertyQuantity !== null) {
          varChanges.push({
            field: 'quantity',
            before: null,
            after: variation.propertyQuantity,
            changeType: 'added',
          })
        }
        if (variation.propertySKU !== '') {
          varChanges.push({
            field: 'sku',
            before: null,
            after: variation.propertySKU,
            changeType: 'added',
          })
        }

        variationChanges.push({
          changeId: `${changeID}_var_${i}`,
          variationId: `new_${i}`,
          changeType: 'create',
          fieldChanges: varChanges,
        })
      }

      changes.push({
        changeId: changeID,
        changeType: 'create',
        listingId: 0,
        title: newListing.title,
        fieldChanges,
        variationChanges,
      })
      continue
    }

    // Handle update (has listing ID)
    const existing = existingListingsMap.get(newListing.listingID)
    if (!existing) {
      // Listing doesn't exist, skip
      continue
    }

    // Compare listing-level fields
    const fieldChanges: FieldChange[] = []

    // Title
    const existingTitle = normalizeDescription(existing.title)
    const newTitle = normalizeDescription(newListing.title)
    if (existingTitle !== newTitle) {
      fieldChanges.push({
        field: 'title',
        before: existingTitle,
        after: newTitle,
        changeType: 'modified',
      })
    }

    // Description
    const existingDesc = normalizeDescription(existing.description)
    const newDesc = normalizeDescription(newListing.description)
    if (existingDesc !== newDesc) {
      fieldChanges.push({
        field: 'description',
        before: existingDesc,
        after: newDesc,
        changeType: 'modified',
      })
    }

    // Status
    if (newListing.status !== '' && existing.state !== newListing.status) {
      fieldChanges.push({
        field: 'status',
        before: existing.state,
        after: newListing.status,
        changeType: 'modified',
      })
    }

    // Tags
    const existingTagsNormalized = existing.tags.map((tag) =>
      normalizeDescription(tag)
    )
    const newTagsNormalized = newListing.tags.map((tag) =>
      normalizeDescription(tag)
    )
    if (!tagsEqual(newTagsNormalized, existingTagsNormalized)) {
      fieldChanges.push({
        field: 'tags',
        before: existingTagsNormalized.join(', '),
        after: newTagsNormalized.join(', '),
        changeType: 'modified',
      })
    }

    // Price (only if not on property)
    if (newListing.price !== null && existing.inventory.price_on_property.length === 0) {
      const existingPrice = existing.price.amount / existing.price.divisor
      const epsilon = 0.01
      if (Math.abs(existingPrice - newListing.price) > epsilon) {
        fieldChanges.push({
          field: 'price',
          before: existingPrice.toFixed(2),
          after: newListing.price.toFixed(2),
          changeType: 'modified',
        })
      }
    }

    // Quantity (only if not on property)
    if (
      newListing.quantity !== null &&
      existing.inventory.quantity_on_property.length === 0
    ) {
      if (existing.quantity !== newListing.quantity) {
        fieldChanges.push({
          field: 'quantity',
          before: existing.quantity,
          after: newListing.quantity,
          changeType: 'modified',
        })
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
        fieldChanges.push({
          field: 'sku',
          before: existingSKU,
          after: newListing.sku,
          changeType: 'modified',
        })
      }
    }

    // Compare variations
    const variationChanges: VariationChange[] = []
    if (newListing.hasVariations) {
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

      // Process new variations
      for (let i = 0; i < newListing.variations.length; i++) {
        const newVariation = newListing.variations[i]
        const varChangeID = `${changeID}_var_${i}`

        if (newVariation.toDelete) {
          // Variation deletion
          if (newVariation.productID > 0) {
            if (existingVariationsMap.has(newVariation.productID)) {
              variationChanges.push({
                changeId: varChangeID,
                variationId: newVariation.productID.toString(),
                changeType: 'delete',
                fieldChanges: [],
              })
            }
          }
          continue
        }

        // Check if variation exists
        if (newVariation.productID > 0) {
          const existingVar = existingVariationsMap.get(newVariation.productID)
          if (existingVar) {
            // Update existing variation
            const varChanges = compareVariation(
              existingVar,
              newVariation,
              existing.inventory
            )
            if (varChanges.length > 0) {
              variationChanges.push({
                changeId: varChangeID,
                variationId: newVariation.productID.toString(),
                changeType: 'update',
                fieldChanges: varChanges,
              })
            }
          } else {
            // New variation (product ID doesn't exist)
            const varChanges: FieldChange[] = []
            if (newVariation.propertyOption1 !== '') {
              varChanges.push({
                field: 'property_option_1',
                before: null,
                after: normalizeDescription(newVariation.propertyOption1),
                changeType: 'added',
              })
            }
            if (newVariation.propertyPrice !== null) {
              varChanges.push({
                field: 'price',
                before: null,
                after: newVariation.propertyPrice.toFixed(2),
                changeType: 'added',
              })
            }
            if (newVariation.propertyQuantity !== null) {
              varChanges.push({
                field: 'quantity',
                before: null,
                after: newVariation.propertyQuantity,
                changeType: 'added',
              })
            }
            if (newVariation.propertySKU !== '') {
              varChanges.push({
                field: 'sku',
                before: null,
                after: newVariation.propertySKU,
                changeType: 'added',
              })
            }

            variationChanges.push({
              changeId: varChangeID,
              variationId: `new_${i}`,
              changeType: 'create',
              fieldChanges: varChanges,
            })
          }
        } else {
          // New variation (no product ID)
          const varChanges: FieldChange[] = []
          if (newVariation.propertyOption1 !== '') {
            varChanges.push({
              field: 'property_option_1',
              before: null,
              after: normalizeDescription(newVariation.propertyOption1),
              changeType: 'added',
            })
          }
          if (newVariation.propertyPrice !== null) {
            varChanges.push({
              field: 'price',
              before: null,
              after: newVariation.propertyPrice.toFixed(2),
              changeType: 'added',
            })
          }
          if (newVariation.propertyQuantity !== null) {
            varChanges.push({
              field: 'quantity',
              before: null,
              after: newVariation.propertyQuantity,
              changeType: 'added',
            })
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
      for (const productID of existingVariationsMap.keys()) {
        const found = newListing.variations.some(
          (v) => v.productID === productID && !v.toDelete
        )
        if (!found) {
          // Variation deleted
          variationChanges.push({
            changeId: `${changeID}_var_del_${productID}`,
            variationId: productID.toString(),
            changeType: 'delete',
            fieldChanges: [],
          })
        }
      }
    } else {
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
    }

    // Only add change if there are actual changes
    if (fieldChanges.length > 0 || variationChanges.length > 0) {
      changes.push({
        changeId: changeID,
        changeType: 'update',
        listingId: newListing.listingID,
        title: newListing.title,
        fieldChanges,
        variationChanges,
      })
    }
  }

  // Build summary
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

