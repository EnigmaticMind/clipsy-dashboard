// Google Sheets service - handles creating, reading, and updating Google Sheets

import { getValidAccessToken } from './googleSheetsOAuth'
import { ListingsResponse } from './etsyApi'
import { convertListingsToCSV } from './csvService'

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
    'Product ID (DO NOT EDIT)',
    'Property ID 1 (DO NOT EDIT)',
    'Property Option IDs 1 (DO NOT EDIT)',
    'Property ID 2 (DO NOT EDIT)',
    'Property Option IDs 2 (DO NOT EDIT)',
    'Materials',
    'Shipping Profile ID',
    'Processing Min (days)',
    'Processing Max (days)'
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

// Write listings to Google Sheet - creates separate sheets per status
// requestedStatus: if provided, only process this status. If undefined, process all statuses.
// Returns the sheet name that was written to (for opening the correct tab)
export async function writeListingsToSheet(
  sheetId: string,
  listings: ListingsResponse,
  requestedStatus?: string
): Promise<string | null> {
  // Define all possible statuses
  const allStatuses: Array<'active' | 'inactive' | 'draft' | 'sold_out' | 'expired'> = [
    'active', 'inactive', 'draft', 'sold_out', 'expired'
  ]
  
  // Determine which statuses to process
  let statusesToProcess: Array<'active' | 'inactive' | 'draft' | 'sold_out' | 'expired'>
  
  if (!requestedStatus) {
    // No status specified, process all statuses
    statusesToProcess = allStatuses
  } else {
    // Only process the requested status
    // Map from UI status names to API status values
    const statusMap: Record<string, 'active' | 'inactive' | 'draft' | 'sold_out' | 'expired'> = {
      'active': 'active',
      'inactive': 'inactive',
      'draft': 'draft',
      'sold_out': 'sold_out',
      'expired': 'expired'
    }
    const mappedStatus = statusMap[requestedStatus.toLowerCase()]
    if (mappedStatus && allStatuses.includes(mappedStatus)) {
      statusesToProcess = [mappedStatus]
    } else {
      // Invalid status, process all
      statusesToProcess = allStatuses
    }
  }
  
  // Group listings by status
  const listingsByStatus = new Map<string, typeof listings.results>()
  
  for (const listing of listings.results) {
    const status = listing.state || 'active'
    if (!listingsByStatus.has(status)) {
      listingsByStatus.set(status, [])
    }
    listingsByStatus.get(status)!.push(listing)
  }
  
  // Process only the requested statuses
  let writtenSheetName: string | null = null
  
  for (const status of statusesToProcess) {
    const sheetName = getSheetNameForStatus(status)
    const statusListings = listingsByStatus.get(status) || []
    
    // Ensure sheet exists
    await ensureSheetExists(sheetId, sheetName)
    
    // Clear existing data (but keep header)
    await clearSheetData(sheetId, sheetName)
    
    // Convert listings to CSV format
    const csvContent = convertListingsToCSV({ count: statusListings.length, results: statusListings })
    const allRows = parseCSVToRows(csvContent)
    
    // Find header row
    let headerRowIndex = -1
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i][0] === 'Listing ID') {
        headerRowIndex = i
        break
      }
    }
    
    if (headerRowIndex >= 0) {
      // Get header and data rows
      const headerRow = allRows[headerRowIndex]
      const dataRows = allRows.slice(headerRowIndex + 1)
      
      // Write header first
      await batchUpdateSheet(sheetId, sheetName, [headerRow], 1)
      
      // Write data rows in batches
      if (dataRows.length > 0) {
        const batchSize = 1000
        for (let i = 0; i < dataRows.length; i += batchSize) {
          const batch = dataRows.slice(i, i + batchSize)
          await batchUpdateSheet(sheetId, sheetName, batch, i + 2) // +2 because row 1 is header
          
          // Rate limit: 60 requests/minute = 1 request/second
          if (i + batchSize < dataRows.length) {
            await new Promise(resolve => setTimeout(resolve, 1100))
          }
        }
      }
      
      // Apply formatting to make it look better
      await applySheetFormatting(sheetId, sheetName, headerRow.length, dataRows)
      
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

// Get sheet name for status
function getSheetNameForStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'active': 'Active',
    'inactive': 'Inactive',
    'draft': 'Draft',
    'sold_out': 'Sold Out',
    'expired': 'Expired'
  }
  return statusMap[status] || 'Other'
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

