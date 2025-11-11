// Sheet writing functions - writing listings to sheets and merging data

import { ListingsResponse, ListingStatus } from '../etsyApi'
import { convertListingsToCSV } from '../csvService'
import {
  safeParseInt,
  parseId,
  isEmpty,
  stringsEqual,
  pricesEqual,
  commaSeparatedEqual,
  mergeField,
} from '../../utils/dataParsing'
import {
  ensureSheetExists,
  readSheetData,
  batchUpdateSheet,
  parseCSVToRows,
  getSheetNameForStatus,
  getStatusesToProcess,
  groupListingsByStatus,
  buildRowIndexMaps,
  deleteSheetRows, // Add this import
} from './sheetUtils'
import { applySheetFormatting } from './sheetFormatting'
import { COLUMNS, getHeaderValue } from './constants'

// Helper to merge row data: only update fields that match Etsy, keep sheet values for mismatched fields
export function mergeRowData(etsyRow: string[], sheetRow: string[]): string[] {
  // Column indices:
  // 0: Listing ID (always update if matches)
  // 1: Title
  // 2: Description
  // 3: Status
  // 4: Tags
  // 5: Variation
  // 6-9: Property names/options
  // 10: Price
  // 11: Currency Code
  // 12: Quantity
  // 13: SKU
  // 14-16: Variation Price/Quantity/SKU
  // 17-20: Materials, Shipping Profile ID, Processing Min/Max
  // 21-25: Product ID, Property IDs (DO NOT EDIT columns)
  
  const merged = [...sheetRow] // Start with existing sheet row
  
  // Always update DO NOT EDIT columns (Product ID, Property IDs) - these are identifiers
  if (etsyRow[COLUMNS.product_id]) merged[COLUMNS.product_id] = etsyRow[COLUMNS.product_id] // Product ID
  if (etsyRow[COLUMNS.property_id_1]) merged[COLUMNS.property_id_1] = etsyRow[COLUMNS.property_id_1] // Property ID 1
  if (etsyRow[COLUMNS.property_option_ids_1]) merged[COLUMNS.property_option_ids_1] = etsyRow[COLUMNS.property_option_ids_1] // Property Option IDs 1
  if (etsyRow[COLUMNS.property_id_2]) merged[COLUMNS.property_id_2] = etsyRow[COLUMNS.property_id_2] // Property ID 2
  if (etsyRow[COLUMNS.property_option_ids_2]) merged[COLUMNS.property_option_ids_2] = etsyRow[COLUMNS.property_option_ids_2] // Property Option IDs 2
  
  // For other fields, only update if Etsy value matches what's in the sheet
  // If they don't match, it means user edited it, so keep the sheet value
  
  // Title
  merged[COLUMNS.title] = mergeField(etsyRow[COLUMNS.title], sheetRow[COLUMNS.title])
  
  // Description
  merged[COLUMNS.description] = mergeField(etsyRow[COLUMNS.description], sheetRow[COLUMNS.description])
  
  // Status - case-insensitive comparison
  merged[COLUMNS.status] = mergeField(etsyRow[COLUMNS.status], sheetRow[COLUMNS.status], (a, b) => 
    stringsEqual(a, b, { caseSensitive: false })
  )
  
  // Tags - compare as sets
  if (commaSeparatedEqual(etsyRow[COLUMNS.tags], sheetRow[COLUMNS.tags])) {
    merged[COLUMNS.tags] = etsyRow[COLUMNS.tags] || ''
  } else if (isEmpty(sheetRow[COLUMNS.tags])) {
    merged[COLUMNS.tags] = etsyRow[COLUMNS.tags] || ''
  }
  
  // Price - compare as numbers with epsilon
  if (pricesEqual(etsyRow[COLUMNS.price], sheetRow[COLUMNS.price])) {
    merged[COLUMNS.price] = etsyRow[COLUMNS.price] || ''
  } else if (isEmpty(sheetRow[COLUMNS.price])) {
    merged[COLUMNS.price] = etsyRow[COLUMNS.price] || ''
  }
  
  // Currency Code - case-insensitive comparison
  merged[COLUMNS.currency_code] = mergeField(etsyRow[COLUMNS.currency_code], sheetRow[COLUMNS.currency_code], (a, b) => 
    stringsEqual(a, b, { caseSensitive: false })
  )
  
  // Quantity
  const etsyQty = safeParseInt(etsyRow[COLUMNS.quantity], 0)
  const sheetQty = safeParseInt(sheetRow[COLUMNS.quantity], 0)
  if (etsyQty === sheetQty) {
    merged[COLUMNS.quantity] = etsyRow[COLUMNS.quantity] || ''
  } else if (isEmpty(sheetRow[COLUMNS.quantity])) {
    merged[COLUMNS.quantity] = etsyRow[COLUMNS.quantity] || ''
  }
  
  // SKU
  merged[COLUMNS.sku] = mergeField(etsyRow[COLUMNS.sku], sheetRow[COLUMNS.sku])
  
  // Variation Price - compare as numbers with epsilon
  if (pricesEqual(etsyRow[COLUMNS.variation_price], sheetRow[COLUMNS.variation_price])) {
    merged[COLUMNS.variation_price] = etsyRow[COLUMNS.variation_price] || ''
  } else if (isEmpty(sheetRow[COLUMNS.variation_price])) {
    merged[COLUMNS.variation_price] = etsyRow[COLUMNS.variation_price] || ''
  }
  
  // Variation Quantity
  const etsyVarQty = safeParseInt(etsyRow[COLUMNS.variation_quantity], 0)
  const sheetVarQty = safeParseInt(sheetRow[COLUMNS.variation_quantity], 0)
  if (etsyVarQty === sheetVarQty) {
    merged[COLUMNS.variation_quantity] = etsyRow[COLUMNS.variation_quantity] || ''
  } else if (isEmpty(sheetRow[COLUMNS.variation_quantity])) {
    merged[COLUMNS.variation_quantity] = etsyRow[COLUMNS.variation_quantity] || ''
  }
  
  // Variation SKU
  merged[COLUMNS.variation_sku] = mergeField(etsyRow[COLUMNS.variation_sku], sheetRow[COLUMNS.variation_sku])
  
  // Materials - compare as sets
  if (commaSeparatedEqual(etsyRow[COLUMNS.materials], sheetRow[COLUMNS.materials])) {
    merged[COLUMNS.materials] = etsyRow[COLUMNS.materials] || ''
  } else if (isEmpty(sheetRow[COLUMNS.materials])) {
    merged[COLUMNS.materials] = etsyRow[COLUMNS.materials] || ''
  }
  
  // Shipping Profile ID
  const etsyShipping = safeParseInt(etsyRow[COLUMNS.shipping_profile_id], 0)
  const sheetShipping = safeParseInt(sheetRow[COLUMNS.shipping_profile_id], 0)
  if (etsyShipping === sheetShipping) {
    merged[COLUMNS.shipping_profile_id] = etsyRow[COLUMNS.shipping_profile_id] || ''
  } else if (isEmpty(sheetRow[COLUMNS.shipping_profile_id])) {
    merged[COLUMNS.shipping_profile_id] = etsyRow[COLUMNS.shipping_profile_id] || ''
  }
  
  // Processing Min
  const etsyProcMin = safeParseInt(etsyRow[COLUMNS.processing_min], 0)
  const sheetProcMin = safeParseInt(sheetRow[COLUMNS.processing_min], 0)
  if (etsyProcMin === sheetProcMin) {
    merged[COLUMNS.processing_min] = etsyRow[COLUMNS.processing_min] || ''
  } else if (isEmpty(sheetRow[COLUMNS.processing_min])) {
    merged[COLUMNS.processing_min] = etsyRow[COLUMNS.processing_min] || ''
  }
  
  // Processing Max
  const etsyProcMax = safeParseInt(etsyRow[COLUMNS.processing_max], 0)
  const sheetProcMax = safeParseInt(sheetRow[COLUMNS.processing_max], 0)
  if (etsyProcMax === sheetProcMax) {
    merged[COLUMNS.processing_max] = etsyRow[COLUMNS.processing_max] || ''
  } else if (isEmpty(sheetRow[COLUMNS.processing_max])) {
    merged[COLUMNS.processing_max] = etsyRow[COLUMNS.processing_max] || ''
  }
  
  // Property names/options - only update if they match
  for (let i = COLUMNS.property_name_1; i <= COLUMNS.property_option_2; i++) {
    merged[i] = mergeField(etsyRow[i], sheetRow[i])
  }
  
  return merged
}

