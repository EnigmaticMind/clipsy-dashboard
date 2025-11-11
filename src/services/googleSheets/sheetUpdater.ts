// Sheet updating functions - updating IDs and data in sheets

import { getValidAccessToken } from '../googleSheetsOAuth'
import { Listing } from '../etsyApi'
import { logger } from '../../utils/logger'
import { GOOGLE_SHEETS_API_BASE } from './types'
import { isEmpty, decodeHTMLEntities, parseId } from '../../utils/dataParsing'
import { verifySheetExists, getOrCreateSheet } from './sheetManagement'
import { readSheetData, batchUpdateSheet, deleteSheetRows } from './sheetUtils'
import { COLUMNS, getHeaderValue, LISTING_COLUMN_COUNT } from './constants'

// Helper function to build a row from Etsy listing data (for listing row)
function buildListingRowFromEtsy(listing: Listing): string[] {
  const row: string[] = Array(LISTING_COLUMN_COUNT).fill('')
  
  row[COLUMNS.listing_id] = listing.listing_id.toString()
  row[COLUMNS.title] = decodeHTMLEntities(listing.title)
  row[COLUMNS.description] = decodeHTMLEntities(listing.description)
  row[COLUMNS.status] = listing.state
  row[COLUMNS.tags] = listing.tags.join(',')
  row[COLUMNS.currency_code] = listing.price.currency_code
  row[COLUMNS.materials] = listing.materials?.join(', ') || ''
  row[COLUMNS.shipping_profile_id] = listing.shipping_profile_id?.toString() || ''
  row[COLUMNS.processing_min] = listing.processing_min?.toString() || ''
  row[COLUMNS.processing_max] = listing.processing_max?.toString() || ''
  
  // For non-variation listings, set price/quantity/SKU on listing row
  if (!listing.has_variations) {
    const product = listing.inventory?.products?.find((p) => !p.is_deleted)
    if (product) {
      row[COLUMNS.product_id] = product.product_id.toString()
      row[COLUMNS.sku] = product.sku
      const offering = product.offerings.find((o) => !o.is_deleted)
      if (offering) {
        const priceVal = offering.price.amount / offering.price.divisor
        row[COLUMNS.price] = priceVal.toFixed(2)
        row[COLUMNS.quantity] = offering.quantity.toString()
      }
    }
  }
  
  return row
}

// Helper function to build a variation row from Etsy product data
function buildVariationRowFromEtsy(listing: Listing, product: Listing['inventory']['products'][0]): string[] {
  const row: string[] = Array(LISTING_COLUMN_COUNT).fill('')
  
  // Set listing ID (for reference, but variation rows don't show other listing info)
  row[COLUMNS.listing_id] = listing.listing_id.toString()
  
  // Get property values
  const prop1 = product.property_values?.[0]
  const prop2 = product.property_values?.[1]
  
  // Build variation display
  let variationDisplay = 'N/A'
  if (prop1 && prop1.values.length > 0) {
    variationDisplay = prop1.values.join(', ')
    if (prop2 && prop2.values.length > 0) {
      variationDisplay += ' / ' + prop2.values.join(', ')
    }
  } else if (prop2 && prop2.values.length > 0) {
    variationDisplay = prop2.values.join(', ')
  }
  
  row[COLUMNS.variation] = variationDisplay
  row[COLUMNS.property_name_1] = prop1?.property_name || ''
  row[COLUMNS.property_option_1] = prop1 ? prop1.values.join(', ') : ''
  row[COLUMNS.property_name_2] = prop2?.property_name || ''
  row[COLUMNS.property_option_2] = prop2 ? prop2.values.join(', ') : ''
  
  // Determine price, quantity, SKU locations
  const hasPriceOnProperty = listing.inventory.price_on_property.length > 0
  const hasQuantityOnProperty = listing.inventory.quantity_on_property.length > 0
  const hasSKUOnProperty = listing.inventory.sku_on_property.length > 0
  
  const offering = product.offerings.find((o) => !o.is_deleted)
  if (offering) {
    if (hasPriceOnProperty) {
      const priceVal = offering.price.amount / offering.price.divisor
      row[COLUMNS.variation_price] = priceVal.toFixed(2)
    } else {
      const priceVal = offering.price.amount / offering.price.divisor
      row[COLUMNS.price] = priceVal.toFixed(2)
    }
    
    if (hasQuantityOnProperty) {
      row[COLUMNS.variation_quantity] = offering.quantity.toString()
    } else {
      row[COLUMNS.quantity] = offering.quantity.toString()
    }
  }
  
  if (hasSKUOnProperty) {
    row[COLUMNS.variation_sku] = product.sku
  } else {
    row[COLUMNS.sku] = product.sku
  }
  
  row[COLUMNS.currency_code] = listing.price.currency_code
  row[COLUMNS.product_id] = product.product_id.toString()
  
  if (prop1) {
    row[COLUMNS.property_id_1] = prop1.property_id.toString()
    row[COLUMNS.property_option_ids_1] = (prop1.value_ids || []).join(',')
  }
  
  if (prop2) {
    row[COLUMNS.property_id_2] = prop2.property_id.toString()
    row[COLUMNS.property_option_ids_2] = (prop2.value_ids || []).join(',')
  }
  
  return row
}

