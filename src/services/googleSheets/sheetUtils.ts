// Utility functions for Google Sheets operations

import { getValidAccessToken } from '../googleSheetsOAuth'
import { GOOGLE_SHEETS_API_BASE } from './types'
import type { ListingStatus, ListingsResponse, Listing } from '../etsyApi'
import { LISTING_HEADER_ROW, COLUMNS } from './constants'
import { findHeaderRowIndex, parseId } from '../../utils/dataParsing'

// Parse CSV string to array of rows
export function parseCSVToRows(csvContent: string): string[][] {
  return csvContent.split('\r\n').map(line => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++ // Skip next quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current)
        current = ''
      } else {
        current += char
      }
    }
    values.push(current) // Add last value
    return values
  })
}

// Ensure sheet exists in spreadsheet
export async function ensureSheetExists(sheetId: string, sheetName: string): Promise<void> {
  const token = await getValidAccessToken()
  
  // Get spreadsheet to check existing sheets
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!response.ok) {
    throw new Error('Failed to get spreadsheet info')
  }
  
  const spreadsheet = await response.json()
  const existingSheets = spreadsheet.sheets || []
  const sheetExists = existingSheets.some((sheet: { properties: { title: string } }) => sheet.properties.title === sheetName)
  
  if (!sheetExists) {
    // Create new sheet
    await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }]
        })
      }
    )
    
    // Add header row if this is a new sheet (must match CSV structure)
    await batchUpdateSheet(sheetId, sheetName, [LISTING_HEADER_ROW], 1)
  }
}

export function buildRowIndexMaps(existingRows: string[][]): { listingIdToRowIndex: Map<number, number>, productIdToRowIndex: Map<number, number>, existingHeaderRowIndex: number } {
  // Build maps for matching existing rows
    // Map: listingId -> rowIndex (1-based, row 1 is header)
    const listingIdToRowIndex = new Map<number, number>()
    // Map: productId -> rowIndex (1-based, row 1 is header)
    const productIdToRowIndex = new Map<number, number>()
    
    // Find header row index in existing data
    const existingHeaderRowIndex = findHeaderRowIndex(existingRows, ['listing id'])
    
    // Build maps from existing data (skip header row)
    if (existingHeaderRowIndex >= 0) {
      for (let i = existingHeaderRowIndex + 1; i < existingRows.length; i++) {
        const row = existingRows[i] || []
        const listingId = row[COLUMNS.listing_id]?.trim()
        const productId = row[COLUMNS.product_id]?.trim() // Product ID
        
        // Map listing ID (only if present, and only map first occurrence per listing)
        const listingIdNum = parseId(listingId)
        if (listingIdNum !== null && !listingIdToRowIndex.has(listingIdNum)) {
          listingIdToRowIndex.set(listingIdNum, i + 1) // +1 because row index is 1-based
        }
        
        // Map product ID (always map, for variations)
        const productIdNum = parseId(productId)
        if (productIdNum !== null) {
          productIdToRowIndex.set(productIdNum, i + 1) // +1 because row index is 1-based
        }
      }
    }

    return { listingIdToRowIndex, productIdToRowIndex, existingHeaderRowIndex }
}

// Read sheet data
export async function readSheetData(sheetId: string, sheetName: string): Promise<{ values: string[][] }> {
  const token = await getValidAccessToken()
  
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}/values/${sheetName}!A:Z`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!response.ok) {
    // Sheet might be empty, return empty data
    return { values: [] }
  }
  
  return await response.json()
}

// Batch update sheet
export async function batchUpdateSheet(
  sheetId: string,
  sheetName: string,
  rows: string[][],
  startRow: number
): Promise<void> {
  const token = await getValidAccessToken()
  const range = `${sheetName}!A${startRow}`
  
  const url = `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: rows,
      majorDimension: 'ROWS'
    })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update sheet' }))
    throw new Error(error.error || error.message || 'Failed to update Google Sheet')
  }
}

// Get sheet name for status
export function getSheetNameForStatus(status: ListingStatus): string {
  const statusMap: Record<ListingStatus, string> = {
    'active': 'Active',
    'inactive': 'Inactive',
    'draft': 'Draft',
    'sold_out': 'Sold Out',
    'expired': 'Expired'
  }
  return statusMap[status] || 'Unknown'
}

// Validate status and return all possible statuses
export function getStatusesToProcess(requestedStatus?: ListingStatus): ListingStatus[] {
  // Define all possible statuses
  const allStatuses: ListingStatus[] = ['active', 'inactive', 'draft', 'sold_out', 'expired']
  
  if (requestedStatus) {
    // Only process the requested status
    // Map from UI status names to API status values
    const statusMap: Record<ListingStatus, ListingStatus> = {
      'active': 'active',
      'inactive': 'inactive',
      'draft': 'draft',
      'sold_out': 'sold_out',
      'expired': 'expired'
    }
    const mappedStatus = statusMap[requestedStatus.toLowerCase() as ListingStatus]
    if (mappedStatus && allStatuses.includes(mappedStatus)) {
      return [mappedStatus]
    }
  }

  return allStatuses
}

// Group listings by status
export function groupListingsByStatus(listings: ListingsResponse): Map<ListingStatus, Listing[]> {
  const listingsByStatus = new Map<ListingStatus, Listing[]>()
  for (const listing of listings.results) {
    const status = listing.state || 'active'
    if (!listingsByStatus.has(status)) {
      listingsByStatus.set(status, [])
    }
    listingsByStatus.get(status)!.push(listing)
  }
  return listingsByStatus
}