// Add helper function to detect if row changed
function hasRowChanged(newRow: string[], existingRow: string[]): boolean {
  // Quick check: compare lengths first
  if (newRow.length !== existingRow.length) return true
  
  // Compare key fields that matter
  const keyFields = [
    COLUMNS.listing_id,
    COLUMNS.title,
    COLUMNS.description,
    COLUMNS.status,
    COLUMNS.price,
    COLUMNS.quantity,
    COLUMNS.product_id,
    COLUMNS.variation_price,
    COLUMNS.variation_quantity,
  ]
  
  for (const fieldIndex of keyFields) {
    const newVal = newRow[fieldIndex]?.trim() || ''
    const existingVal = existingRow[fieldIndex]?.trim() || ''
    if (newVal !== existingVal) {
      return true
    }
  }
  
  return false
}

// Write listings to Google Sheet - creates separate sheets per status
// requestedStatus: if provided, only process this status. If undefined, process all statuses.
// Returns the sheet name that was written to (for opening the correct tab)
export async function writeListingsToSheet(
  sheetId: string,
  listings: ListingsResponse,
  requestedStatus?: ListingStatus
): Promise<string | null> {

  // Validate status and return all possible statuses
  const statusesToProcess = getStatusesToProcess(requestedStatus)
  
  // Group listings by status
  const listingsByStatus = groupListingsByStatus(listings)
  
  // Collect all listing IDs and product IDs from Etsy for comparison
  const etsyListingIds = new Set<number>()
  const etsyProductIds = new Set<number>()
  for (const listing of listings.results) {
    const listingIdNum = parseId(listing.listing_id?.toString())
    if (listingIdNum !== null) {
      etsyListingIds.add(listingIdNum)
    }
    // Collect all product IDs from this listing
    if (listing.inventory?.products) {
      for (const product of listing.inventory.products) {
        if (!product.is_deleted && product.product_id) {
          etsyProductIds.add(product.product_id)
        }
      }
    }
  }
  
  // Process only the requested statuses
  let writtenSheetName: string | null = null
  
  // Process each status
  for (const status of statusesToProcess) {
    // Get sheet name for status
    const sheetName = getSheetNameForStatus(status)
    // Get listings for status
    const statusListings = listingsByStatus.get(status) || []
    
    // Ensure sheet exists (create if it doesn't exist)
    await ensureSheetExists(sheetId, sheetName)
    
    // Read existing data (don't clear - we'll update or append)
    const existingData = await readSheetData(sheetId, sheetName)
    const existingRows = existingData.values || []
    
    const { listingIdToRowIndex, productIdToRowIndex, existingHeaderRowIndex } = buildRowIndexMaps(existingRows)
    
    // Convert new listings to CSV format
    const csvContent = convertListingsToCSV({ count: statusListings.length, results: statusListings })
    const allRows = parseCSVToRows(csvContent)
    
    // Find header row in new data
    let newHeaderRowIndex = -1
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i][COLUMNS.listing_id] === getHeaderValue('listing_id')) {
        newHeaderRowIndex = i
        break
      }
    }
    
    if (newHeaderRowIndex >= 0) {
      // Get header and data rows
      const headerRow = allRows[newHeaderRowIndex]
      const newDataRows = allRows.slice(newHeaderRowIndex + 1)
      
      // Ensure header exists (update if needed or create if missing)
      if (existingHeaderRowIndex < 0) {
        // No header exists, write it
        await batchUpdateSheet(sheetId, sheetName, [headerRow], 1)
      }
      
      // Separate rows into updates and appends
      const rowsToUpdate: Array<{ rowIndex: number; data: string[]; existingRow: string[] }> = []
      const rowsToAppend: string[][] = []
      const processedRowIndices = new Set<number>() // Track which rows we've processed
      
      for (const newRow of newDataRows) {
        const listingId = newRow[COLUMNS.listing_id]?.trim()
        const productId = newRow[COLUMNS.product_id]?.trim() // Product ID
        
        let rowIndex: number | undefined
        let existingRow: string[] | undefined
        
        // Priority: Product ID match (for variations) > Listing ID match (for first row)
        const productIdNum = parseId(productId)
        if (productIdNum !== null) {
          rowIndex = productIdToRowIndex.get(productIdNum)
          if (rowIndex && existingRows.length > rowIndex - 1) {
            existingRow = existingRows[rowIndex - 1] || [] // -1 because rowIndex is 1-based
          }
        }
        
        // If no product ID match, try listing ID match (for first row of listing)
        if (!rowIndex) {
          const listingIdNum = parseId(listingId)
          if (listingIdNum !== null) {
            rowIndex = listingIdToRowIndex.get(listingIdNum)
            if (rowIndex && existingRows.length > rowIndex - 1) {
              existingRow = existingRows[rowIndex - 1] || []
            }
          }
        }
        
        if (rowIndex && existingRow) {
          // Merge: only update fields that match Etsy, keep sheet values for mismatched fields
          const mergedRow = mergeRowData(newRow, existingRow)
          
          // Only update if something actually changed
          if (hasRowChanged(mergedRow, existingRow)) {
            rowsToUpdate.push({ rowIndex, data: mergedRow, existingRow })
            processedRowIndices.add(rowIndex)
          } else {
            // Row unchanged, just mark as processed
            processedRowIndices.add(rowIndex)
          }
        } else {
          // Append new row
          rowsToAppend.push(newRow)
        }
      }
      
      // Identify rows to delete: rows in sheet that don't exist in Etsy
      const rowsToDelete: number[] = []
      if (existingHeaderRowIndex >= 0) {
        for (let i = existingHeaderRowIndex + 1; i < existingRows.length; i++) {
          const row = existingRows[i] || []
          const rowListingId = parseId(row[COLUMNS.listing_id]?.trim())
          const rowProductId = parseId(row[COLUMNS.product_id]?.trim())
          const rowIndex = i + 1 // Convert to 1-based
          
          // Skip if we've already processed this row (it's being updated)
          if (processedRowIndices.has(rowIndex)) {
            continue
          }
          
          // Delete if:
          // 1. Row has a listing ID that's not in Etsy (main listing row or variation with listing ID)
          // 2. Row has a product ID that's not in Etsy (variation rows)
          // Note: We check both conditions because a row could have both listing ID and product ID
          const shouldDelete = 
            (rowListingId !== null && !etsyListingIds.has(rowListingId)) ||
            (rowProductId !== null && !etsyProductIds.has(rowProductId))
          
          if (shouldDelete) {
            rowsToDelete.push(rowIndex)
          }
        }
      }
      
      // Group updates by row index to batch them efficiently (reuse this map later)
      const updatesByRow = new Map<number, string[]>()
      for (const update of rowsToUpdate) {
        updatesByRow.set(update.rowIndex, update.data)
      }
      
      // Update existing rows in batches
      if (rowsToUpdate.length > 0) {
        // Update each row (Google Sheets API requires individual updates for different rows)
        let updateCount = 0
        for (const [rowIndex, data] of updatesByRow) {
          await batchUpdateSheet(sheetId, sheetName, [data], rowIndex)
          updateCount++
          
          // Rate limit: small delay between updates, longer delay every 10 updates
          if (updateCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1100))
          } else {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
      }
      
      // Delete orphaned rows (rows that exist in sheet but not in Etsy)
      // Do this before appending so row indices are correct
      if (rowsToDelete.length > 0) {
        await deleteSheetRows(sheetId, sheetName, rowsToDelete)
      }
      
      // Append new rows
      // Calculate the correct starting row after deletions
      // existingRows.length is the total rows (0-based array), which equals the last row index (1-based in sheet)
      // After deletions, the last row index = original last row - number of deletions
      if (rowsToAppend.length > 0) {
        // In 1-based sheet indexing: row 1 is header, row 2+ are data rows
        // existingRows.length (0-based array length) = last row index (1-based in sheet)
        // After deletions, last row index = existingRows.length - rowsToDelete.length
        const lastRowIndex = existingRows.length - rowsToDelete.length
        
        const batchSize = 1000
        for (let i = 0; i < rowsToAppend.length; i += batchSize) {
          const batch = rowsToAppend.slice(i, i + batchSize)
          // Append after the last existing row (after deletions)
          const startRow = lastRowIndex + 1 + i
          await batchUpdateSheet(sheetId, sheetName, batch, startRow)
          
          // Rate limit: 60 requests/minute = 1 request/second
          if (i + batchSize < rowsToAppend.length) {
            await new Promise(resolve => setTimeout(resolve, 1100))
          }
        }
      }

      // Prepare allDataRows for formatting (include all rows including updates and appends)
      // Maintain original row order: existing rows (updated or unchanged), then appended rows
      const allDataRows: string[][] = []

      // Build a set of deleted row indices for quick lookup
      const deletedRowIndices = new Set(rowsToDelete)

      // Iterate through existing rows in order, replacing with updates where needed
      for (let i = existingHeaderRowIndex + 1; i < existingRows.length; i++) {
        const rowIndex = i + 1 // Convert to 1-based
        
        // Skip deleted rows
        if (deletedRowIndices.has(rowIndex)) {
          continue
        }
        
        // Use updated row if available, otherwise use existing row
        if (updatesByRow.has(rowIndex)) {
          allDataRows.push(updatesByRow.get(rowIndex)!)
        } else {
          // Row wasn't updated or deleted, keep original
          allDataRows.push(existingRows[i] || [])
        }
      }

      // Add appended rows at the end
      allDataRows.push(...rowsToAppend)

      // Now use allDataRows for formatting instead of re-reading
      await applySheetFormatting(sheetId, sheetName, headerRow.length, allDataRows)
      
      // Track the first sheet written (or the requested status sheet)
      if (!writtenSheetName || (requestedStatus && status === requestedStatus.toLowerCase())) {
        writtenSheetName = sheetName
      }
      
      // Rate limit between sheets
      await new Promise(resolve => setTimeout(resolve, 1100))
    }
  }
  
  return writtenSheetName
}

