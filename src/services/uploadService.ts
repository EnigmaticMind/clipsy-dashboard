// Upload service - parses CSV files for upload
// Ported from backend Go code

import Papa from 'papaparse'
import {
  findHeaderRowIndex,
  safeGetCell,
  safeParseInt,
  parseCommaSeparated,
  parseCommaSeparatedIds,
  padRow,
  parseId,
} from '../utils/dataParsing'

export interface ProcessedListing {
  listingID: number
  title: string
  description: string
  sku: string
  status: string
  quantity: number | null
  tags: string[]
  price: number | null
  currencyCode: string
  hasVariations: boolean
  variations: ProcessedVariation[]
  toDelete: boolean
  materials?: string[] // Materials used in the product
  shippingProfileID?: number // Shipping profile ID
  processingMin?: number // Minimum processing time in days
  processingMax?: number // Maximum processing time in days
}

export interface ProcessedVariation {
  productID: number
  propertyName1: string
  propertyOption1: string
  propertyName2: string
  propertyOption2: string
  propertySKU: string
  propertyQuantity: number | null
  propertyPrice: number | null
  propertyID1: number
  propertyOptionIDs1: number[]
  propertyID2: number
  propertyOptionIDs2: number[]
  toDelete: boolean
}

// Parse uploaded CSV file
export async function parseUploadCSV(file: File): Promise<ProcessedListing[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const listings = parseCSVRecords(results.data as string[][])
          resolve(listings)
        } catch (error) {
          reject(error)
        }
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`))
      },
    })
  })
}

function parseCSVRecords(records: string[][]): ProcessedListing[] {
  if (records.length < 5) {
    throw new Error('CSV file is too short or invalid')
  }

  // Find header row (look for "Listing ID" or "Title" in first columns)
  const headerRowIndex = findHeaderRowIndex(records, ['listing id', 'title'])

  if (headerRowIndex === -1) {
    throw new Error('Could not find header row in CSV')
  }

  // New CSV format has 26 columns (added Materials, Shipping Profile ID, Processing Min, Processing Max)
  const minColumns = 26

  const listings: ProcessedListing[] = []
  let currentListing: ProcessedListing | null = null
  let currentListingID = 0

  for (let i = headerRowIndex + 1; i < records.length; i++) {
    let record = records[i]

    // Skip empty rows
    if (record.length === 0 || (record.length === 1 && record[0]?.trim() === '')) {
      continue
    }

    // Pad record if needed
    if (record.length < minColumns) {
      if (record.length < 15) {
        continue // Skip rows that are too short
      }
      record = padRow(record, minColumns)
    }

    // New CSV structure (26 columns):
    // 0: Listing ID, 1: Title, 2: Description, 3: Status, 4: Tags,
    // 5: Variation, 6: Property Name 1, 7: Property Option 1, 8: Property Name 2, 9: Property Option 2,
    // 10: Price, 11: Currency Code, 12: Quantity, 13: SKU,
    // 14: Variation Price, 15: Variation Quantity, 16: Variation SKU,
    // 17: Materials, 18: Shipping Profile ID, 19: Processing Min, 20: Processing Max,
    // 21: Product ID, 22: Property ID 1, 23: Property Option IDs 1, 24: Property ID 2, 25: Property Option IDs 2

    const row = {
      listingID: safeGetCell(record, 0),
      title: safeGetCell(record, 1),
      description: safeGetCell(record, 2),
      status: safeGetCell(record, 3),
      tags: safeGetCell(record, 4),
      variation: safeGetCell(record, 5),  // Display only, can ignore
      propertyName1: safeGetCell(record, 6),
      propertyOption1: safeGetCell(record, 7),
      propertyName2: safeGetCell(record, 8),
      propertyOption2: safeGetCell(record, 9),
      price: safeGetCell(record, 10),
      currencyCode: safeGetCell(record, 11),
      quantity: safeGetCell(record, 12),
      sku: safeGetCell(record, 13),
      variationPrice: safeGetCell(record, 14),
      variationQuantity: safeGetCell(record, 15),
      variationSKU: safeGetCell(record, 16),
      materials: safeGetCell(record, 17),  // Changed from 22
      shippingProfileID: safeGetCell(record, 18),  // Changed from 23
      processingMin: safeGetCell(record, 19),  // Changed from 24
      processingMax: safeGetCell(record, 20),  // Changed from 25
      productID: safeGetCell(record, 21),  // Changed from 17 - THIS IS THE KEY FIX
      propertyID1: safeGetCell(record, 22),  // Changed from 18
      propertyOptionIDs1: safeGetCell(record, 23),  // Changed from 19
      propertyID2: safeGetCell(record, 24),  // Changed from 20
      propertyOptionIDs2: safeGetCell(record, 25),  // Changed from 21
    }

    // Determine if this is a new listing row
    // New format: Title/Description/Status/Tags are only on first row, Listing ID may be empty on variation rows
    const listingID = safeParseInt(row.listingID, 0)
    
    // Check if this row has variation data (property options)
    const hasVariationData = row.propertyOption1 !== '' || row.propertyOption2 !== ''
    
    let isNewListing = false
    if (listingID > 0) {
      // Has Listing ID
      if (listingID === currentListingID && currentListing !== null) {
        // Same Listing ID as current - this is a variation row or update to existing listing
        // If it has variation data and no title (or title matches), it's definitely a variation row
        isNewListing = false
      } else if (hasVariationData && row.title === '') {
        // Has Listing ID, has variation data, but no title - this is a variation row
        // Check if this Listing ID matches any existing listing we've seen
        // If currentListing exists and has this Listing ID, it's a variation
        if (currentListing !== null && currentListing.listingID === listingID) {
          isNewListing = false
        } else {
          // This is a variation row for a listing we haven't processed the header for yet
          // We can't process it without the listing header, so skip it for now
          // (The header row should come first in the CSV)
          continue
        }
      } else {
        // Different Listing ID or has title - new listing
        isNewListing = true
      }
    } else if (row.title !== '') {
      // Has Title (first row of a listing) - new listing if we don't have a current listing or title is different
      isNewListing = currentListing === null || row.title !== currentListing.title
    } else {
      // No Listing ID and no Title - this is a variation row, use current listing's data
      if (currentListing === null) {
        // Skip rows without listing data
        continue
      }
      // This is a variation row - use current listing's title/description/status/tags
      // We'll handle this below
      isNewListing = false
    }

    if (isNewListing) {
      // New listing row (first row with title/description/status/tags)
      if (currentListing !== null) {
        listings.push(currentListing)
      }

      currentListingID = listingID
      const toDelete = row.sku.toUpperCase() === 'DELETE'

      // Determine if has variations (check if Property Option columns have values)
      const hasVariations = row.propertyOption1 !== '' || row.propertyOption2 !== ''

      // Parse materials (comma-separated string)
      const materialsArray = parseCommaSeparated(row.materials, { filterEmpty: true })
      const materials = materialsArray.length > 0 ? materialsArray : undefined

      // Parse shipping profile ID
      const shippingProfileID = parseId(row.shippingProfileID) || undefined

      // Parse processing times
      const processingMin = parseId(row.processingMin) || undefined
      const processingMax = parseId(row.processingMax) || undefined

      currentListing = {
        listingID,
        title: row.title,
        description: row.description,
        sku: row.sku,
        status: row.status,
        tags: parseTags(row.tags),
        currencyCode: row.currencyCode,
        hasVariations,
        variations: [],
        toDelete,
        quantity: row.quantity ? safeParseInt(row.quantity, 0) || null : null,
        price: parsePrice(row.price),
        materials,
        shippingProfileID,
        processingMin,
        processingMax,
      }

      // If this row has variation data, add it as first variation
      if (hasVariations && (row.propertyOption1 !== '' || row.propertyOption2 !== '')) {
        const variation = parseVariation(row)
        currentListing.variations.push(variation)
        
        // If listing price is empty but variation has a price, use variation price as listing price
        // (Etsy requires a listing-level price even when price is on property)
        if (currentListing.price === null && variation.propertyPrice !== null) {
          currentListing.price = variation.propertyPrice
        }
      }
    } else if (currentListing !== null) {
      // Variation row (same listing, title/description/status/tags are empty or same)
      // This can happen when:
      // 1. Listing ID matches current listing ID
      // 2. No Listing ID and no Title (pure variation row)
      // 3. Listing ID matches but row has variation data
      
      // Update listing-level fields if they're provided (for backwards compatibility)
      if (row.title !== '') {
        currentListing.title = row.title
      }
      if (row.description !== '') {
        currentListing.description = row.description
      }
      if (row.status !== '') {
        currentListing.status = row.status
      }
      if (row.tags !== '') {
        currentListing.tags = parseTags(row.tags)
      }
      
      // Add variation if this row has variation data (property options)
      // If we encounter a variation row, the listing has variations (even if first row didn't indicate it)
      if (hasVariationData) {
        // Update hasVariations flag if this is the first variation we encounter
        if (!currentListing.hasVariations) {
          currentListing.hasVariations = true
        }
        const variation = parseVariation(row)
        currentListing.variations.push(variation)
      }
    } else {
      // currentListing is null but isNewListing is false
      // This shouldn't happen, but if it does and we have variation data with a Listing ID,
      // we might need to create a new listing entry
      if (listingID > 0 && hasVariationData && row.title === '') {
        // This is a variation row for a listing we haven't seen the header for yet
        // We can't process it without the listing header, so skip it
        // (This is an edge case that shouldn't happen in normal usage)
        continue
      }
    }
  }

  // Add the last listing
  if (currentListing !== null) {
    listings.push(currentListing)
  }

  return listings
}

// safeGetCell is now imported from dataParsing utils

// Parse price from string, handling currency symbols, commas, and whitespace
function parsePrice(priceStr: string): number | null {
  if (!priceStr || priceStr.trim() === '') {
    return null
  }
  
  // Remove currency symbols, commas, and whitespace
  // Handle common formats: $10.99, 10,99, €10.99, £10.99, etc.
  let cleaned = priceStr.trim()
    .replace(/[$€£¥₹,]/g, '') // Remove currency symbols and commas
    .replace(/\s+/g, '') // Remove whitespace
  
  // Parse as float
  const parsed = parseFloat(cleaned)
  
  // Return null if NaN or invalid
  if (isNaN(parsed) || !isFinite(parsed)) {
    return null
  }
  
  return parsed
}

function parseTags(tagsStr: string): string[] {
  return parseCommaSeparated(tagsStr, { filterEmpty: true })
}

function parseVariation(row: {
  propertyName1: string
  propertyOption1: string
  propertyName2: string
  propertyOption2: string
  variationPrice: string
  variationQuantity: string
  variationSKU: string
  propertyID1: string
  propertyOptionIDs1: string
  propertyID2: string
  propertyOptionIDs2: string
  productID: string
}): ProcessedVariation {
  const variation: ProcessedVariation = {
    productID: 0,
    propertyName1: row.propertyName1,
    propertyOption1: row.propertyOption1,
    propertyName2: row.propertyName2,
    propertyOption2: row.propertyOption2,
    propertySKU: row.variationSKU || '',
    propertyQuantity: row.variationQuantity
      ? safeParseInt(row.variationQuantity, 0) || null
      : null,
    propertyPrice: parsePrice(row.variationPrice),
    propertyID1: safeParseInt(row.propertyID1, 0),
    propertyOptionIDs1: parseCommaSeparatedIds(row.propertyOptionIDs1),
    propertyID2: safeParseInt(row.propertyID2, 0),
    propertyOptionIDs2: parseCommaSeparatedIds(row.propertyOptionIDs2),
    toDelete: row.variationSKU.toUpperCase() === 'DELETE',
  }

  // Parse Product ID from Product ID column
  const productId = parseId(row.productID)
  if (productId !== null) {
    variation.productID = productId
  }

  return variation
}
