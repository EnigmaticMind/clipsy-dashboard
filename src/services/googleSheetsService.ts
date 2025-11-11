// Google Sheets service - handles creating, reading, and updating Google Sheets

import { getValidAccessToken } from './googleSheetsOAuth'
import { ListingsResponse, Listing, ListingStatus } from './etsyApi'
import { convertListingsToCSV } from './csvService'
import { logger } from '../utils/logger'

const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4'
const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'

export interface SheetMetadata {
  sheetId: string
  sheetUrl: string
  shopId: number
  shopName: string
  createdAt: number
  lastSynced: number
  version: number
}

const STORAGE_SHEET_NAME_KEY = 'clipsy:googleSheetsFileName'

// Get custom sheet name from storage
export async function getCustomSheetName(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_SHEET_NAME_KEY)
  return result[STORAGE_SHEET_NAME_KEY] || null
}

// Set custom sheet name in storage
export async function setCustomSheetName(name: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_SHEET_NAME_KEY]: name })
}

// Get or create sheet for shop
export async function getOrCreateSheet(shopId: number, shopName: string): Promise<SheetMetadata> {
  const storageKey = `clipsy:sheet:shop_${shopId}`
  
  // Check storage first
  const result = await chrome.storage.local.get(storageKey)
  const existing = result[storageKey]
  
  if (existing) {
    // Verify sheet still exists
    const exists = await verifySheetExists(existing.sheetId)
    if (exists) {
      return existing
    }
  }
  
  // Not in storage or doesn't exist - search Google Drive for existing sheet
  const foundSheet = await searchDriveForSheet(shopId, shopName)
  if (foundSheet) {
    // Save found sheet to storage
    await updateSheetMetadata(foundSheet)
    return foundSheet
  }
  
  // No sheet found - create new one
  return await createNewSheet(shopId, shopName)
}

