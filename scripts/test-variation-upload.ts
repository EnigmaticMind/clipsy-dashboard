// Test script to verify variation upload logic
// This simulates what happens when uploading from Google Sheets

import { parseUploadCSV } from '../src/services/uploadService'
import { COLUMNS } from '../src/services/googleSheets/constants'

// Simulate a CSV row for the variation
// Based on the Google Sheet structure
function createTestCSV(): string {
  const header = [
    'Listing ID (DO NOT EDIT)',
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
  ].join(',')

  // Listing row (with listing info, no variation data)
  const listingRow = [
    '4403181452',           // Listing ID
    'My Product Title',     // Title
    'Product description',   // Description
    'active',               // Status
    'tag1,tag2',            // Tags
    '',                     // Variation (empty for listing row)
    '',                     // Property Name 1
    '',                     // Property Option 1
    '',                     // Property Name 2
    '',                     // Property Option 2
    '',                     // Price
    'USD',                  // Currency Code
    '',                     // Quantity
    '',                     // SKU
    '',                     // Variation Price
    '',                     // Variation Quantity
    '',                     // Variation SKU
    'cotton',               // Materials
    '',                     // Shipping Profile ID
    '',                     // Processing Min
    '',                     // Processing Max
    '',                     // Product ID
    '',                     // Property ID 1
    '',                     // Property Option IDs 1
    '',                     // Property ID 2
    ''                      // Property Option IDs 2
  ].join(',')

  // Variation row (Heather Medium with price and quantity)
  const variationRow = [
    '4403181452',           // Listing ID (references the listing)
    '',                     // Title (empty for variation row)
    '',                     // Description (empty)
    '',                     // Status (empty)
    '',                     // Tags (empty)
    'Heather / Medium',     // Variation display
    'Colors',               // Property Name 1
    'Heather',              // Property Option 1
    'Size',                 // Property Name 2
    'Medium',               // Property Option 2
    '',                     // Price (empty - using variation price)
    'USD',                  // Currency Code
    '',                     // Quantity (empty - using variation quantity)
    '',                     // SKU
    '45.99',                // Variation Price
    '100',                  // Variation Quantity
    '',                     // Variation SKU
    '',                     // Materials (empty)
    '',                     // Shipping Profile ID
    '',                     // Processing Min
    '',                     // Processing Max
    '',                     // Product ID (empty - will be created)
    '',                     // Property ID 1 (empty - will be resolved)
    '',                     // Property Option IDs 1 (empty - will be resolved)
    '',                     // Property ID 2 (empty - will be resolved)
    ''                      // Property Option IDs 2 (empty - will be resolved)
  ].join(',')

  return [header, listingRow, variationRow].join('\n')
}

async function testVariationUpload() {
  console.log('Testing variation upload logic...\n')
  
  try {
    // Create test CSV
    const csvContent = createTestCSV()
    console.log('Created test CSV:')
    console.log(csvContent)
    console.log('\n')
    
    // Convert to File object
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const file = new File([blob], 'test-variation.csv', { type: 'text/csv' })
    
    // Parse the CSV
    console.log('Parsing CSV...')
    const listings = await parseUploadCSV(file)
    
    console.log(`\n✅ Parsed ${listings.length} listing(s)`)
    
    // Find the target listing
    const targetListing = listings.find(l => l.listingID === 4403181452)
    
    if (!targetListing) {
      console.error('❌ Listing 4403181452 not found!')
      console.log('Found listings:', listings.map(l => l.listingID))
      return
    }
    
    console.log(`\n✅ Found listing ${targetListing.listingID}`)
    console.log(`  Title: ${targetListing.title}`)
    console.log(`  Has Variations: ${targetListing.hasVariations}`)
    console.log(`  Variations count: ${targetListing.variations.length}`)
    
    if (!targetListing.hasVariations) {
      console.error('❌ Listing does not have variations flag set!')
      return
    }
    
    if (targetListing.variations.length === 0) {
      console.error('❌ No variations found!')
      return
    }
    
    // Find the Heather Medium variation
    const heatherMedium = targetListing.variations.find(v => 
      v.propertyOption1?.toLowerCase().includes('heather') &&
      v.propertyOption2?.toLowerCase().includes('medium')
    )
    
    if (!heatherMedium) {
      console.error('❌ Heather Medium variation not found!')
      console.log('Found variations:', targetListing.variations.map(v => ({
        prop1: v.propertyOption1,
        prop2: v.propertyOption2,
        price: v.propertyPrice,
        quantity: v.propertyQuantity,
      })))
      return
    }
    
    console.log('\n✅ Found Heather Medium variation:')
    console.log(`  Property Name 1: ${heatherMedium.propertyName1}`)
    console.log(`  Property Option 1: ${heatherMedium.propertyOption1}`)
    console.log(`  Property Name 2: ${heatherMedium.propertyName2}`)
    console.log(`  Property Option 2: ${heatherMedium.propertyOption2}`)
    console.log(`  Price: ${heatherMedium.propertyPrice}`)
    console.log(`  Quantity: ${heatherMedium.propertyQuantity}`)
    
    // Verify values
    const priceMatch = heatherMedium.propertyPrice === 45.99
    const quantityMatch = heatherMedium.propertyQuantity === 100
    
    if (priceMatch && quantityMatch) {
      console.log('\n✅ All values match expected:')
      console.log('  Price: 45.99 ✓')
      console.log('  Quantity: 100 ✓')
      console.log('\n✅ Test PASSED - Variation would be created correctly!')
    } else {
      console.log('\n⚠️  Values do not match:')
      if (!priceMatch) {
        console.log(`  Expected price: 45.99, Got: ${heatherMedium.propertyPrice}`)
      }
      if (!quantityMatch) {
        console.log(`  Expected quantity: 100, Got: ${heatherMedium.propertyQuantity}`)
      }
      console.log('\n❌ Test FAILED')
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error)
    throw error
  }
}

// Export for use
export { testVariationUpload }

// If running in Node.js environment (for testing)
if (typeof require !== 'undefined' && require.main === module) {
  console.log('Note: This script needs to run in a browser environment with File API support.')
  console.log('Run it in the browser console or as part of the extension.')
}