// Update IDs and data in Google Sheet after creating/updating listings or variations
// This function finds rows matching the listing and updates all data from Etsy to reflect actual state
export async function updateSheetIDs(
  shopId: number,
  listingId: number,
  listing: Listing // Listing from Etsy API
): Promise<void> {
  try {
    // Get sheet metadata - try to get from storage first (doesn't require shop name)
    const storageKey = `clipsy:sheet:shop_${shopId}`
    const result = await chrome.storage.local.get(storageKey)
    const existing = result[storageKey]
    
    let sheetId: string | null = null
    
    if (existing) {
      // Verify sheet still exists
      const exists = await verifySheetExists(existing.sheetId)
      if (exists) {
        sheetId = existing.sheetId
      }
    }
    
    // If no sheet found, try to get or create one (with empty shop name - will use storage lookup)
    if (!sheetId) {
      try {
        const sheetMetadata = await getOrCreateSheet(shopId, '')
        sheetId = sheetMetadata.sheetId
      } catch (error) {
        logger.warn('Could not get or create sheet for ID update:', error)
        return // Can't update if sheet doesn't exist
      }
    }
    
    if (!sheetId) {
      logger.warn('No sheet found for shop, skipping ID update')
      return
    }
    
    // Get all sheets in the spreadsheet
    const token = await getValidAccessToken()
    const spreadsheetResponse = await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (!spreadsheetResponse.ok) {
      logger.warn('Failed to get spreadsheet info for ID update')
      return
    }
    
    const spreadsheet = await spreadsheetResponse.json()
    const sheets = spreadsheet.sheets || []
    
    // Search all sheets for matching rows
    for (const sheet of sheets) {
      const sheetName = sheet.properties.title
      
      // Skip empty sheet names
      if (isEmpty(sheetName)) {
        continue
      }
      
      // Read sheet data
      const sheetData = await readSheetData(sheetId, sheetName)
      const rows = sheetData.values || []
      
      if (rows.length === 0) {
        continue
      }
      
      // Find header row
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const firstCell = rows[i]?.[COLUMNS.listing_id]?.toString().trim().toLowerCase() || ''
        const headerValue = getHeaderValue('listing_id').toLowerCase()
        if (firstCell === headerValue || (firstCell.includes('listing') && firstCell.includes('id'))) {
          headerRowIndex = i
          break
        }
      }
      
      if (headerRowIndex === -1) {
        continue // No header found, skip this sheet
      }
      
      // Find rows matching this listing
      // Match by: listing title, SKU, or variation SKU
      const rowsToUpdate: Array<{ rowIndex: number; data: string[] }> = []
      const rowsToAppend: string[][] = []
      
      // Track which products from Etsy have been matched to existing rows
      const matchedProductIds = new Set<number>()
      let listingRowIndex: number | null = null
      let listingRowUpdated = false
      
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i] || []
        const existingListingId = row[COLUMNS.listing_id]?.trim()
        const existingTitle = row[COLUMNS.title]?.trim()
        const existingSKU = row[COLUMNS.sku]?.trim() // SKU
        const existingVariationSKU = row[COLUMNS.variation_sku]?.trim() // Variation SKU
        const existingProductId = row[COLUMNS.product_id]?.trim() // Product ID
        
        // Check if this row matches the listing
        let matches = false
        
        // Match by listing ID (if already set)
        if (existingListingId && existingListingId === listingId.toString()) {
          matches = true
        }
        // Match by title (for new listings)
        else if (existingTitle && existingTitle === listing.title) {
          matches = true
        }
        // Match by SKU (for non-variation listings)
        else if (existingSKU && !listing.has_variations) {
          const product = listing.inventory?.products?.find((p) => !p.is_deleted)
          if (product && product.sku === existingSKU) {
            matches = true
          }
        }
        // Match by variation SKU (for variation listings)
        else if (existingVariationSKU && listing.has_variations) {
          const product = listing.inventory?.products?.find((p) => !p.is_deleted && p.sku === existingVariationSKU)
          if (product) {
            matches = true
          }
        }
        
        if (matches) {
          // Determine if this is a listing row or variation row
          const isVariationRow = existingProductId || existingVariationSKU || 
            (row[COLUMNS.property_option_1]?.trim() || row[COLUMNS.property_option_2]?.trim())
          
          let updatedRow: string[]
          
          if (isVariationRow && listing.has_variations && listing.inventory?.products) {
            // This is a variation row - find matching product and update with full variation data
            let matchingProduct: Listing['inventory']['products'][0] | undefined = undefined
            
            if (existingVariationSKU) {
              matchingProduct = listing.inventory.products.find((p) => 
                !p.is_deleted && p.sku === existingVariationSKU
              )
            } else if (existingProductId) {
              matchingProduct = listing.inventory.products.find((p) => 
                !p.is_deleted && p.product_id.toString() === existingProductId
              )
            } else {
              // Match by property values
              const existingProp1 = row[COLUMNS.property_option_1]?.trim()
              const existingProp2 = row[COLUMNS.property_option_2]?.trim()
              
              matchingProduct = listing.inventory.products.find((p) => {
                if (p.is_deleted) return false
                const prop1 = p.property_values?.[0]
                const prop2 = p.property_values?.[1]
                const prop1Match = !existingProp1 || (prop1 && prop1.values?.some((v) => v === existingProp1))
                const prop2Match = !existingProp2 || (prop2 && prop2.values?.some((v) => v === existingProp2))
                return prop1Match && prop2Match
              })
            }
            
            if (matchingProduct) {
              // Build full variation row from Etsy data
              updatedRow = buildVariationRowFromEtsy(listing, matchingProduct)
              matchedProductIds.add(matchingProduct.product_id)
            } else {
              // Product not found - skip this row (might have been deleted)
              continue
            }
          } else {
            // This is a listing row - update with full listing data
            updatedRow = buildListingRowFromEtsy(listing)
            listingRowIndex = i + 1
            listingRowUpdated = true
          }
          
          rowsToUpdate.push({ rowIndex: i + 1, data: updatedRow }) // +1 because Sheets API is 1-based
        }
      }
      
      // For variation listings, check if we need to add new variation rows
      if (listing.has_variations && listing.inventory?.products) {
        // Find listing row index if we didn't update it yet
        if (!listingRowIndex) {
          // Look for listing row
          for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i] || []
            const existingListingId = row[COLUMNS.listing_id]?.trim()
            const existingTitle = row[COLUMNS.title]?.trim()
            const isVariationRow = row[COLUMNS.property_option_1]?.trim() || row[COLUMNS.property_option_2]?.trim()
            
            if (!isVariationRow && (
              (existingListingId && existingListingId === listingId.toString()) ||
              (existingTitle && existingTitle === listing.title)
            )) {
              listingRowIndex = i + 1
              // Update listing row if we haven't already
              if (!listingRowUpdated) {
                const updatedRow = buildListingRowFromEtsy(listing)
                rowsToUpdate.push({ rowIndex: listingRowIndex, data: updatedRow })
                listingRowUpdated = true
              }
              break
            }
          }
        }
        
        // If no listing row found, we need to add it first
        if (!listingRowIndex) {
          const listingRow = buildListingRowFromEtsy(listing)
          // Append listing row at the end
          rowsToAppend.push(listingRow)
          // Set listingRowIndex to the position where it will be (after all existing rows)
          listingRowIndex = rows.length + 1
        }
        
        // Add any products that weren't matched (new variations)
        for (const product of listing.inventory.products) {
          if (product.is_deleted) continue
          if (!matchedProductIds.has(product.product_id)) {
            const variationRow = buildVariationRowFromEtsy(listing, product)
            rowsToAppend.push(variationRow)
          }
        }
      } else if (!listingRowUpdated) {
        // Non-variation listing - ensure listing row exists and is updated
        // This should have been handled above, but double-check
        let foundListingRow = false
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i] || []
          const existingListingId = row[COLUMNS.listing_id]?.trim()
          const existingTitle = row[COLUMNS.title]?.trim()
          
          if ((existingListingId && existingListingId === listingId.toString()) ||
              (existingTitle && existingTitle === listing.title)) {
            foundListingRow = true
            break
          }
        }
        
        if (!foundListingRow) {
          // Add listing row if it doesn't exist
          const listingRow = buildListingRowFromEtsy(listing)
          rowsToAppend.push(listingRow)
        }
      }
      
      // Update existing rows
      if (rowsToUpdate.length > 0) {
        // Update each row individually using batchUpdateSheet
        for (const { rowIndex, data } of rowsToUpdate) {
          // Ensure row has at least LISTING_COLUMN_COUNT columns
          const paddedData = data.length < LISTING_COLUMN_COUNT 
            ? [...data, ...Array(LISTING_COLUMN_COUNT - data.length).fill('')]
            : data
          
          await batchUpdateSheet(sheetId, sheetName, [paddedData], rowIndex)
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        logger.log(`Updated ${rowsToUpdate.length} row(s) in sheet "${sheetName}" with data from Etsy for listing ${listingId}`)
      }
      
      // Append new rows (new variations or listing row if missing)
      if (rowsToAppend.length > 0) {
        // Find the position to insert: after listing row, or at end if no listing row
        let insertRowIndex = rows.length + 1 // Default: append at end
        
        if (listingRowIndex) {
          // Insert after listing row
          insertRowIndex = listingRowIndex + 1
        }
        
        // Prepare all rows to append
        const paddedRows = rowsToAppend.map(newRow => 
          newRow.length < LISTING_COLUMN_COUNT 
            ? [...newRow, ...Array(LISTING_COLUMN_COUNT - newRow.length).fill('')]
            : newRow
        )
        
        // Append all rows in a single batch operation
        // Google Sheets API will automatically insert rows when the range extends beyond existing data
        await batchUpdateSheet(sheetId, sheetName, paddedRows, insertRowIndex)
        
        logger.log(`Added ${rowsToAppend.length} new row(s) to sheet "${sheetName}" for listing ${listingId}`)
      }
    }
  } catch (error) {
    logger.error('Error updating sheet data:', error)
    // Don't throw - this is a non-critical operation
  }
}