// Verify sheet exists and is not trashed
async function verifySheetExists(sheetId: string): Promise<boolean> {
  try {
    const token = await getValidAccessToken()
    
    // Check if the file exists and is not trashed via Drive API
    const driveResponse = await fetch(
      `${GOOGLE_DRIVE_API_BASE}/files/${sheetId}?fields=trashed`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (!driveResponse.ok) {
      return false
    }
    
    const fileInfo = await driveResponse.json()
    // Return true only if the file exists and is NOT trashed
    return !fileInfo.trashed
  } catch {
    return false
  }
}

// Search Google Drive for existing Clipsy sheet
async function searchDriveForSheet(shopId: number, shopName: string): Promise<SheetMetadata | null> {
  try {
    const token = await getValidAccessToken()
    
    // Search for spreadsheets with "Clipsy Listings" in the name
    // Using Drive API v3 to search for files
    const searchQuery = encodeURIComponent(
      `mimeType='application/vnd.google-apps.spreadsheet' and name contains 'Clipsy Listings' and trashed=false`
    )
    
    const response = await fetch(
      `${GOOGLE_DRIVE_API_BASE}/files?q=${searchQuery}&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (!response.ok) {
      // If search fails, return null (will create new sheet)
      return null
    }
    
    const data = await response.json()
    const files = data.files || []
    
    if (files.length === 0) {
      return null
    }
    
    // Try to find a sheet that matches the shop ID or shop name
    // First, try to match by shop ID in the name
    let matchedSheet = files.find((file: { name: string }) => {
      const shopIdMatch = file.name.match(/Shop\s+(\d+)/i)
      if (shopIdMatch) {
        return parseInt(shopIdMatch[1], 10) === shopId
      }
      return false
    })
    
    // If no match by shop ID, try to match by shop name
    if (!matchedSheet && shopName) {
      matchedSheet = files.find((file: { name: string }) => {
        return file.name.includes(shopName)
      })
    }
    
    // If still no match, use the most recently modified sheet
    if (!matchedSheet) {
      matchedSheet = files[0]
    }
    
    const sheet = matchedSheet
    
    // Get full sheet details to construct proper URL
    const sheetDetailsResponse = await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheet.id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (!sheetDetailsResponse.ok) {
      return null
    }
    
    const sheetDetails = await sheetDetailsResponse.json()
    
    const metadata: SheetMetadata = {
      sheetId: sheet.id,
      sheetUrl: sheetDetails.spreadsheetUrl || sheet.webViewLink,
      shopId: shopId, // Will be set by caller
      shopName: shopName,
      createdAt: sheet.createdTime ? new Date(sheet.createdTime).getTime() : Date.now(),
      lastSynced: Date.now(),
      version: 1
    }
    
    return metadata
  } catch (error) {
    // If search fails for any reason, return null (will create new sheet)
    console.error('Error searching Drive for sheet:', error)
    return null
  }
}

// Create new Google Sheet
async function createNewSheet(shopId: number, shopName: string): Promise<SheetMetadata> {
  const token = await getValidAccessToken()
  
  // Use custom sheet name if set, otherwise use default
  const customName = await getCustomSheetName()
  const sheetName = customName || `Clipsy Listings - ${shopName}`
  
  // Define all status sheets to create upfront
  const statusSheets = ['Active', 'Inactive', 'Draft', 'Sold Out', 'Expired']
  
  // Header row for all sheets
  const headerRow = [
    'Listing ID',
    'Title',
    'Description',
    'Status',
    'Tags',
    'Variation',
    'Property Name 1',
    'Property Option 1',
    'Property Name 2',
    'Property Option 2',
    'Price',
    'Currency Code',
    'Quantity',
    'SKU (DELETE=delete listing)',
    'Variation Price',
    'Variation Quantity',
    'Variation SKU (DELETE=delete variation)',
    'Materials',
    'Shipping Profile ID',
    'Processing Min (days)',
    'Processing Max (days)',
    'Product ID (DO NOT EDIT)',
    'Property ID 1 (DO NOT EDIT)',
    'Property Option IDs 1 (DO NOT EDIT)',
    'Property ID 2 (DO NOT EDIT)',
    'Property Option IDs 2 (DO NOT EDIT)'
  ]
  
  // Create spreadsheet (will have default Sheet1)
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: sheetName
        }
      })
    }
  )
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create sheet' }))
    throw new Error(error.error || error.message || 'Failed to create Google Sheet')
  }
  
  const sheet = await response.json()
  const spreadsheetId = sheet.spreadsheetId
  
  // Get spreadsheet info to find Sheet1
  const spreadsheetInfo = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${spreadsheetId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!spreadsheetInfo.ok) {
    throw new Error('Failed to get spreadsheet info')
  }
  
  const info = await spreadsheetInfo.json()
  const sheet1 = info.sheets?.find((s: { properties: { title: string } }) => s.properties.title === 'Sheet1')
  
  // Build batch update requests: delete Sheet1 and create all status sheets
  const batchRequests: Array<Record<string, unknown>> = []
  
  // Delete Sheet1 if it exists
  if (sheet1) {
    batchRequests.push({
      deleteSheet: {
        sheetId: sheet1.properties.sheetId
      }
    })
  }
  
  // Add all status sheets
  for (const statusSheetName of statusSheets) {
    batchRequests.push({
      addSheet: {
        properties: {
          title: statusSheetName
        }
      }
    })
  }
  
  // Execute batch update
  if (batchRequests.length > 0) {
    await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: batchRequests
        })
      }
    )
  }
  
  // Add headers to all status sheets
  for (const statusSheetName of statusSheets) {
    await batchUpdateSheet(spreadsheetId, statusSheetName, [headerRow], 1)
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  const metadata: SheetMetadata = {
    sheetId: spreadsheetId,
    sheetUrl: sheet.spreadsheetUrl,
    shopId,
    shopName,
    createdAt: Date.now(),
    lastSynced: Date.now(),
    version: 1
  }
  
  // Save to storage
  const storageKey = `clipsy:sheet:shop_${shopId}`
  await chrome.storage.local.set({ [storageKey]: metadata })
  
  return metadata
}

// Get sheet name for status
function getSheetNameForStatus(status: ListingStatus): string {
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
function getStatusesToProcess(requestedStatus?: ListingStatus): ListingStatus[] {
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
function groupListingsByStatus(listings: ListingsResponse): Map<ListingStatus, Listing[]> {
  const listingsByStatus = new Map<ListingStatus, Listing[]>()
  for (const listing of listings.results) {
    const status = listing.state || 'active'
    if (!listingsByStatus.has(status)) {
      listingsByStatus.set(status, [])
    }
  }
  return listingsByStatus
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
    const sheetName = getSheetNameForStatus(status)
    const statusListings = listingsByStatus.get(status) || []
    
    // Ensure sheet exists
    await ensureSheetExists(sheetId, sheetName)
    
    // Read existing data (don't clear - we'll update or append)
    const existingData = await readSheetData(sheetId, sheetName)
    const existingRows = existingData.values || []
    
    // Build maps for matching existing rows
    // Map: listingId -> rowIndex (1-based, row 1 is header)
    const listingIdToRowIndex = new Map<number, number>()
    // Map: productId -> rowIndex (1-based, row 1 is header)
    const productIdToRowIndex = new Map<number, number>()
    
    // Find header row index in existing data
    let existingHeaderRowIndex = -1
    for (let i = 0; i < existingRows.length; i++) {
      if (existingRows[i] && existingRows[i][0] === 'Listing ID') {
        existingHeaderRowIndex = i
        break
      }
    }
    
    // Build maps from existing data (skip header row)
    if (existingHeaderRowIndex >= 0) {
      for (let i = existingHeaderRowIndex + 1; i < existingRows.length; i++) {
        const row = existingRows[i] || []
        const listingId = row[0]?.trim()
        const productId = row[21]?.trim() // Product ID is column 21 (was 17)
        
        // Map listing ID (only if present, and only map first occurrence per listing)
        if (listingId && listingId !== '') {
          const listingIdNum = parseInt(listingId, 10)
          if (!isNaN(listingIdNum) && !listingIdToRowIndex.has(listingIdNum)) {
            listingIdToRowIndex.set(listingIdNum, i + 1) // +1 because row index is 1-based
          }
        }
        
        // Map product ID (always map, for variations)
        if (productId && productId !== '') {
          const productIdNum = parseInt(productId, 10)
          if (!isNaN(productIdNum)) {
            productIdToRowIndex.set(productIdNum, i + 1) // +1 because row index is 1-based
          }
        }
      }
    }
    
    // Convert new listings to CSV format
    const csvContent = convertListingsToCSV({ count: statusListings.length, results: statusListings })
    const allRows = parseCSVToRows(csvContent)
    
    // Find header row in new data
    let newHeaderRowIndex = -1
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i][0] === 'Listing ID') {
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
        existingHeaderRowIndex = 0
      }
      
      // Separate rows into updates and appends
      const rowsToUpdate: Array<{ rowIndex: number; data: string[]; existingRow: string[] }> = []
      const rowsToAppend: string[][] = []
      
      for (const newRow of newDataRows) {
        const listingId = newRow[0]?.trim()
        const productId = newRow[21]?.trim() // Product ID is column 21
        
        let rowIndex: number | undefined
        let existingRow: string[] | undefined
        
        // Priority: Product ID match (for variations) > Listing ID match (for first row)
        if (productId && productId !== '') {
          const productIdNum = parseInt(productId, 10)
          if (!isNaN(productIdNum)) {
            rowIndex = productIdToRowIndex.get(productIdNum)
            if (rowIndex && existingRows.length > rowIndex - 1) {
              existingRow = existingRows[rowIndex - 1] || [] // -1 because rowIndex is 1-based
            }
          }
        }
        
        // If no product ID match, try listing ID match (for first row of listing)
        if (!rowIndex && listingId && listingId !== '') {
          const listingIdNum = parseInt(listingId, 10)
          if (!isNaN(listingIdNum)) {
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

// Parse CSV string to array of rows
function parseCSVToRows(csvContent: string): string[][] {
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
async function ensureSheetExists(sheetId: string, sheetName: string): Promise<void> {
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
    const headerRow = [
      'Listing ID',
      'Title',
      'Description',
      'Status',
      'Tags',
      'Variation',
      'Property Name 1',
      'Property Option 1',
      'Property Name 2',
      'Property Option 2',
      'Price',
      'Currency Code',
      'Quantity',
      'SKU (DELETE=delete listing)',
      'Variation Price',
      'Variation Quantity',
      'Variation SKU (DELETE=delete variation)',
      'Materials',
      'Shipping Profile ID',
      'Processing Min (days)',
      'Processing Max (days)',
      'Product ID (DO NOT EDIT)',
      'Property ID 1 (DO NOT EDIT)',
      'Property Option IDs 1 (DO NOT EDIT)',
      'Property ID 2 (DO NOT EDIT)',
      'Property Option IDs 2 (DO NOT EDIT)'
    ]
    await batchUpdateSheet(sheetId, sheetName, [headerRow], 1)
  }
}

// Read sheet data
async function readSheetData(sheetId: string, sheetName: string): Promise<{ values: string[][] }> {
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


// Apply formatting to make the sheet look better
async function applySheetFormatting(
  sheetId: string,
  sheetName: string,
  numColumns: number,
  dataRows: string[][]
): Promise<void> {
  const token = await getValidAccessToken()
  
  // Get sheet ID (not sheet name) for batchUpdate
  const spreadsheetResponse = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!spreadsheetResponse.ok) {
    return // Fail silently for formatting
  }
  
  const spreadsheet = await spreadsheetResponse.json()
  const sheet = spreadsheet.sheets.find((s: { properties: { title: string } }) => s.properties.title === sheetName)
  
  if (!sheet) {
    return
  }
  
  const sheetIdNum = sheet.properties.sheetId
  
  // Build formatting requests
  const requests: Array<Record<string, unknown>> = []
  
  // First, unmerge any existing merged cells in the data range to ensure clean state
  // Unmerge all cells from row 2 onwards (row 1 is header) to ensure data is visible
  if (dataRows.length > 0) {
    const dataStartRow = 1 // Row 2 (0-based index 1, after header)
    const dataEndRow = dataRows.length // Last data row
    requests.push({
      unmergeCells: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: dataStartRow,
          endRowIndex: dataStartRow + dataEndRow,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        }
      }
    })
  }
  
  // 1. Freeze header row (row 1) - keeps header visible when scrolling
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetIdNum,
        gridProperties: {
          frozenRowCount: 1
        }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  })
  
  // 2. Bold header row with light blue background
  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetIdNum,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: numColumns
      },
      cell: {
        userEnteredFormat: {
          textFormat: {
            bold: true
          },
          backgroundColor: {
            red: 0.9,
            green: 0.95,
            blue: 1.0
          }
        }
      },
      fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor'
    }
  })
  
  // 3. Auto-resize columns to fit content
  requests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId: sheetIdNum,
        dimension: 'COLUMNS',
        startIndex: 0,
        endIndex: numColumns
      }
    }
  })
  
  // 4. Remove banded rows (we'll apply custom colors instead)
  // 5. Format price columns as currency (column K = Price, column O = Variation Price)
  // Price is column 11 (index 10), Variation Price is column 15 (index 14)
  if (numColumns > 10) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1, // Start after header
          endRowIndex: 10000,
          startColumnIndex: 10, // Price column
          endColumnIndex: 11
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'CURRENCY',
              pattern: '"$"#,##0.00'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  if (numColumns > 14) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 14, // Variation Price column
          endColumnIndex: 15
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'CURRENCY',
              pattern: '"$"#,##0.00'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  // 5b. Format Processing Min and Processing Max as numbers (columns T and U, indices 19 and 20)
  if (numColumns > 19) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 19, // Processing Min column
          endColumnIndex: 20
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '0'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  if (numColumns > 20) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 20, // Processing Max column
          endColumnIndex: 21
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '0'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  // 5c. Format Shipping Profile ID as number (column S, index 18)
  if (numColumns > 18) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 18, // Shipping Profile ID column
          endColumnIndex: 19
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '0'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  // 6. Wrap text for Description column (column C, index 2) so long descriptions are visible
  if (numColumns > 2) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 2, // Description column
          endColumnIndex: 3
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    })
  }
  
  // 7. Add filter to header row - allows sorting and filtering
  requests.push({
    setBasicFilter: {
      filter: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        }
      }
    }
  })
  
  // 8. Group variations together with improved visual hierarchy
  // Identify listing groups (parent row + variation rows)
  const listingGroups: Array<{ parentRow: number; variationRows: number[] }> = []
  let currentParentRow = -1
  let currentVariations: number[] = []
  
  for (let i = 0; i < dataRows.length; i++) {
    const listingId = dataRows[i][0]?.toString().trim()
    const rowIndex = i + 2 // +2 because row 1 is header, and Sheets API is 1-based
    
    if (listingId && listingId !== '') {
      // This is a parent row (product/listing row)
      // Save previous group if it had variations
      if (currentParentRow >= 0 && currentVariations.length > 0) {
        listingGroups.push({ parentRow: currentParentRow, variationRows: currentVariations })
      }
      // Start new group
      currentParentRow = rowIndex
      currentVariations = []
    } else {
      // This is a variation row
      if (currentParentRow >= 0) {
        currentVariations.push(rowIndex)
      }
    }
  }
  // Save last group
  if (currentParentRow >= 0) {
    listingGroups.push({ parentRow: currentParentRow, variationRows: currentVariations })
  }
  
  // Apply grey background to all parent rows (products)
  for (const group of listingGroups) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: group.parentRow - 1, // Convert to 0-based
          endRowIndex: group.parentRow, // Exclusive
          startColumnIndex: 0,
          endColumnIndex: numColumns
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.9,  // Grey
              green: 0.9,
              blue: 0.9
            }
          }
        },
        fields: 'userEnteredFormat.backgroundColor'
      }
    })
  }
  
  // Apply white background to all variation rows
  for (const group of listingGroups) {
    if (group.variationRows.length > 0) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetIdNum,
            startRowIndex: group.variationRows[0] - 1, // Convert to 0-based
            endRowIndex: group.variationRows[group.variationRows.length - 1], // Exclusive, 1-based
            startColumnIndex: 0,
            endColumnIndex: numColumns
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 1.0,  // White
                green: 1.0,
                blue: 1.0
              }
            }
          },
          fields: 'userEnteredFormat.backgroundColor'
        }
      })
    }
  }
  
  // Also handle standalone rows (listings without variations that aren't in groups)
  // Find all parent rows
  const allParentRows: number[] = []
  for (let i = 0; i < dataRows.length; i++) {
    const listingId = dataRows[i][0]?.toString().trim()
    if (listingId && listingId !== '') {
      allParentRows.push(i + 2) // +2 for header and 1-based
    }
  }
  
  // Apply grey to standalone parent rows (those without variations in the next row)
  for (const parentRow of allParentRows) {
    const isInGroup = listingGroups.some(g => g.parentRow === parentRow)
    if (isInGroup) {
      const group = listingGroups.find(g => g.parentRow === parentRow)!
      if (group.variationRows.length === 0) {
        // Standalone listing, already handled above
      }
    } else {
      // Shouldn't happen, but handle it
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetIdNum,
            startRowIndex: parentRow - 1,
            endRowIndex: parentRow,
            startColumnIndex: 0,
            endColumnIndex: numColumns
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 0.9,
                green: 0.9,
                blue: 0.9
              }
            }
          },
          fields: 'userEnteredFormat.backgroundColor'
        }
      })
    }
  }
  
  // Apply all formatting in one batch
  const formatResponse = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests
      })
    }
  )
  
  if (!formatResponse.ok) {
    const error = await formatResponse.json().catch(() => ({ error: 'Failed to apply formatting' }))
    console.error('Failed to apply sheet formatting:', error)
    // Don't throw - formatting is non-critical
    return
  }
  
  // Collapse all created row groups by default
  const collapseRequests: Array<Record<string, unknown>> = []
  
  // Find all addDimensionGroup requests we made and create collapse requests for them
  for (const request of requests) {
    if (request.addDimensionGroup) {
      const groupRequest = request.addDimensionGroup as { range?: { sheetId?: number; dimension?: string; startIndex?: number; endIndex?: number } }
      if (groupRequest.range?.dimension === 'ROWS' && groupRequest.range.startIndex !== undefined && groupRequest.range.endIndex !== undefined) {
        collapseRequests.push({
          updateDimensionGroup: {
            range: {
              sheetId: sheetIdNum,
              dimension: 'ROWS',
              startIndex: groupRequest.range.startIndex,
              endIndex: groupRequest.range.endIndex
            },
            collapsed: true
          }
        })
      }
    }
  }
  
  // Collapse all created row groups by default
  if (collapseRequests.length > 0) {
    // Collapse groups in a separate batch update
    await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: collapseRequests
        })
      }
    ).catch(err => {
      console.error('Failed to collapse groups:', err)
      // Don't throw - collapsing is non-critical
    })
  }
}


// Batch update sheet
async function batchUpdateSheet(
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

// Read listings from Google Sheet and return as CSV File
export async function readListingsFromSheetAsFile(sheetId: string): Promise<File> {
  const token = await getValidAccessToken()
  
  // Get all sheets in the spreadsheet
  const spreadsheetResponse = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!spreadsheetResponse.ok) {
    const error = await spreadsheetResponse.json().catch(() => ({ error: 'Failed to read spreadsheet' }))
    throw new Error(error.error || error.message || 'Failed to read Google Sheet')
  }
  
  const spreadsheet = await spreadsheetResponse.json()
  const sheets = spreadsheet.sheets || []
  
  if (sheets.length === 0) {
    throw new Error('Google Sheet has no sheets')
  }
  
  // Read data from all sheets
  const allRows: string[][] = []
  let isFirstSheet = true
  
  for (const sheet of sheets) {
    const sheetName = sheet.properties.title
    
    // Skip empty sheet names or system sheets
    if (!sheetName || sheetName.trim() === '') {
      continue
    }
    
    // Read data from this sheet
    const response = await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A:Z`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (!response.ok) {
      // Skip sheets that can't be read (might be empty or have errors)
      console.warn(`Failed to read sheet "${sheetName}":`, response.statusText)
      continue
    }
    
    const data = await response.json()
    const rows = data.values || []
    
    if (rows.length === 0) {
      // Skip empty sheets
      continue
    }
    
    if (isFirstSheet) {
      // Include header row from first sheet
      allRows.push(...rows)
      isFirstSheet = false
    } else {
      // Skip header row for subsequent sheets (assume first row is header)
      if (rows.length > 1) {
        allRows.push(...rows.slice(1))
      }
    }
  }
  
  if (allRows.length === 0) {
    throw new Error('Google Sheet is empty')
  }
  
  // Convert rows to CSV format
  // Keep all rows (including info rows and header) to match original CSV format
  const csvLines = allRows.map((row: string[]) => {
    // Ensure row has at least 26 columns (pad with empty strings if needed)
    // Only pad if row.length < 26, otherwise use row as-is
    const paddedRow = row.length < 26 
      ? [...row, ...Array(26 - row.length).fill('')]
      : row
    
    return paddedRow.map((cell: string) => {
      const cellValue = cell || ''
      // Escape if contains comma, quote, or newline
      if (cellValue.includes(',') || cellValue.includes('"') || cellValue.includes('\n')) {
        return `"${cellValue.replace(/"/g, '""')}"`
      }
      return cellValue
    }).join(',')
  })
  
  // Create CSV content with CRLF line endings (Excel-friendly)
  const csvContent = csvLines.join('\r\n')
  
  // Create File object from CSV content
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const file = new File([blob], 'google-sheets-export.csv', { type: 'text/csv' })
  
  return file
}

// Get total row count across all sheets
// Counts only rows with actual data (not empty rows)
// Only counts parent rows (listings), not variation rows
export async function getSheetRowCount(sheetId: string): Promise<number> {
  const token = await getValidAccessToken()
  
  // Get all sheets in the spreadsheet
  const spreadsheetResponse = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!spreadsheetResponse.ok) {
    throw new Error('Failed to read spreadsheet')
  }
  
  const spreadsheet = await spreadsheetResponse.json()
  const sheets = spreadsheet.sheets || []
  
  if (sheets.length === 0) {
    return 0
  }
  
  let totalListings = 0
  
  // For each sheet, count only parent rows (rows with Listing ID)
  for (const sheet of sheets) {
    const sheetName = sheet.properties.title
    
    // Skip empty sheet names
    if (!sheetName || sheetName.trim() === '') {
      continue
    }
    
    // Read only column A (Listing ID column) to identify parent rows
    // This is lightweight - we only read one column
    const dataResponse = await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A:A`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    if (!dataResponse.ok) {
      // If we can't read the data, skip this sheet
      continue
    }
    
    const data = await dataResponse.json()
    const values = data.values || []
    
    if (values.length === 0) {
      continue
    }
    
    // Find header row (look for "Listing ID" in first few rows)
    let headerRowIndex = -1
    for (let i = 0; i < Math.min(values.length, 10); i++) {
      const firstCell = values[i]?.[0]?.toString().trim().toLowerCase() || ''
      if (firstCell === 'listing id' || (firstCell.includes('listing') && firstCell.includes('id'))) {
        headerRowIndex = i
        break
      }
    }
    
    // If no header found, assume first row is header
    if (headerRowIndex === -1) {
      headerRowIndex = 0
    }
    
    // Count only rows that have a non-empty Listing ID (parent rows)
    // Skip header row and any info rows before it
    for (let i = headerRowIndex + 1; i < values.length; i++) {
      const listingId = values[i]?.[0]?.toString().trim() || ''
      if (listingId !== '') {
        totalListings++
      }
    }
  }
  
  // Apply row count override if set (for testing/debugging)
  const { overrideRowCount } = await import('../utils/listingLimit')
  return overrideRowCount(totalListings)
}

// Update sheet metadata
export async function updateSheetMetadata(metadata: SheetMetadata): Promise<void> {
  const storageKey = `clipsy:sheet:shop_${metadata.shopId}`
  
  metadata.lastSynced = Date.now()
  metadata.version++
  
  await chrome.storage.local.set({ [storageKey]: metadata })
}

// Helper to merge row data: only update fields that match Etsy, keep sheet values for mismatched fields
function mergeRowData(etsyRow: string[], sheetRow: string[]): string[] {
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
  if (etsyRow[21]) merged[21] = etsyRow[21] // Product ID
  if (etsyRow[22]) merged[22] = etsyRow[22] // Property ID 1
  if (etsyRow[23]) merged[23] = etsyRow[23] // Property Option IDs 1
  if (etsyRow[24]) merged[24] = etsyRow[24] // Property ID 2
  if (etsyRow[25]) merged[25] = etsyRow[25] // Property Option IDs 2
  
  // For other fields, only update if Etsy value matches what's in the sheet
  // If they don't match, it means user edited it, so keep the sheet value
  
  // Title (1)
  if (etsyRow[1] && sheetRow[1] && etsyRow[1].trim() === sheetRow[1].trim()) {
    merged[1] = etsyRow[1]
  } else if (!sheetRow[1] || sheetRow[1].trim() === '') {
    // Sheet is empty, update it
    merged[1] = etsyRow[1] || ''
  }
  
  // Description (2)
  if (etsyRow[2] && sheetRow[2] && etsyRow[2].trim() === sheetRow[2].trim()) {
    merged[2] = etsyRow[2]
  } else if (!sheetRow[2] || sheetRow[2].trim() === '') {
    merged[2] = etsyRow[2] || ''
  }
  
  // Status (3)
  if (etsyRow[3] && sheetRow[3] && etsyRow[3].trim().toLowerCase() === sheetRow[3].trim().toLowerCase()) {
    merged[3] = etsyRow[3]
  } else if (!sheetRow[3] || sheetRow[3].trim() === '') {
    merged[3] = etsyRow[3] || ''
  }
  
  // Tags (4) - compare as sets
  const etsyTags = etsyRow[4]?.split(',').map(t => t.trim().toLowerCase()).filter(t => t) || []
  const sheetTags = sheetRow[4]?.split(',').map(t => t.trim().toLowerCase()).filter(t => t) || []
  const tagsMatch = etsyTags.length === sheetTags.length && 
                    etsyTags.every(t => sheetTags.includes(t))
  if (tagsMatch) {
    merged[4] = etsyRow[4] || ''
  } else if (!sheetRow[4] || sheetRow[4].trim() === '') {
    merged[4] = etsyRow[4] || ''
  }
  
  // Price (10) - compare as numbers
  const etsyPrice = parseFloat(etsyRow[10] || '0')
  const sheetPrice = parseFloat(sheetRow[10] || '0')
  if (Math.abs(etsyPrice - sheetPrice) < 0.01) {
    merged[10] = etsyRow[10] || ''
  } else if (!sheetRow[10] || sheetRow[10].trim() === '') {
    merged[10] = etsyRow[10] || ''
  }
  
  // Currency Code (11)
  if (etsyRow[11] && sheetRow[11] && etsyRow[11].trim().toUpperCase() === sheetRow[11].trim().toUpperCase()) {
    merged[11] = etsyRow[11]
  } else if (!sheetRow[11] || sheetRow[11].trim() === '') {
    merged[11] = etsyRow[11] || ''
  }
  
  // Quantity (12)
  const etsyQty = parseInt(etsyRow[12] || '0', 10)
  const sheetQty = parseInt(sheetRow[12] || '0', 10)
  if (etsyQty === sheetQty) {
    merged[12] = etsyRow[12] || ''
  } else if (!sheetRow[12] || sheetRow[12].trim() === '') {
    merged[12] = etsyRow[12] || ''
  }
  
  // SKU (13)
  if (etsyRow[13] && sheetRow[13] && etsyRow[13].trim() === sheetRow[13].trim()) {
    merged[13] = etsyRow[13]
  } else if (!sheetRow[13] || sheetRow[13].trim() === '') {
    merged[13] = etsyRow[13] || ''
  }
  
  // Variation Price (14)
  const etsyVarPrice = parseFloat(etsyRow[14] || '0')
  const sheetVarPrice = parseFloat(sheetRow[14] || '0')
  if (Math.abs(etsyVarPrice - sheetVarPrice) < 0.01) {
    merged[14] = etsyRow[14] || ''
  } else if (!sheetRow[14] || sheetRow[14].trim() === '') {
    merged[14] = etsyRow[14] || ''
  }
  
  // Variation Quantity (15)
  const etsyVarQty = parseInt(etsyRow[15] || '0', 10)
  const sheetVarQty = parseInt(sheetRow[15] || '0', 10)
  if (etsyVarQty === sheetVarQty) {
    merged[15] = etsyRow[15] || ''
  } else if (!sheetRow[15] || sheetRow[15].trim() === '') {
    merged[15] = etsyRow[15] || ''
  }
  
  // Variation SKU (16)
  if (etsyRow[16] && sheetRow[16] && etsyRow[16].trim() === sheetRow[16].trim()) {
    merged[16] = etsyRow[16]
  } else if (!sheetRow[16] || sheetRow[16].trim() === '') {
    merged[16] = etsyRow[16] || ''
  }
  
  // Materials (17) - compare as sets
  const etsyMaterials = etsyRow[17]?.split(',').map(m => m.trim().toLowerCase()).filter(m => m) || []
  const sheetMaterials = sheetRow[17]?.split(',').map(m => m.trim().toLowerCase()).filter(m => m) || []
  const materialsMatch = etsyMaterials.length === sheetMaterials.length && 
                         etsyMaterials.every(m => sheetMaterials.includes(m))
  if (materialsMatch) {
    merged[17] = etsyRow[17] || ''
  } else if (!sheetRow[17] || sheetRow[17].trim() === '') {
    merged[17] = etsyRow[17] || ''
  }
  
  // Shipping Profile ID (18)
  const etsyShipping = parseInt(etsyRow[18] || '0', 10)
  const sheetShipping = parseInt(sheetRow[18] || '0', 10)
  if (etsyShipping === sheetShipping) {
    merged[18] = etsyRow[18] || ''
  } else if (!sheetRow[18] || sheetRow[18].trim() === '') {
    merged[18] = etsyRow[18] || ''
  }
  
  // Processing Min (19)
  const etsyProcMin = parseInt(etsyRow[19] || '0', 10)
  const sheetProcMin = parseInt(sheetRow[19] || '0', 10)
  if (etsyProcMin === sheetProcMin) {
    merged[19] = etsyRow[19] || ''
  } else if (!sheetRow[19] || sheetRow[19].trim() === '') {
    merged[19] = etsyRow[19] || ''
  }
  
  // Processing Max (20)
  const etsyProcMax = parseInt(etsyRow[20] || '0', 10)
  const sheetProcMax = parseInt(sheetRow[20] || '0', 10)
  if (etsyProcMax === sheetProcMax) {
    merged[20] = etsyRow[20] || ''
  } else if (!sheetRow[20] || sheetRow[20].trim() === '') {
    merged[20] = etsyRow[20] || ''
  }
  
  // Property names/options (6-9) - only update if they match
  for (let i = 6; i <= 9; i++) {
    if (etsyRow[i] && sheetRow[i] && etsyRow[i].trim() === sheetRow[i].trim()) {
      merged[i] = etsyRow[i]
    } else if (!sheetRow[i] || sheetRow[i].trim() === '') {
      merged[i] = etsyRow[i] || ''
    }
  }
  
  return merged
}

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
      if (!sheetName || sheetName.trim() === '') {
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
        const firstCell = rows[i]?.[0]?.toString().trim().toLowerCase() || ''
        if (firstCell === 'listing id' || (firstCell.includes('listing') && firstCell.includes('id'))) {
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
        const existingListingId = row[0]?.trim()
        const existingTitle = row[1]?.trim()
        const existingSKU = row[13]?.trim() // Column 13 is SKU
        const existingVariationSKU = row[16]?.trim() // Column 16 is Variation SKU
        const existingProductId = row[21]?.trim() // Column 21 is Product ID
        
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
          
          // Update Listing ID (column 0)
          updatedRow[0] = listingId.toString()
          
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
              const existingProp1 = row[7]?.trim() // Property Option 1
              const existingProp2 = row[9]?.trim() // Property Option 2
              
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
              updatedRow[21] = matchingProduct.product_id.toString()
              
              // Update Property IDs
              const prop1 = matchingProduct.property_values?.[0]
              const prop2 = matchingProduct.property_values?.[1]
              
              if (prop1) {
                updatedRow[22] = prop1.property_id.toString() // Property ID 1
                updatedRow[23] = (prop1.value_ids || []).join(',') // Property Option IDs 1
              }
              
              if (prop2) {
                updatedRow[24] = prop2.property_id.toString() // Property ID 2
                updatedRow[25] = (prop2.value_ids || []).join(',') // Property Option IDs 2
              }
            }
          } else {
            // Non-variation listing - update product ID from first product
            const product = listing.inventory?.products?.find((p) => !p.is_deleted)
            if (product) {
              updatedRow[21] = product.product_id.toString()
            }
          }
          
          rowsToUpdate.push({ rowIndex: i + 1, data: updatedRow }) // +1 because Sheets API is 1-based
        }
      }
      
      // Update rows in batches
      if (rowsToUpdate.length > 0) {
        // Update each row individually using batchUpdateSheet
        for (const { rowIndex, data } of rowsToUpdate) {
          // Ensure row has at least 26 columns
          const paddedData = data.length < 26 
            ? [...data, ...Array(26 - data.length).fill('')]
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

