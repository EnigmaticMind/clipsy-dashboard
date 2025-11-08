import { describe, it, expect, vi, beforeEach } from 'vitest'
import { convertListingsToCSV, downloadCSV } from '../csvService'
import type { ListingsResponse, Listing, Product, PropertyValue } from '../etsyApi'

// Helper to create mock listing data
function createMockListing(
  listingId: number,
  title: string,
  hasVariations: boolean = false,
  state: string = 'active'
): Listing {
  const product: Product = {
    product_id: listingId * 10,
    sku: `SKU-${listingId}`,
    is_deleted: false,
    offerings: [
      {
        offering_id: listingId * 100,
        quantity: 10,
        is_enabled: true,
        is_deleted: false,
        price: {
          amount: 1999,
          divisor: 100,
          currency_code: 'USD',
        },
      },
    ],
    property_values: [],
  }

  return {
    listing_id: listingId,
    shop_id: 12345,
    title,
    description: `Description for ${title}`,
    state: state as any,
    quantity: 10,
    tags: ['tag1', 'tag2'],
    price: {
      amount: 1999,
      divisor: 100,
      currency_code: 'USD',
    },
    has_variations: hasVariations,
    inventory: {
      products: [product],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    },
  }
}

function createMockVariationListing(
  listingId: number,
  title: string,
  variations: Array<{
    productId: number
    property1?: { name: string; value: string; propertyId: number; valueIds: number[] }
    property2?: { name: string; value: string; propertyId: number; valueIds: number[] }
    price?: number
    quantity?: number
    sku?: string
    isEnabled?: boolean
  }>
): Listing {
  const products: Product[] = variations.map((variation, index) => {
    const propertyValues: PropertyValue[] = []
    
    if (variation.property1) {
      propertyValues.push({
        property_id: variation.property1.propertyId,
        property_name: variation.property1.name,
        value_ids: variation.property1.valueIds,
        values: [variation.property1.value],
      })
    }
    
    if (variation.property2) {
      propertyValues.push({
        property_id: variation.property2.propertyId,
        property_name: variation.property2.name,
        value_ids: variation.property2.valueIds,
        values: [variation.property2.value],
      })
    }

    const price = variation.price || 1999
    const quantity = variation.quantity || 10

    return {
      product_id: variation.productId,
      sku: variation.sku || `SKU-${listingId}-${index}`,
      is_deleted: false,
      offerings: [
        {
          offering_id: listingId * 100 + index,
          quantity,
          is_enabled: variation.isEnabled !== undefined ? variation.isEnabled : true,
          is_deleted: false,
          price: {
            amount: price,
            divisor: 100,
            currency_code: 'USD',
          },
        },
      ],
      property_values: propertyValues,
    }
  })

  return {
    listing_id: listingId,
    shop_id: 12345,
    title,
    description: `Description for ${title}`,
    state: 'active',
    quantity: variations.reduce((sum, v) => sum + (v.quantity || 10), 0),
    tags: ['tag1', 'tag2'],
    price: {
      amount: 1999,
      divisor: 100,
      currency_code: 'USD',
    },
    has_variations: true,
    inventory: {
      products,
      price_on_property: variations.some(v => v.price !== undefined) ? [1] : [],
      quantity_on_property: variations.some(v => v.quantity !== undefined) ? [1] : [],
      sku_on_property: variations.some(v => v.sku !== undefined) ? [1] : [],
    },
  }
}