// Clear sheet data (but keep header row)
async function clearSheetData(sheetId: string, sheetName: string): Promise<void> {
  const token = await getValidAccessToken()
  
  // Read existing data to find where data starts (after header)
  const existingData = await readSheetData(sheetId, sheetName)
  const existingRows = existingData.values || []
  
  if (existingRows.length <= 1) {
    // Only header or empty, nothing to clear
    return
  }
  
  // Clear from row 2 onwards (row 1 is header)
  const range = `${sheetName}!A2:Z`
  await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}/values/${range}:clear`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
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
  
  // 2. Bold header row with gray background
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
            green: 0.9,
            blue: 0.9
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
  
  // 4. Add alternating row colors (banded rows) for better readability
  requests.push({
    addBanding: {
      bandedRange: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1, // Start after header
          endRowIndex: 10000, // Large number to cover all rows
          startColumnIndex: 0,
          endColumnIndex: numColumns
        },
        rowProperties: {
          headerColor: {
            red: 1.0,
            green: 1.0,
            blue: 1.0
          },
          firstBandColor: {
            red: 1.0,
            green: 1.0,
            blue: 1.0
          },
          secondBandColor: {
            red: 0.98,
            green: 0.98,
            blue: 0.98
          }
        }
      }
    }
  })
  
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
    
    if (listingId) {
      // This is a parent row
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
  if (currentParentRow >= 0 && currentVariations.length > 0) {
    listingGroups.push({ parentRow: currentParentRow, variationRows: currentVariations })
  }
  
  // Apply formatting to each listing group
  for (const group of listingGroups) {
    const firstRow = group.parentRow - 1 // Convert to 0-based
    const lastRow = group.variationRows.length > 0 
      ? group.variationRows[group.variationRows.length - 1] - 1 
      : firstRow
    
    // 1. Style parent row with different background (light gray)
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: firstRow,
          endRowIndex: firstRow + 1,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.91,  // Light gray
              green: 0.91,
              blue: 0.91
            }
          }
        },
        fields: 'userEnteredFormat.backgroundColor'
      }
    })
    
    // 3. Style variation rows with light blue background
    if (group.variationRows.length > 0) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetIdNum,
            startRowIndex: group.variationRows[0] - 1,
            endRowIndex: lastRow,
            startColumnIndex: 0,
            endColumnIndex: numColumns
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 0.99,
                green: 0.99,
                blue: 1.0
              }
            }
          },
          fields: 'userEnteredFormat.backgroundColor'
        }
      })
    }
    
    // 4. Add borders around entire listing group
    requests.push({
      updateBorders: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: firstRow,
          endRowIndex: lastRow,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        },
        top: {
          style: 'SOLID',
          width: 2,
          color: { red: 0.7, green: 0.7, blue: 0.7 }
        },
        bottom: {
          style: 'SOLID',
          width: 2,
          color: { red: 0.7, green: 0.7, blue: 0.7 }
        },
        left: {
          style: 'SOLID',
          width: 1,
          color: { red: 0.7, green: 0.7, blue: 0.7 }
        },
        right: {
          style: 'SOLID',
          width: 1,
          color: { red: 0.7, green: 0.7, blue: 0.7 }
        }
      }
    })
    
    // 5. Group only variation rows (not parent row) if variations exist
    if (group.variationRows.length > 0) {
      // variationRows contains 1-based row indices (row 2 = index 2, row 3 = index 3, etc.)
      // Convert to 0-based for API
      const variationStartRow = group.variationRows[0] - 1 // First variation row (0-based)
      const variationEndRow = group.variationRows[group.variationRows.length - 1] - 1 // Last variation row (0-based)
      
      // Only create group if we have at least 2 rows to group (need multiple rows for grouping to work)
      if (variationEndRow > variationStartRow) {
        requests.push({
          addDimensionGroup: {
            range: {
              sheetId: sheetIdNum,
              dimension: 'ROWS',
              startIndex: variationStartRow,
              endIndex: variationEndRow + 1 // endIndex is exclusive, so +1 to include last row
            }
          }
        })
      }
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
    // Ensure row has at least 22 columns (pad with empty strings if needed)
    const paddedRow = [...row, ...Array(22 - row.length).fill('')]
    
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

// Get total row count across all sheets (lightweight, uses gridProperties)
// Returns approximate data row count (excluding headers)
export async function getSheetRowCount(sheetId: string): Promise<number> {
  const token = await getValidAccessToken()
  
  // Get spreadsheet metadata (includes gridProperties with rowCount)
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}?fields=sheets.properties(title,gridProperties.rowCount)`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!response.ok) {
    throw new Error('Failed to get sheet row count')
  }
  
  const spreadsheet = await response.json()
  const sheets = spreadsheet.sheets || []
  
  let totalRows = 0
  let isFirstSheet = true
  
  for (const sheet of sheets) {
    const sheetName = sheet.properties.title
    const rowCount = sheet.properties.gridProperties?.rowCount || 0
    
    // Skip empty sheet names
    if (!sheetName || sheetName.trim() === '') {
      continue
    }
    
    // First sheet includes header, others don't (we skip headers when reading)
    if (isFirstSheet) {
      // First sheet: subtract 1 for header
      totalRows += Math.max(0, rowCount - 1)
      isFirstSheet = false
    } else {
      // Subsequent sheets: subtract 1 for header (we skip it when reading)
      totalRows += Math.max(0, rowCount - 1)
    }
  }
  
  // Apply row count override if set (for testing/debugging)
  const { overrideRowCount } = await import('../utils/listingLimit')
  return overrideRowCount(totalRows)
}

// Update sheet metadata
export async function updateSheetMetadata(metadata: SheetMetadata): Promise<void> {
  const storageKey = `clipsy:sheet:shop_${metadata.shopId}`
  
  metadata.lastSynced = Date.now()
  metadata.version++
  
  await chrome.storage.local.set({ [storageKey]: metadata })
}

