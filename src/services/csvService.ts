// CSV service - generates and parses CSV files for Etsy listings
// Ported from backend Go code

import { ListingsResponse } from './etsyApi'

// Decode HTML entities
function decodeHTMLEntities(s: string): string {
  // Create a temporary element to decode HTML entities
  const textarea = document.createElement('textarea')
  textarea.innerHTML = s
  let decoded = textarea.value
  
  // Handle numeric entities like &#39;
  decoded = decoded.replace(/&#(\d+);/g, (_match, numStr) => {
    const num = parseInt(numStr, 10)
    return String.fromCharCode(num)
  })
  
  return decoded
}

// Convert listings to CSV format
// New user-friendly structure: Listing info on every row, Variation column, logical grouping
export function convertListingsToCSV(listings: ListingsResponse): string {
  const rows: string[][] = []
  
  // Metadata rows (24 columns total)
  const emptyRow = Array(24).fill('')
  
  rows.push([
    'INFO: This CSV contains your Etsy listings. For listings with variations, each variation appears on a separate row. Listing-level fields (Title, Description, Status, Tags) are only on the first row.',
    ...emptyRow.slice(1)
  ])
  
  rows.push([
    'IMPORTANT: When uploading edits, keep Listing ID, Product ID, Property IDs, and Property Option IDs intact. They identify which items to update.',
    ...emptyRow.slice(1)
  ])
  
  rows.push([
    'DELETE BEHAVIOR: SKU=\'DELETE\' deletes the entire listing/product. Variation SKU=\'DELETE\' deletes only that specific variation.',
    ...emptyRow.slice(1)
  ])
  
  rows.push([
    'UPLOAD BEHAVIOR: New records (no Listing ID) = Create new listing. Existing records (has Listing ID) = Update listing.',
    ...emptyRow.slice(1)
  ])
  
  rows.push([
    'EDITING TIP: For listings with variations, edit Title/Description/Status/Tags on the first row only. Variation rows have these fields empty to avoid confusion.',
    ...emptyRow.slice(1)
  ])
  
  rows.push([
    'DO NOT EDIT: Variation Enabled, Product ID, Property ID 1/2, Property Option IDs 1/2, Property Product ID - These are technical fields used for identification.',
    ...emptyRow.slice(1)
  ])
  
  rows.push([
    'COLUMN GROUPS: [Listing Info (5 cols)] [Variation Display (5 cols)] [Pricing & Inventory (4 cols)] [Variation Details (4 cols)] [Technical IDs - DO NOT EDIT (6 cols)]',
    ...emptyRow.slice(1)
  ])
  
  // Empty row
  rows.push(emptyRow)
  
  // Header row - New user-friendly structure
  rows.push([
    'Listing ID',
    'Title',
    'Description',
    'Status',
    'Tags',
    'Variation',  // User-friendly: "S / Arctic White" or "N/A"
    'Property Name 1',  // e.g., "Sizes"
    'Property Option 1',  // e.g., "S"
    'Property Name 2',  // e.g., "Colors"
    'Property Option 2',  // e.g., "Arctic White"
    'Price',
    'Currency Code',
    'Quantity',
    'SKU (DELETE=delete listing)',
    'Variation Price',  // If price varies by variation
    'Variation Quantity',  // If quantity varies by variation
    'Variation SKU (DELETE=delete variation)',  // If SKU varies by variation
    'Variation Enabled (DO NOT EDIT)',
    'Product ID (DO NOT EDIT)',
    'Property ID 1 (DO NOT EDIT)',
    'Property Option IDs 1 (DO NOT EDIT)',
    'Property ID 2 (DO NOT EDIT)',
    'Property Option IDs 2 (DO NOT EDIT)',
    'Property Product ID (DO NOT EDIT)',  // For backward compatibility
  ])
  
  // Process each listing
  for (const listing of listings.results) {
    if (listing.has_variations && listing.inventory.products.length > 0) {
      // Process each variation
      for (let i = 0; i < listing.inventory.products.length; i++) {
        const product = listing.inventory.products[i]
        if (product.is_deleted) continue
        
        // Find active offering
        const activeOffering = product.offerings.find(o => !o.is_deleted)
        if (!activeOffering) continue
        
        // Get property values
        const prop1 = product.property_values[0]
        const prop2 = product.property_values[1]
        
        // Build variation display string (e.g., "S / Arctic White" or "S" if only one property)
        let variationDisplay = 'N/A'
        if (prop1 && prop1.values.length > 0) {
          variationDisplay = prop1.values.join(', ')
          if (prop2 && prop2.values.length > 0) {
            variationDisplay += ' / ' + prop2.values.join(', ')
          }
        } else if (prop2 && prop2.values.length > 0) {
          variationDisplay = prop2.values.join(', ')
        }
        
        // Determine price, quantity, SKU locations
        const hasPriceOnProperty = listing.inventory.price_on_property.length > 0
        const hasQuantityOnProperty = listing.inventory.quantity_on_property.length > 0
        const hasSKUOnProperty = listing.inventory.sku_on_property.length > 0
        
        // Base listing price/quantity (if not on property)
        let listingPrice = ''
        let listingCurrency = ''
        let listingQuantity = ''
        let listingSKU = ''
        
        if (!hasPriceOnProperty && i === 0) {
          const priceVal = listing.price.amount / listing.price.divisor
          listingPrice = priceVal.toFixed(2)
          listingCurrency = listing.price.currency_code
        }
        
        if (!hasQuantityOnProperty && i === 0) {
          listingQuantity = listing.quantity.toString()
        }
        
        if (!hasSKUOnProperty && i === 0 && listing.inventory.products.length > 0 && !listing.inventory.products[0].is_deleted) {
          listingSKU = listing.inventory.products[0].sku
        }
        
        // Variation-specific price/quantity/SKU
        let variationPrice = ''
        let variationQuantity = ''
        let variationSKU = ''
        
        if (hasPriceOnProperty) {
          const priceVal = activeOffering.price.amount / activeOffering.price.divisor
          variationPrice = priceVal.toFixed(2)
        }
        
        if (hasQuantityOnProperty) {
          variationQuantity = activeOffering.quantity.toString()
        }
        
        if (hasSKUOnProperty) {
          variationSKU = product.sku
        }
        
        const row: string[] = [
          i === 0 ? listing.listing_id.toString() : '',  // Listing ID (only on first row)
          i === 0 ? decodeHTMLEntities(listing.title) : '',  // Title (only on first row)
          i === 0 ? decodeHTMLEntities(listing.description) : '',  // Description (only on first row)
          i === 0 ? listing.state : '',  // Status (only on first row)
          i === 0 ? listing.tags.join(',') : '',  // Tags (only on first row)
          variationDisplay,  // Variation display
          prop1 ? prop1.property_name : '',  // Property Name 1
          prop1 ? prop1.values.join(', ') : '',  // Property Option 1
          prop2 ? prop2.property_name : '',  // Property Name 2
          prop2 ? prop2.values.join(', ') : '',  // Property Option 2
          listingPrice,  // Price (listing-level if not on property)
          listingCurrency,  // Currency
          listingQuantity,  // Quantity (listing-level if not on property)
          listingSKU,  // SKU (listing-level if not on property)
          variationPrice,  // Variation Price (if price on property)
          variationQuantity,  // Variation Quantity (if quantity on property)
          variationSKU,  // Variation SKU (if SKU on property)
          activeOffering.is_enabled ? 'true' : 'false',
          product.product_id.toString(),
          prop1 ? prop1.property_id.toString() : '',
          prop1 ? prop1.value_ids.join(',') : '',
          prop2 ? prop2.property_id.toString() : '',
          prop2 ? prop2.value_ids.join(',') : '',
          product.product_id.toString(),  // Property Product ID (for backward compatibility)
        ]
        
        rows.push(row)
      }
    } else {
      // No variations - single row
      let productID = ''
      let sku = ''
      let quantity = ''
      let price = ''
      let currencyCode = ''
      
      // Find first non-deleted product
      const product = listing.inventory.products.find(p => !p.is_deleted)
      if (product) {
        productID = product.product_id.toString()
        sku = product.sku
        const offering = product.offerings.find(o => !o.is_deleted)
        if (offering) {
          quantity = offering.quantity.toString()
          const priceVal = offering.price.amount / offering.price.divisor
          price = priceVal.toFixed(2)
          currencyCode = offering.price.currency_code
        }
      }
      
      // If no product, use listing-level data
      if (!productID) {
        if (listing.inventory.sku_on_property.length === 0 && listing.inventory.products.length > 0) {
          sku = listing.inventory.products[0].sku
        }
        quantity = listing.quantity.toString()
        const priceVal = listing.price.amount / listing.price.divisor
        price = priceVal.toFixed(2)
        currencyCode = listing.price.currency_code
      }
      
          rows.push([
            listing.listing_id.toString(),
            decodeHTMLEntities(listing.title),
            decodeHTMLEntities(listing.description),
            listing.state,
            listing.tags.join(','),
            'N/A',  // No variation (single row, so all data is present)
        '', '', '', '',  // No Property Names/Options
        price,
        currencyCode,
        quantity,
        sku,
        '', '', '',  // No variation price/quantity/SKU
        'true',  // Enabled
        productID,
        '', '', '', '',  // No property IDs
        productID,  // Property Product ID (for backward compatibility)
      ])
    }
  }
  
  // Convert to CSV string (Excel-friendly with CRLF)
  return rows.map(row => {
    // Escape fields that contain commas, quotes, or newlines
    return row.map(field => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`
      }
      return field
    }).join(',')
  }).join('\r\n')
}

// Download CSV as file
export function downloadCSV(csvContent: string, filename: string = 'etsy-listings.csv'): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}
