// Helper function to read a Google Sheet by spreadsheet ID and gid (tab ID)

import { getValidAccessToken } from '../googleSheetsOAuth'
import { GOOGLE_SHEETS_API_BASE } from './types'
import { readSheetData } from './sheetUtils'

/**
 * Get sheet name from spreadsheet ID and gid (tab ID)
 */
export async function getSheetNameFromGid(
  spreadsheetId: string,
  gid: string
): Promise<string | null> {
  const token = await getValidAccessToken()
  
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${spreadsheetId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!response.ok) {
    throw new Error(`Failed to get spreadsheet: ${response.status}`)
  }
  
  const spreadsheet = await response.json()
  const sheets = spreadsheet.sheets || []
  
  // Find sheet by gid (sheetId property)
  const targetSheet = sheets.find((sheet: { properties: { sheetId: number } }) => 
    sheet.properties.sheetId.toString() === gid
  )
  
  if (!targetSheet) {
    return null
  }
  
  return targetSheet.properties.title
}

/**
 * Read a Google Sheet by spreadsheet ID and gid (tab ID)
 */
export async function readSheetByGid(
  spreadsheetId: string,
  gid: string
): Promise<{ sheetName: string; values: string[][] }> {
  const sheetName = await getSheetNameFromGid(spreadsheetId, gid)
  
  if (!sheetName) {
    throw new Error(`Sheet with gid ${gid} not found in spreadsheet ${spreadsheetId}`)
  }
  
  const data = await readSheetData(spreadsheetId, sheetName)
  
  return {
    sheetName,
    values: data.values || []
  }
}