// Remove deleted listings and variations from Google Sheet
// deletedListingIds: Set of listing IDs that were deleted
// deletedProductIds: Set of product IDs (variations) that were deleted
export async function removeDeletedItemsFromSheet(
  shopId: number,
  deletedListingIds: Set<number>,
  deletedProductIds: Set<number>
): Promise<void> {
  if (deletedListingIds.size === 0 && deletedProductIds.size === 0) {
    return // Nothing to delete
  }

  try {
    // Get sheet metadata from storage
    const storageKey = `clipsy:sheet:shop_${shopId}`
    const result = await chrome.storage.local.get(storageKey)
    const existing = result[storageKey]
    
    if (!existing || !existing.sheetId) {
      logger.warn('No sheet found for shop, skipping deletion of rows')
      return
    }

    const sheetId = existing.sheetId

    // Verify sheet still exists
    const exists = await verifySheetExists(sheetId)
    if (!exists) {
      logger.warn('Sheet no longer exists, skipping deletion of rows')
      return
    }

    // Get all sheets in the spreadsheet
    const token = await getValidAccessToken()
    const spreadsheetResponse = await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (!spreadsheetResponse.ok) {
      logger.warn('Failed to get spreadsheet info for row deletion')
      return
    }
    
    const spreadsheet = await spreadsheetResponse.json()
    const sheets = spreadsheet.sheets || []

    // Process each sheet
    for (const sheet of sheets) {
      const sheetName = sheet.properties.title
      
      try {
        // Read all rows from the sheet
        const rows = await readSheetData(sheetId, sheetName)
        
        if (rows.length === 0) {
          continue
        }

        // Find header row
        let headerRowIndex = -1
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] || []
          if (row[COLUMNS.listing_id] === getHeaderValue('listing_id')) {
            headerRowIndex = i
            break
          }
        }

        if (headerRowIndex < 0) {
          logger.warn(`No header row found in sheet "${sheetName}", skipping`)
          continue
        }

        // Find rows to delete
        const rowsToDelete: number[] = []
        
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i] || []
          const rowListingId = parseId(row[COLUMNS.listing_id]?.trim())
          const rowProductId = parseId(row[COLUMNS.product_id]?.trim())
          const rowIndex = i + 1 // Convert to 1-based

          // Delete if:
          // 1. Row has a listing ID that was deleted (this will delete listing row + all its variations)
          // 2. Row has a product ID that was deleted (this will delete just that variation)
          const shouldDelete = 
            (rowListingId !== null && deletedListingIds.has(rowListingId)) ||
            (rowProductId !== null && deletedProductIds.has(rowProductId))

          if (shouldDelete) {
            rowsToDelete.push(rowIndex)
          }
        }

        // Delete rows if any found
        if (rowsToDelete.length > 0) {
          logger.log(`Deleting ${rowsToDelete.length} row(s) from sheet "${sheetName}"`)
          await deleteSheetRows(sheetId, sheetName, rowsToDelete)
          logger.log(`Successfully deleted ${rowsToDelete.length} row(s) from sheet "${sheetName}"`)
        }
      } catch (error) {
        logger.error(`Error processing sheet "${sheetName}" for deletion:`, error)
        // Continue with other sheets even if one fails
      }
    }
  } catch (error) {
    logger.error('Error removing deleted items from sheet:', error)
    // Don't throw - this is a non-critical operation
  }
}

