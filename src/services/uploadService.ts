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
import { COLUMNS, LISTING_COLUMN_COUNT } from './googleSheets/constants'

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

// ============================================================================
// Helper Types and Functions
// ============================================================================

interface ParsedRow {
  listingID: string
  title: string
  description: string
  status: string
  tags: string
  variation: string
  propertyName1: string
  propertyOption1: string
  propertyName2: string
  propertyOption2: string
  price: string
  currencyCode: string
  quantity: string
  sku: string
  variationPrice: string
  variationQuantity: string
  variationSKU: string
  materials: string
  shippingProfileID: string
  processingMin: string
  processingMax: string
  productID: string
  propertyID1: string
  propertyOptionIDs1: string
  propertyID2: string
  propertyOptionIDs2: string
}

interface RowType {
  isNewListing: boolean
  isVariation: boolean
  listingID: number
}

function parseRow(record: string[]): ParsedRow {
  return {
    listingID: safeGetCell(record, COLUMNS.listing_id),
    title: safeGetCell(record, COLUMNS.title),
    description: safeGetCell(record, COLUMNS.description),
    status: safeGetCell(record, COLUMNS.status),
    tags: safeGetCell(record, COLUMNS.tags),
    variation: safeGetCell(record, COLUMNS.variation), // Display only, can ignore
    propertyName1: safeGetCell(record, COLUMNS.property_name_1),
    propertyOption1: safeGetCell(record, COLUMNS.property_option_1),
    propertyName2: safeGetCell(record, COLUMNS.property_name_2),
    propertyOption2: safeGetCell(record, COLUMNS.property_option_2),
    price: safeGetCell(record, COLUMNS.price),
    currencyCode: safeGetCell(record, COLUMNS.currency_code),
    quantity: safeGetCell(record, COLUMNS.quantity),
    sku: safeGetCell(record, COLUMNS.sku),
    variationPrice: safeGetCell(record, COLUMNS.variation_price),
    variationQuantity: safeGetCell(record, COLUMNS.variation_quantity),
    variationSKU: safeGetCell(record, COLUMNS.variation_sku),
    materials: safeGetCell(record, COLUMNS.materials),
    shippingProfileID: safeGetCell(record, COLUMNS.shipping_profile_id),
    processingMin: safeGetCell(record, COLUMNS.processing_min),
    processingMax: safeGetCell(record, COLUMNS.processing_max),
    productID: safeGetCell(record, COLUMNS.product_id),
    propertyID1: safeGetCell(record, COLUMNS.property_id_1),
    propertyOptionIDs1: safeGetCell(record, COLUMNS.property_option_ids_1),
    propertyID2: safeGetCell(record, COLUMNS.property_id_2),
    propertyOptionIDs2: safeGetCell(record, COLUMNS.property_option_ids_2),
  }
}

function determineRowType(
  row: ParsedRow,
  currentListing: ProcessedListing | null,
  currentListingID: number,
  existingListings: ProcessedListing[]
): RowType {
  // Check if this is a new listing row (has listing info but no variation data)
  const hasListingInfo = row.title !== '' || row.description !== '' || row.status !== ''
  const hasVariationData = row.propertyOption1 !== '' || row.propertyOption2 !== ''
  
  // If it has listing info but no variation data, it's a listing row
  if (hasListingInfo && !hasVariationData) {
    return {
      isNewListing: true,
      isVariation: false,
      listingID: safeParseInt(row.listingID, 0)
    }
  }
  
  // If it has variation data, it's a variation row
  if (hasVariationData) {
    // Try to find which listing this variation belongs to
    const listingID = safeParseInt(row.listingID, 0)
    
    // Check if it belongs to current listing
    if (currentListing !== null && (listingID === currentListingID || listingID === 0)) {
      return {
        isNewListing: false,
        isVariation: true,
        listingID: currentListingID
      }
    }
    
    // Check if it belongs to an already-processed listing
    if (listingID > 0) {
      const targetListing = existingListings.find(l => l.listingID === listingID)
      if (targetListing) {
        return {
          isNewListing: false,
          isVariation: true,
          listingID: listingID
        }
      }
    }
    
    // If no listing found but has variation data, it's a variation for current listing
    if (currentListing !== null) {
      return {
        isNewListing: false,
        isVariation: true,
        listingID: currentListingID
      }
    }
  }
  
  // Default: not a valid row
  return {
    isNewListing: false,
    isVariation: false,
    listingID: 0
  }
}

