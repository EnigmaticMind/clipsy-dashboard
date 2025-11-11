// Google Sheets service - main entry point
// Re-exports all public functions for backward compatibility

// Re-export types
export type { SheetMetadata } from './types'
export { GOOGLE_SHEETS_API_BASE, GOOGLE_DRIVE_API_BASE, STORAGE_SHEET_NAME_KEY } from './types'

// Re-export constants
export { LISTING_HEADER_ROW, LISTING_COLUMN_COUNT, COLUMNS, getHeaderValue } from './constants'
export type { ListingHeaderRow } from './constants'

// Re-export configuration functions
export { getCustomSheetName, setCustomSheetName } from './sheetConfig'

// Re-export management functions
export { getOrCreateSheet, verifySheetExists, updateSheetMetadata } from './sheetManagement'

// Re-export writer functions
export { writeListingsToSheet, mergeRowData } from './sheetWriter'

// Re-export reader functions
export { readListingsFromSheetAsFile, getSheetRowCount } from './sheetReader'

// Re-export updater functions
export { updateSheetIDs } from './sheetUpdater'

// Re-export utility functions (for internal use, but available if needed)
export {
  parseCSVToRows,
  ensureSheetExists,
  readSheetData,
  batchUpdateSheet,
  getSheetNameForStatus,
  getStatusesToProcess,
  groupListingsByStatus,
} from './sheetUtils'

// Re-export formatting functions (for internal use)
export { applySheetFormatting } from './sheetFormatting'

