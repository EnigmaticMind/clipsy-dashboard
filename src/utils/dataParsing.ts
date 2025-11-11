/**
 * Reusable data parsing and comparison utilities
 * Centralizes common patterns for parsing strings, numbers, arrays, and comparing values
 */

import { LISTING_HEADER_ROW, LISTING_COLUMN_COUNT } from "../services/googleSheets/constants"

// ============================================================================
// String Parsing
// ============================================================================

/**
 * Safely parse an integer from a string with a default value
 */
export function safeParseInt(
  value: string | undefined | null,
  defaultValue: number = 0
): number {
  if (!value || value.trim() === '') return defaultValue
  const parsed = parseInt(value.trim(), 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Safely parse a float from a string with a default value
 */
export function safeParseFloat(
  value: string | undefined | null,
  defaultValue: number = 0
): number {
  if (!value || value.trim() === '') return defaultValue
  const parsed = parseFloat(value.trim())
  return isNaN(parsed) || !isFinite(parsed) ? defaultValue : parsed
}

/**
 * Parse comma-separated values into an array
 */
export function parseCommaSeparated(
  value: string | undefined | null,
  options?: { lowercase?: boolean; filterEmpty?: boolean }
): string[] {
  if (!value || value.trim() === '') return []
  const parts = value
    .split(',')
    .map((p) => (options?.lowercase ? p.trim().toLowerCase() : p.trim()))
    .filter((p) => (options?.filterEmpty !== false ? p !== '' : true))
  return parts
}

/**
 * Parse comma-separated IDs into an array of numbers
 */
export function parseCommaSeparatedIds(
  value: string | undefined | null
): number[] {
  if (!value || value.trim() === '') return []
  return value
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id))
}

/**
 * Check if a string is empty or whitespace
 */
export function isEmpty(value: string | undefined | null): boolean {
  return !value || value.trim() === ''
}

// ============================================================================
// Value Comparison
// ============================================================================

/**
 * Compare two strings with optional normalization
 */
export function stringsEqual(
  str1: string | undefined | null,
  str2: string | undefined | null,
  options?: { caseSensitive?: boolean; normalize?: boolean }
): boolean {
  const s1 = str1?.trim() || ''
  const s2 = str2?.trim() || ''
  
  if (options?.caseSensitive === false) {
    return s1.toLowerCase() === s2.toLowerCase()
  }
  
  if (options?.normalize) {
    return s1.replace(/\s+/g, ' ') === s2.replace(/\s+/g, ' ')
  }
  
  return s1 === s2
}

/**
 * Compare two prices with epsilon tolerance
 */
export function pricesEqual(
  price1: string | number | undefined | null,
  price2: string | number | undefined | null,
  epsilon: number = 0.01
): boolean {
  const p1 =
    typeof price1 === 'string' ? safeParseFloat(price1) : price1 || 0
  const p2 =
    typeof price2 === 'string' ? safeParseFloat(price2) : price2 || 0
  return Math.abs(p1 - p2) < epsilon
}

/**
 * Compare two arrays as sets (order-independent)
 */
export function arraysEqualAsSets<T>(arr1: T[], arr2: T[]): boolean {
  if (arr1.length !== arr2.length) return false
  const set1 = new Set(arr1)
  const set2 = new Set(arr2)
  return (
    arr1.every((item) => set2.has(item)) &&
    arr2.every((item) => set1.has(item))
  )
}

/**
 * Compare two comma-separated strings as sets
 */
export function commaSeparatedEqual(
  str1: string | undefined | null,
  str2: string | undefined | null,
  options?: { caseSensitive?: boolean }
): boolean {
  const arr1 = parseCommaSeparated(str1, {
    lowercase: !options?.caseSensitive,
  })
  const arr2 = parseCommaSeparated(str2, {
    lowercase: !options?.caseSensitive,
  })
  return arraysEqualAsSets(arr1, arr2)
}

// ============================================================================
// CSV/Row Utilities
// ============================================================================

/**
 * Find the header row index in a CSV/Sheet data array
 */
export function findHeaderRowIndex(
  rows: string[][],
  searchTerms: string[] = LISTING_HEADER_ROW,
  maxSearchRows: number = 10
): number {
  for (let i = 0; i < Math.min(rows.length, maxSearchRows); i++) {
    const firstCol = rows[i]?.[0]?.toString().trim().toLowerCase() || ''
    const secondCol = rows[i]?.[1]?.toString().trim().toLowerCase() || ''
    
    // Check if any search term matches
    for (const term of searchTerms) {
      const termLower = term.toLowerCase()
      if (
        firstCol === termLower ||
        secondCol === termLower ||
        (firstCol.includes('listing') && firstCol.includes('id')) ||
        (termLower.includes('listing') &&
          termLower.includes('id') &&
          firstCol.includes('listing') &&
          firstCol.includes('id'))
      ) {
        return i
      }
    }
  }
  return -1
}

/**
 * Safely get a cell value from a row array
 */
export function safeGetCell(
  row: (string | undefined)[],
  index: number,
  defaultValue: string = ''
): string {
  const value = row?.[index]
  return value !== undefined && value !== null
    ? String(value).trim()
    : defaultValue
}

/**
 * Pad a row array to a minimum length
 * Defaults to LISTING_COLUMN_COUNT if minLength is not provided
 */
export function padRow(
  row: string[],
  minLength: number = LISTING_COLUMN_COUNT,
  padValue: string = ''
): string[] {
  if (row.length >= minLength) return row
  return [...row, ...Array(minLength - row.length).fill(padValue)]
}

// ============================================================================
// ID Parsing
// ============================================================================

/**
 * Parse an ID from a string (returns null if invalid or empty)
 */
export function parseId(value: string | undefined | null): number | null {
  if (!value || value.trim() === '') return null
  const id = parseInt(value.trim(), 10)
  return !isNaN(id) && id > 0 ? id : null
}

// ============================================================================
// Row Merging
// ============================================================================

/**
 * Merge a field from Etsy data with sheet data
 * Returns Etsy value if sheet is empty or values match, otherwise keeps sheet value (user edited)
 */
export function mergeField(
  etsyValue: string | undefined | null,
  sheetValue: string | undefined | null,
  comparisonFn?: (a: string, b: string) => boolean
): string {
  const etsy = etsyValue || ''
  const sheet = sheetValue || ''

  // If sheet is empty, use Etsy value
  if (isEmpty(sheet)) return etsy

  // If comparison function provided, use it
  if (comparisonFn) {
    return comparisonFn(etsy, sheet) ? etsy : sheet
  }

  // Default: if they match, use Etsy; otherwise keep sheet (user edited)
  return stringsEqual(etsy, sheet) ? etsy : sheet
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Extract error message from various error response formats
 */
export function extractErrorMessage(
  errorData: any,
  defaultMessage: string = 'Unknown error'
): string {
  if (typeof errorData === 'string') return errorData

  let message = errorData.error || errorData.message || defaultMessage

  if (errorData.errors && Array.isArray(errorData.errors)) {
    const messages = errorData.errors
      .map((e: any) => e.message || e.error || JSON.stringify(e))
      .join('; ')
    message = messages || message
  } else if (
    typeof errorData.error === 'object' &&
    errorData.error !== null
  ) {
    message =
      errorData.error.message ||
      errorData.error.error ||
      JSON.stringify(errorData.error)
  }

  if (errorData.params) {
    message += ` (params: ${JSON.stringify(errorData.params)})`
  }

  return message
}