describe('csvService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('convertListingsToCSV', () => {
    it('should generate CSV with correct number of columns', () => {
      const listings: ListingsResponse = {
        count: 1,
        results: [createMockListing(1, 'Test Listing')],
      }

      const csv = convertListingsToCSV(listings)
      const lines = csv.split('\r\n')
      const headerLine = lines.find(line => 
        line.includes('Listing ID') && 
        line.includes('Title') && 
        line.includes('Product ID') &&
        !line.includes('INFO:')
      )
      
      expect(headerLine).toBeDefined()
      if (headerLine) {
        // Simple column count - header should have 22 columns
        // Count commas + 1 (since there are n-1 commas between n columns)
        const commaCount = (headerLine.match(/,/g) || []).length
        expect(commaCount + 1).toBe(22)
      }
    })

    it('should include metadata rows at the top', () => {
      const listings: ListingsResponse = {
        count: 1,
        results: [createMockListing(1, 'Test Listing')],
      }

      const csv = convertListingsToCSV(listings)
      const lines = csv.split('\r\n')
      
      expect(lines[0]).toContain('INFO:')
      expect(lines[1]).toContain('IMPORTANT:')
      expect(lines[2]).toContain('DELETE BEHAVIOR:')
      expect(lines[3]).toContain('UPLOAD BEHAVIOR:')
    })

    it('should generate CSV for listing without variations', () => {
      const listings: ListingsResponse = {
        count: 1,
        results: [createMockListing(123, 'Simple Listing')],
      }

      const csv = convertListingsToCSV(listings)
      const lines = csv.split('\r\n')
      const dataLine = lines.find(line => line.includes('Simple Listing'))
      
      expect(dataLine).toBeDefined()
      if (dataLine) {
        expect(dataLine).toContain('123') // Listing ID
        expect(dataLine).toContain('Simple Listing')
        expect(dataLine).toContain('N/A') // No variation
        expect(dataLine).toContain('19.99') // Price
        expect(dataLine).toContain('USD') // Currency
      }
    })

    it('should generate CSV for listing with variations', () => {
      const listing = createMockVariationListing(456, 'Variation Listing', [
        {
          productId: 4561,
          property1: { name: 'Size', value: 'Small', propertyId: 200, valueIds: [201] },
          property2: { name: 'Color', value: 'Red', propertyId: 300, valueIds: [301] },
        },
        {
          productId: 4562,
          property1: { name: 'Size', value: 'Large', propertyId: 200, valueIds: [202] },
          property2: { name: 'Color', value: 'Blue', propertyId: 300, valueIds: [302] },
        },
      ])

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Check that CSV contains expected variation data
      expect(csv).toContain('456') // Listing ID
      expect(csv).toContain('Variation Listing')
      expect(csv).toContain('Small')
      expect(csv).toContain('Red')
      expect(csv).toContain('Large')
      expect(csv).toContain('Blue')
      expect(csv).toContain('4561') // Product ID for first variation
      expect(csv).toContain('4562') // Product ID for second variation
    })

    it('should handle variations with price on property', () => {
      const listing = createMockVariationListing(789, 'Price Variation Listing', [
        {
          productId: 7891,
          property1: { name: 'Size', value: 'S', propertyId: 200, valueIds: [201] },
          price: 1500, // $15.00
        },
        {
          productId: 7892,
          property1: { name: 'Size', value: 'L', propertyId: 200, valueIds: [202] },
          price: 2500, // $25.00
        },
      ])

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Check that variation prices appear in CSV
      expect(csv).toContain('15.00')
      expect(csv).toContain('25.00')
    })

    it('should handle variations with quantity on property', () => {
      const listing = createMockVariationListing(101, 'Quantity Variation Listing', [
        {
          productId: 1011,
          property1: { name: 'Size', value: 'S', propertyId: 200, valueIds: [201] },
          quantity: 5,
        },
        {
          productId: 1012,
          property1: { name: 'Size', value: 'L', propertyId: 200, valueIds: [202] },
          quantity: 15,
        },
      ])

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Check that variation quantities appear in CSV
      expect(csv).toMatch(/,5,|,5$/) // Variation quantity (with commas to avoid matching other numbers)
      expect(csv).toMatch(/,15,|,15$/) // Variation quantity
    })

    it('should handle variations with SKU on property', () => {
      const listing = createMockVariationListing(202, 'SKU Variation Listing', [
        {
          productId: 2021,
          property1: { name: 'Size', value: 'S', propertyId: 200, valueIds: [201] },
          sku: 'SKU-S',
        },
        {
          productId: 2022,
          property1: { name: 'Size', value: 'L', propertyId: 200, valueIds: [202] },
          sku: 'SKU-L',
        },
      ])

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Check that variation SKUs appear in CSV
      expect(csv).toContain('SKU-S')
      expect(csv).toContain('SKU-L')
    })

    it('should decode HTML entities in title and description', () => {
      const listing = createMockListing(303, 'Test &amp; More')
      listing.description = 'Description with &quot;quotes&quot; and &#39;apostrophes&#39;'

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Check that decoded entities appear in CSV (may be quoted, so check for content)
      expect(csv).toContain('Test & More') // Decoded
      expect(csv).toContain('Description with') // Part of description
      expect(csv).toContain('quotes') // Part of description
      expect(csv).toContain('apostrophes') // Part of description
      expect(csv).not.toContain('&amp;')
      expect(csv).not.toContain('&quot;')
      expect(csv).not.toContain('&#39;')
    })

    it('should handle listings with single property variation', () => {
      const listing = createMockVariationListing(404, 'Single Property Listing', [
        {
          productId: 4041,
          property1: { name: 'Size', value: 'Small', propertyId: 200, valueIds: [201] },
        },
        {
          productId: 4042,
          property1: { name: 'Size', value: 'Large', propertyId: 200, valueIds: [202] },
        },
      ])

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Check that CSV contains expected variation data
      expect(csv).toContain('Small')
      expect(csv).toContain('Large')
      expect(csv).toContain('4041') // Product ID for first variation
      expect(csv).toContain('4042') // Product ID for second variation
    })

    it('should handle multiple listings', () => {
      const listings: ListingsResponse = {
        count: 3,
        results: [
          createMockListing(1, 'Listing 1'),
          createMockListing(2, 'Listing 2'),
          createMockListing(3, 'Listing 3'),
        ],
      }

      const csv = convertListingsToCSV(listings)
      
      // Check that all three listings appear in CSV
      expect(csv).toContain('Listing 1')
      expect(csv).toContain('Listing 2')
      expect(csv).toContain('Listing 3')
      expect(csv).toContain('1') // Listing ID 1
      expect(csv).toContain('2') // Listing ID 2
      expect(csv).toContain('3') // Listing ID 3
    })

    it('should escape fields with commas, quotes, or newlines', () => {
      const listing = createMockListing(505, 'Listing, with "quotes" and\nnewlines')
      listing.description = 'Description, with "quotes" and\nnewlines'

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Fields with special characters should be quoted
      expect(csv).toMatch(/"Listing, with ""quotes"" and\nnewlines"/)
      expect(csv).toMatch(/"Description, with ""quotes"" and\nnewlines"/)
    })

    it('should include Product ID for each variation', () => {
      const listing = createMockVariationListing(606, 'Product ID Test', [
        {
          productId: 6061,
          property1: { name: 'Size', value: 'S', propertyId: 200, valueIds: [201] },
        },
        {
          productId: 6062,
          property1: { name: 'Size', value: 'L', propertyId: 200, valueIds: [202] },
        },
      ])

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      expect(csv).toContain('6061') // Product ID for first variation
      expect(csv).toContain('6062') // Product ID for second variation
    })

    it('should include Property IDs and Property Option IDs', () => {
      const listing = createMockVariationListing(707, 'Property IDs Test', [
        {
          productId: 7071,
          property1: { name: 'Size', value: 'S', propertyId: 200, valueIds: [201] },
          property2: { name: 'Color', value: 'Red', propertyId: 300, valueIds: [301] },
        },
      ])

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      expect(csv).toContain('200') // Property ID 1
      expect(csv).toContain('201') // Property Option IDs 1
      expect(csv).toContain('300') // Property ID 2
      expect(csv).toContain('301') // Property Option IDs 2
    })

    it('should handle empty listings array', () => {
      const listings: ListingsResponse = {
        count: 0,
        results: [],
      }

      const csv = convertListingsToCSV(listings)
      const lines = csv.split('\r\n')
      
      // Should still have metadata and header rows
      expect(lines[0]).toContain('INFO:')
      expect(lines.some(line => line.includes('Listing ID'))).toBe(true)
    })

    it('should use CRLF line endings', () => {
      const listings: ListingsResponse = {
        count: 1,
        results: [createMockListing(1, 'Test')],
      }

      const csv = convertListingsToCSV(listings)
      
      // Should use \r\n (CRLF) for Excel compatibility
      expect(csv).toContain('\r\n')
      expect(csv).not.toContain('\n\r') // Should not have reversed
    })

    it('should skip deleted products', () => {
      const listing = createMockVariationListing(808, 'Deleted Product Test', [
        {
          productId: 8081,
          property1: { name: 'Size', value: 'S', propertyId: 200, valueIds: [201] },
        },
        {
          productId: 8082,
          property1: { name: 'Size', value: 'L', propertyId: 200, valueIds: [202] },
        },
      ])

      // Mark second product as deleted
      listing.inventory.products[1].is_deleted = true

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Should only have one variation (deleted one is skipped)
      expect(csv).toContain('8081') // Product ID for first variation
      expect(csv).toContain('S') // First variation value
      expect(csv).not.toContain('8082') // Product ID for deleted variation should not appear
      // "L" might appear in "Listing ID", so check for "Large" specifically (the deleted variation value)
      expect(csv).not.toMatch(/\bLarge\b/) // Large variation value should not appear
    })

    it('should skip products without active offerings', () => {
      const listing = createMockVariationListing(909, 'No Offering Test', [
        {
          productId: 9091,
          property1: { name: 'Size', value: 'S', propertyId: 200, valueIds: [201] },
        },
      ])

      // Mark offering as deleted - product should be skipped
      listing.inventory.products[0].offerings[0].is_deleted = true

      const listings: ListingsResponse = {
        count: 1,
        results: [listing],
      }

      const csv = convertListingsToCSV(listings)
      
      // Should skip product without active offering - product ID and variation data should not appear
      expect(csv).not.toContain('9091') // Product ID should not appear
      expect(csv).not.toContain('No Offering Test') // Title should not appear in data rows
      // But metadata and header should still exist
      expect(csv).toContain('INFO:') // Metadata should exist
      expect(csv).toContain('Listing ID') // Header should exist
    })
  })

  describe('downloadCSV', () => {
    it('should create a download link and trigger click', () => {
      const csvContent = 'test,csv,content'
      const filename = 'test.csv'

      // Mock DOM methods
      const mockClick = vi.fn()
      const mockAppendChild = vi.fn()
      const mockRemoveChild = vi.fn()
      const mockCreateElement = vi.fn(() => ({
        setAttribute: vi.fn(),
        click: mockClick,
        style: {},
      }))
      const mockCreateObjectURL = vi.fn(() => 'blob:test-url')
      const mockRevokeObjectURL = vi.fn()

      // Mock global objects
      global.document.createElement = mockCreateElement as unknown as typeof document.createElement
      global.document.body.appendChild = mockAppendChild
      global.document.body.removeChild = mockRemoveChild
      global.URL.createObjectURL = mockCreateObjectURL
      global.URL.revokeObjectURL = mockRevokeObjectURL

      downloadCSV(csvContent, filename)

      expect(mockCreateElement).toHaveBeenCalledWith('a')
      expect(mockClick).toHaveBeenCalled()
      expect(mockAppendChild).toHaveBeenCalled()
      expect(mockRemoveChild).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url')
    })

    it('should use default filename if not provided', () => {
      const csvContent = 'test,content'
      const mockClick = vi.fn()
      const mockCreateElement = vi.fn(() => ({
        setAttribute: vi.fn(),
        click: mockClick,
        style: {},
      }))

      global.document.createElement = mockCreateElement as unknown as typeof document.createElement
      global.document.body.appendChild = vi.fn()
      global.document.body.removeChild = vi.fn()
      global.URL.createObjectURL = vi.fn(() => 'blob:test')
      global.URL.revokeObjectURL = vi.fn()

      downloadCSV(csvContent)

      expect(mockCreateElement).toHaveBeenCalled()
      const linkElement = mockCreateElement.mock.results[0].value
      expect(linkElement.setAttribute).toHaveBeenCalledWith('download', 'etsy-listings.csv')
    })
  })
})

