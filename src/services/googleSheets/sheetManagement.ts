// Sheet management functions - creating, finding, and verifying sheets

import { getValidAccessToken } from '../googleSheetsOAuth'
import { SheetMetadata, GOOGLE_SHEETS_API_BASE, GOOGLE_DRIVE_API_BASE } from './types'
import { batchUpdateSheet } from './sheetUtils'
import { getCustomSheetName } from './sheetConfig'
import { LISTING_HEADER_ROW, LISTING_COLUMN_COUNT } from './constants'
import { applySheetFormatting } from './sheetFormatting'
import { APP_VERSION } from '../../constants/version'

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
export async function verifySheetExists(sheetId: string): Promise<boolean> {
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
    
    // Search for spreadsheets with "Clipsy Listings" in the name (with or without version)
    // Using Drive API v3 to search for files
    const searchQuery = encodeURIComponent(
      `mimeType='application/vnd.google-apps.spreadsheet' and (name contains 'Clipsy Listings' or name contains 'Clipsy Listings v') and trashed=false`
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
      version: 1,
      appVersion: APP_VERSION // Store Clipsy app version
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
  
  // Use custom sheet name if set, otherwise use default with version
  const customName = await getCustomSheetName()
  const baseName = customName || `Clipsy Listings - ${shopName}`
  const sheetName = `${baseName} v${APP_VERSION}`
  
  // Define all status sheets to create upfront
  const statusSheets = ['Active', 'Inactive', 'Draft', 'Sold Out', 'Expired']
  
  // Header row for all sheets (imported from constants)
  
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
  
  // Add headers to all status sheets and apply formatting (including header freezing)
  for (const statusSheetName of statusSheets) {
    await batchUpdateSheet(spreadsheetId, statusSheetName, [LISTING_HEADER_ROW], 1)
    // Apply formatting including header freezing
    await applySheetFormatting(spreadsheetId, statusSheetName, LISTING_COLUMN_COUNT, [])
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
    version: 1,
    appVersion: APP_VERSION // Store Clipsy app version
  }
  
  // Save to storage
  const storageKey = `clipsy:sheet:shop_${shopId}`
  await chrome.storage.local.set({ [storageKey]: metadata })
  
  return metadata
}

// Update sheet metadata
export async function updateSheetMetadata(metadata: SheetMetadata): Promise<void> {
  const storageKey = `clipsy:sheet:shop_${metadata.shopId}`
  
  metadata.lastSynced = Date.now()
  metadata.version++
  // Update app version to current version
  metadata.appVersion = APP_VERSION
  
  await chrome.storage.local.set({ [storageKey]: metadata })
}

