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
          rowsToUpdate.push({ rowIndex, data: mergedRow, existingRow })
        } else {
          // Append new row
          rowsToAppend.push(newRow)
        }
      }
      
      // Update existing rows in batches
      if (rowsToUpdate.length > 0) {
        // Group updates by row index to batch them efficiently
        const updatesByRow = new Map<number, string[]>()
        for (const update of rowsToUpdate) {
          updatesByRow.set(update.rowIndex, update.data)
        }
        
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
      
      // Append new rows
      if (rowsToAppend.length > 0) {
        // Find the last row with data (existing rows + header)
        const lastRowIndex = existingRows.length > 0 ? existingRows.length : 1
        
        const batchSize = 1000
        for (let i = 0; i < rowsToAppend.length; i += batchSize) {
          const batch = rowsToAppend.slice(i, i + batchSize)
          const startRow = lastRowIndex + i + 1 // +1 because we're appending after last row
          await batchUpdateSheet(sheetId, sheetName, batch, startRow)
          
          // Rate limit: 60 requests/minute = 1 request/second
          if (i + batchSize < rowsToAppend.length) {
            await new Promise(resolve => setTimeout(resolve, 1100))
          }
        }
      }
      
      // Re-read data for formatting (get all rows including updates and appends)
      const updatedData = await readSheetData(sheetId, sheetName)
      const allDataRows = (updatedData.values || []).slice(existingHeaderRowIndex >= 0 ? existingHeaderRowIndex + 1 : 1)
      
      // Apply formatting to make it look better
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

