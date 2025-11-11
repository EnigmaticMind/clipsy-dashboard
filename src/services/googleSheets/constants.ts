// Constants for Google Sheets operations

/**
 * CSV/Sheet header row - defines the column structure for listings
 * This must match the structure used in csvService.ts and uploadService.ts
 * 
 * Column order:
 * 0: Listing ID, 1: Title, 2: Description, 3: Status, 4: Tags,
 * 5: Variation, 6: Property Name 1, 7: Property Option 1, 8: Property Name 2, 9: Property Option 2,
 * 10: Price, 11: Currency Code, 12: Quantity, 13: SKU,
 * 14: Variation Price, 15: Variation Quantity, 16: Variation SKU,
 * 17: Materials, 18: Shipping Profile ID, 19: Processing Min, 20: Processing Max,
 * 21: Product ID, 22: Property ID 1, 23: Property Option IDs 1, 24: Property ID 2, 25: Property Option IDs 2
 */

export interface ListingHeaderRow {
  [key: string]: string
}

export const LISTING_HEADER_OBJECT: ListingHeaderRow = {
  'listing_id':'Listing ID (DO NOT EDIT)',
  'title':'Title',
  'description':'Description',
  'status':'Status',
  'tags':'Tags',
  'variation':'Variation',
  'property_name_1':'Property Name 1',
  'property_option_1':'Property Option 1',
  'property_name_2':'Property Name 2',
  'property_option_2':'Property Option 2',
  'price':'Price',
  'currency_code':'Currency Code',
  'quantity':'Quantity',
  'sku':'SKU (DELETE=delete listing)',
  'variation_price':'Variation Price',
  'variation_quantity':'Variation Quantity',
  'variation_sku':'Variation SKU (DELETE=delete variation)',
  'materials':'Materials',
  'shipping_profile_id':'Shipping Profile ID',
  'processing_min':'Processing Min (days)',
  'processing_max':'Processing Max (days)',
  'product_id':'Product ID (DO NOT EDIT)',
  'property_id_1':'Property ID 1 (DO NOT EDIT)',
  'property_option_ids_1':'Property Option IDs 1 (DO NOT EDIT)',
  'property_id_2':'Property ID 2 (DO NOT EDIT)',
  'property_option_ids_2':'Property Option IDs 2 (DO NOT EDIT)'
}

export const LISTING_HEADER_ROW: string[] = Object.values(LISTING_HEADER_OBJECT);

/**
 * Number of columns in the CSV/Sheet structure
 */
export const LISTING_COLUMN_COUNT = LISTING_HEADER_ROW.length

/**
 * Column indices for each field - use these instead of hardcoded numbers
 * Example: COLUMNS.listing_id instead of 0
 */
export const COLUMNS = {
  listing_id: 0,
  title: 1,
  description: 2,
  status: 3,
  tags: 4,
  variation: 5,
  property_name_1: 6,
  property_option_1: 7,
  property_name_2: 8,
  property_option_2: 9,
  price: 10,
  currency_code: 11,
  quantity: 12,
  sku: 13,
  variation_price: 14,
  variation_quantity: 15,
  variation_sku: 16,
  materials: 17,
  shipping_profile_id: 18,
  processing_min: 19,
  processing_max: 20,
  product_id: 21,
  property_id_1: 22,
  property_option_ids_1: 23,
  property_id_2: 24,
  property_option_ids_2: 25,
} as const

/**
 * Get the header value for a field key
 * Example: getHeaderValue('listing_id') returns 'Listing ID (DO NOT EDIT)'
 */
export function getHeaderValue(fieldKey: keyof typeof LISTING_HEADER_OBJECT): string {
  return LISTING_HEADER_OBJECT[fieldKey]
}

