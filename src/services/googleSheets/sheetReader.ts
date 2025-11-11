// Sheet reading functions - reading data from sheets

import { getValidAccessToken } from '../googleSheetsOAuth'
import { GOOGLE_SHEETS_API_BASE } from './types'
import { findHeaderRowIndex, isEmpty } from '../../utils/dataParsing'
import { LISTING_COLUMN_COUNT, COLUMNS } from './constants'

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
    if (isEmpty(sheetName)) {
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
    // Ensure row has at least LISTING_COLUMN_COUNT columns (pad with empty strings if needed)
    // Only pad if row.length < LISTING_COLUMN_COUNT, otherwise use row as-is
    const paddedRow = row.length < LISTING_COLUMN_COUNT 
      ? [...row, ...Array(LISTING_COLUMN_COUNT - row.length).fill('')]
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
    if (isEmpty(sheetName)) {
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
    let headerRowIndex = findHeaderRowIndex(values, ['listing id'], 10)
    
    // If no header found, assume first row is header
    if (headerRowIndex === -1) {
      headerRowIndex = 0
    }
    
    // Count only rows that have a non-empty Listing ID (parent rows)
    // Skip header row and any info rows before it
    for (let i = headerRowIndex + 1; i < values.length; i++) {
      const listingId = values[i]?.[COLUMNS.listing_id]?.toString().trim() || ''
      if (!isEmpty(listingId)) {
        totalListings++
      }
    }
  }
  
  // Apply row count override if set (for testing/debugging)
  const { overrideRowCount } = await import('../../utils/listingLimit')
  return overrideRowCount(totalListings)
}

