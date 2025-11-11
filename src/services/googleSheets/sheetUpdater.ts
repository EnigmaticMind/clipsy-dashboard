// Sheet updating functions - updating IDs in sheets

import { getValidAccessToken } from '../googleSheetsOAuth'
import { Listing } from '../etsyApi'
import { logger } from '../../utils/logger'
import { GOOGLE_SHEETS_API_BASE } from './types'
import { isEmpty } from '../../utils/dataParsing'
import { verifySheetExists, getOrCreateSheet } from './sheetManagement'
import { readSheetData, batchUpdateSheet } from './sheetUtils'
import { COLUMNS, getHeaderValue, LISTING_COLUMN_COUNT } from './constants'

// Update IDs in Google Sheet after creating listings or variations
// This function finds rows matching the listing and updates all IDs (listing ID, product IDs, property IDs)
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
          // Update this row with IDs from the listing
          const updatedRow = [...row]
          
          // Update Listing ID
          updatedRow[COLUMNS.listing_id] = listingId.toString()
          
          // Update Product ID (column 21) and Property IDs (columns 22-25) for variations
          if (listing.has_variations && listing.inventory?.products) {
            // Find matching product by SKU or property values
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
              const existingProp1 = row[COLUMNS.property_option_1]?.trim() // Property Option 1
              const existingProp2 = row[COLUMNS.property_option_2]?.trim() // Property Option 2
              
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
              // Update Product ID
              updatedRow[COLUMNS.product_id] = matchingProduct.product_id.toString()
              
              // Update Property IDs
              const prop1 = matchingProduct.property_values?.[0]
              const prop2 = matchingProduct.property_values?.[1]
              
              if (prop1) {
                updatedRow[COLUMNS.property_id_1] = prop1.property_id.toString() // Property ID 1
                updatedRow[COLUMNS.property_option_ids_1] = (prop1.value_ids || []).join(',') // Property Option IDs 1
              }
              
              if (prop2) {
                updatedRow[COLUMNS.property_id_2] = prop2.property_id.toString() // Property ID 2
                updatedRow[COLUMNS.property_option_ids_2] = (prop2.value_ids || []).join(',') // Property Option IDs 2
              }
            }
          } else {
            // Non-variation listing - update product ID from first product
            const product = listing.inventory?.products?.find((p) => !p.is_deleted)
            if (product) {
              updatedRow[COLUMNS.product_id] = product.product_id.toString()
            }
          }
          
          rowsToUpdate.push({ rowIndex: i + 1, data: updatedRow }) // +1 because Sheets API is 1-based
        }
      }
      
      // Update rows in batches
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
        
        logger.log(`Updated ${rowsToUpdate.length} row(s) in sheet "${sheetName}" with IDs for listing ${listingId}`)
      }
    }
  } catch (error) {
    logger.error('Error updating sheet IDs:', error)
    // Don't throw - this is a non-critical operation
  }
}

