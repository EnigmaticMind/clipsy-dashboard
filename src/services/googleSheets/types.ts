// Types and constants for Google Sheets service

export interface SheetMetadata {
  sheetId: string
  sheetUrl: string
  shopId: number
  shopName: string
  createdAt: number
  lastSynced: number
  version: number // Internal version counter for tracking syncs
  appVersion?: string // Clipsy app version from package.json (e.g., "1.0.0")
}

export const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4'
export const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
export const STORAGE_SHEET_NAME_KEY = 'clipsy:googleSheetsFileName'

