// Test script to read a Google Sheet and verify variation processing
// This should be run in the browser console or as part of the extension

import { readSheetByGid } from '../src/services/googleSheets/sheetReaderHelper'
import { parseUploadCSV } from '../src/services/uploadService'
import { COLUMNS } from '../src/services/googleSheets/constants'

const spreadsheetId = '15569wazfERXVJr3hrU3MVgo-EsI4Nwr6XKor419OkFw'
const gid = '350706179'
const expectedListingId = 4403181452

async function testSheetVariation() {
  try {
    console.log('Reading Google Sheet...')
    const { sheetName, values } = await readSheetByGid(spreadsheetId, gid)
    console.log(`Found sheet: "${sheetName}" with ${values.length} rows`)
    
    // Find the variation row for listing 4403181452
    console.log('\nSearching for variation row...')
    let foundVariation = false
    let variationRow: string[] | null = null
    let rowIndex = -1
    
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || []
      const listingId = row[COLUMNS.listing_id]?.trim()
      const propertyOption1 = row[COLUMNS.property_option_1]?.trim()
      const propertyOption2 = row[COLUMNS.property_option_2]?.trim()
      
      // Check if this is the variation row we're looking for
      if (listingId === expectedListingId.toString() || listingId === '') {
        // Check if it has variation data (Heather Medium)
        if (propertyOption1?.toLowerCase().includes('heather') && 
            propertyOption2?.toLowerCase().includes('medium')) {
          foundVariation = true
          variationRow = row
          rowIndex = i
          console.log(`\nFound variation row at index ${i}:`)
          console.log(`  Listing ID: ${row[COLUMNS.listing_id] || '(empty)'}`)
          console.log(`  Title: ${row[COLUMNS.title] || '(empty)'}`)
          console.log(`  Variation: ${row[COLUMNS.variation] || '(empty)'}`)
          console.log(`  Property Name 1: ${row[COLUMNS.property_name_1] || '(empty)'}`)
          console.log(`  Property Option 1: ${row[COLUMNS.property_option_1] || '(empty)'}`)
          console.log(`  Property Name 2: ${row[COLUMNS.property_name_2] || '(empty)'}`)
          console.log(`  Property Option 2: ${row[COLUMNS.property_option_2] || '(empty)'}`)
          console.log(`  Variation Price: ${row[COLUMNS.variation_price] || '(empty)'}`)
          console.log(`  Variation Quantity: ${row[COLUMNS.variation_quantity] || '(empty)'}`)
          console.log(`  Price: ${row[COLUMNS.price] || '(empty)'}`)
          console.log(`  Quantity: ${row[COLUMNS.quantity] || '(empty)'}`)
          break
        }
      }
    }
    
    if (!foundVariation) {
      console.log('\n❌ Variation row not found!')
      console.log('Expected: Listing ID 4403181452 with "Heather" and "Medium"')
      console.log('\nAll rows with listing ID 4403181452:')
      for (let i = 0; i < values.length; i++) {
        const row = values[i] || []
        const listingId = row[COLUMNS.listing_id]?.trim()
        if (listingId === expectedListingId.toString()) {
          console.log(`Row ${i}:`, {
            listingId: row[COLUMNS.listing_id],
            title: row[COLUMNS.title],
            variation: row[COLUMNS.variation],
            propertyOption1: row[COLUMNS.property_option_1],
            propertyOption2: row[COLUMNS.property_option_2],
          })
        }
      }
      return
    }
    
    // Convert sheet data to CSV format for parsing
    console.log('\n\nConverting to CSV format and parsing...')
    const csvRows = values.map(row => row.join(','))
    const csvContent = csvRows.join('\n')
    
    // Create a File-like object for parsing
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const file = new File([blob], 'test-sheet.csv', { type: 'text/csv' })
    
    const listings = await parseUploadCSV(file)
    console.log(`\nParsed ${listings.length} listings`)
    
    // Find the listing with ID 4403181452
    const targetListing = listings.find(l => l.listingID === expectedListingId)
    
    if (!targetListing) {
      console.log('\n❌ Listing 4403181452 not found in parsed listings!')
      console.log('Found listings:', listings.map(l => l.listingID))
      return
    }
    
    console.log(`\n✅ Found listing ${targetListing.listingID}`)
    console.log(`  Title: ${targetListing.title}`)
    console.log(`  Has Variations: ${targetListing.hasVariations}`)
    console.log(`  Variations count: ${targetListing.variations.length}`)
    
    // Find the Heather Medium variation
    const heatherMediumVariation = targetListing.variations.find(v => 
      v.propertyOption1?.toLowerCase().includes('heather') &&
      v.propertyOption2?.toLowerCase().includes('medium')
    )
    
    if (!heatherMediumVariation) {
      console.log('\n❌ Heather Medium variation not found!')
      console.log('Found variations:', targetListing.variations.map(v => ({
        prop1: v.propertyOption1,
        prop2: v.propertyOption2,
        price: v.propertyPrice,
        quantity: v.propertyQuantity,
      })))
      return
    }
    
    console.log('\n✅ Found Heather Medium variation:')
    console.log(`  Property Name 1: ${heatherMediumVariation.propertyName1}`)
    console.log(`  Property Option 1: ${heatherMediumVariation.propertyOption1}`)
    console.log(`  Property Name 2: ${heatherMediumVariation.propertyName2}`)
    console.log(`  Property Option 2: ${heatherMediumVariation.propertyOption2}`)
    console.log(`  Price: ${heatherMediumVariation.propertyPrice}`)
    console.log(`  Quantity: ${heatherMediumVariation.propertyQuantity}`)
    
    // Verify expected values
    const priceMatch = heatherMediumVariation.propertyPrice === 45.99
    const quantityMatch = heatherMediumVariation.propertyQuantity === 100
    
    if (priceMatch && quantityMatch) {
      console.log('\n✅ Variation data matches expected values!')
      console.log('  Price: 45.99 ✓')
      console.log('  Quantity: 100 ✓')
    } else {
      console.log('\n⚠️  Variation data does not match expected values:')
      if (!priceMatch) {
        console.log(`  Expected price: 45.99, Got: ${heatherMediumVariation.propertyPrice}`)
      }
      if (!quantityMatch) {
        console.log(`  Expected quantity: 100, Got: ${heatherMediumVariation.propertyQuantity}`)
      }
    }
    
  } catch (error) {
    console.error('Error testing sheet variation:', error)
    throw error
  }
}

// Export for use in browser console or extension
if (typeof window !== 'undefined') {
  (window as any).testSheetVariation = testSheetVariation
}

export { testSheetVariation }