function createNewListing(row: ParsedRow): ProcessedListing {
  const listingID = safeParseInt(row.listingID, 0)
  const toDelete = row.sku.toUpperCase() === 'DELETE'
  // Don't check for variations here - variations come on separate rows
  const hasVariations = false
  
  const listing: ProcessedListing = {
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
    materials: parseMaterials(row.materials),
    shippingProfileID: parseId(row.shippingProfileID) || undefined,
    processingMin: parseId(row.processingMin) || undefined,
    processingMax: parseId(row.processingMax) || undefined,
  }
  
  // Don't add first variation here - variations come on separate rows
  // The hasVariations flag will be set when the first variation is added
  
  return listing
}

function updateListingFields(
  listing: ProcessedListing,
  row: ParsedRow
): void {
  if (row.title !== '') listing.title = row.title
  if (row.description !== '') listing.description = row.description
  if (row.status !== '') listing.status = row.status
  if (row.tags !== '') listing.tags = parseTags(row.tags)
}

function addVariationToListing(
  listing: ProcessedListing,
  row: ParsedRow
): void {
  const hasVariationData = row.propertyOption1 !== '' || row.propertyOption2 !== ''
  
  if (!hasVariationData) return
  
  // Update hasVariations flag
  if (!listing.hasVariations) {
    listing.hasVariations = true
  }
  
  // Add variation
  const variation = parseVariation(row)
  listing.variations.push(variation)
}

function parseMaterials(materialsStr: string): string[] | undefined {
  const materialsArray = parseCommaSeparated(materialsStr, { filterEmpty: true })
  return materialsArray.length > 0 ? materialsArray : undefined
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

  const minColumns = LISTING_COLUMN_COUNT

  const listings: ProcessedListing[] = []
  const orphanedVariationRows: Array<{ row: ParsedRow; listingID: number }> = []
  let currentListing: ProcessedListing | null = null
  let currentListingID = 0

  // First pass: process all rows
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

    const row = parseRow(record)

    const rowType = determineRowType(row, currentListing, currentListingID, listings)
    
    // Skip invalid rows
    if (!rowType.isNewListing && !rowType.isVariation) {
      continue
    }

    if (rowType.isNewListing) {
      // Save previous listing
      if (currentListing !== null) {
        listings.push(currentListing)
      }

      // Create new listing
      currentListing = createNewListing(row)
      currentListingID = currentListing.listingID
    } else if (currentListing !== null && rowType.isVariation) {
      // Variation row for current listing
      // Update listing fields (for backwards compatibility)
      updateListingFields(currentListing, row)
      
      // Add variation
      addVariationToListing(currentListing, row)
    } else if (rowType.isVariation && rowType.listingID > 0) {
      // Variation row for a listing that was already processed
      // Find the listing in the already-processed list
      const targetListing = listings.find(l => l.listingID === rowType.listingID)
      if (targetListing) {
        addVariationToListing(targetListing, row)
      } else {
        // Listing not found yet - store as orphaned variation to process in second pass
        orphanedVariationRows.push({ row, listingID: rowType.listingID })
      }
    } else if (rowType.isVariation) {
      // Variation row with no listing ID and no current listing
      // This shouldn't happen, but store it as orphaned
      const listingID = safeParseInt(row.listingID, 0)
      if (listingID > 0) {
        orphanedVariationRows.push({ row, listingID })
      }
    }
  }

  // Add the last listing
  if (currentListing !== null) {
    listings.push(currentListing)
  }

  // Second pass: match orphaned variation rows to their listings
  for (const { row, listingID } of orphanedVariationRows) {
    const targetListing = listings.find(l => l.listingID === listingID)
    if (targetListing) {
      addVariationToListing(targetListing, row)
    } else {
      // Listing still not found - this might be a new listing that needs to be created
      // For now, we'll skip it (the listing should exist in the CSV)
      console.warn(`Variation row references listing ID ${listingID} which was not found in CSV`)
    }
  }

  return listings
}

// ============================================================================
// Parsing Functions
// ============================================================================

// Parse price from string, handling currency symbols, commas, and whitespace
function parsePrice(priceStr: string): number | null {
  if (!priceStr || priceStr.trim() === '') {
    return null
  }
  
  // Remove currency symbols, commas, and whitespace
  // Handle common formats: $10.99, 10,99, €10.99, £10.99, etc.
  const cleaned = priceStr.trim()
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
