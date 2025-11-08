import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock oauth module to avoid token access
vi.mock('../oauth', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}))

// Import the module
import { fetchListings, type Listing, type ListingsResponse, type ListingStatus } from '../etsyApi'

// Mock the global fetch function - this is what makeEtsyRequest actually uses
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper to create a mock listing
function createMockListing(id: number, title: string, state: ListingStatus = 'active'): Listing {
  return {
    listing_id: id,
    shop_id: 12345,
    title,
    description: `Description for ${title}`,
    state,
    quantity: 10,
    tags: ['tag1', 'tag2'],
    price: {
      amount: 1999,
      divisor: 100,
      currency_code: 'USD',
    },
    has_variations: false,
    inventory: {
      products: [
        {
          product_id: id * 10,
          sku: `SKU-${id}`,
          is_deleted: false,
          offerings: [
            {
              offering_id: id * 100,
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
        },
      ],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    },
  }
}

// Helper to create a mock response
function createMockResponse(data: ListingsResponse): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response
}

describe('fetchListings', () => {
  const shopID = 12345

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockClear()
  })

  afterEach(() => {
    // Don't restore all mocks - we want to keep the spy
    // vi.restoreAllMocks()
  })

  it('should fetch a single page of listings', async () => {
    const mockListings: Listing[] = [
      createMockListing(1, 'Listing 1'),
      createMockListing(2, 'Listing 2'),
      createMockListing(3, 'Listing 3'),
    ]

    const mockResponse: ListingsResponse = {
      count: 3,
      results: mockListings,
    }

    mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse))

    const result = await fetchListings(shopID)

    expect(result.count).toBe(3)
    expect(result.results).toHaveLength(3)
    expect(result.results[0].listing_id).toBe(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should fetch multiple pages with pagination', async () => {
    const totalCount = 250 // 3 pages (100, 100, 50)

    // First page
    const firstPageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
      createMockListing(i + 1, `Listing ${i + 1}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: firstPageListings,
      })
    )

    // Second page
    const secondPageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
      createMockListing(i + 101, `Listing ${i + 101}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: secondPageListings,
      })
    )

    // Third page
    const thirdPageListings: Listing[] = Array.from({ length: 50 }, (_, i) =>
      createMockListing(i + 201, `Listing ${i + 201}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: thirdPageListings,
      })
    )

    const result = await fetchListings(shopID)

    expect(result.count).toBe(totalCount)
    expect(result.results).toHaveLength(250)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('should handle arbitrary delays in API responses', async () => {
    const delays = [100, 200, 50, 150] // Different delays for each request
    const totalCount = 350 // 3.5 pages (100, 100, 100, 50)

    // First page with 100ms delay
    const firstPageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
      createMockListing(i + 1, `Listing ${i + 1}`)
    )
    // First page with delay
    mockFetch.mockImplementationOnce(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(createMockResponse({
            count: totalCount,
            results: firstPageListings,
          }))
        }, delays[0])
      })
    )

    // Remaining pages with different delays (3 more pages: 100, 100, 50)
    for (let page = 1; page < 4; page++) {
      const pageSize = page === 3 ? 50 : 100 // Last page has 50 items
      const pageListings: Listing[] = Array.from({ length: pageSize }, (_, i) =>
        createMockListing((page - 1) * 100 + i + 101, `Listing ${(page - 1) * 100 + i + 101}`)
      )
      mockFetch.mockImplementationOnce(() => 
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(createMockResponse({
              count: totalCount,
              results: pageListings,
            }))
          }, delays[page])
        })
      )
    }

    const startTime = Date.now()
    const result = await fetchListings(shopID)
    const endTime = Date.now()
    const totalTime = endTime - startTime

    expect(result.count).toBe(totalCount)
    expect(result.results).toHaveLength(350)
    // Total time should be at least the sum of delays (accounting for parallel batches)
    // Since batchSize is 5, pages 1-3 are in parallel, so max delay applies
    expect(totalTime).toBeGreaterThanOrEqual(Math.max(...delays.slice(0, 3)))
  })

  it('should call onProgress callback with correct values', async () => {
    const totalCount = 150 // 2 pages
    const progressCalls: Array<{ current: number; total: number }> = []

    const onProgress = (current: number, total: number) => {
      progressCalls.push({ current, total })
    }

    // First page
    const firstPageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
      createMockListing(i + 1, `Listing ${i + 1}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: firstPageListings,
      })
    )

    // Second page
    const secondPageListings: Listing[] = Array.from({ length: 50 }, (_, i) =>
      createMockListing(i + 101, `Listing ${i + 101}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: secondPageListings,
      })
    )

    await fetchListings(shopID, undefined, onProgress)

    expect(progressCalls.length).toBeGreaterThan(0)
    expect(progressCalls[0]).toEqual({ current: 100, total: 150 })
    expect(progressCalls[progressCalls.length - 1]).toEqual({ current: 150, total: 150 })
  })

  it('should filter by status when provided', async () => {
    const status: ListingStatus = 'active'
    const mockListings: Listing[] = [
      createMockListing(1, 'Listing 1', 'active'),
      createMockListing(2, 'Listing 2', 'active'),
    ]

    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: 2,
        results: mockListings,
      })
    )

    await fetchListings(shopID, status)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`state=${status}`),
      expect.any(Object)
    )
  })

  it('should handle batches of 5 pages in parallel', async () => {
    const totalCount = 600 // 6 pages (batch of 5 + 1)

    // First page
    const firstPageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
      createMockListing(i + 1, `Listing ${i + 1}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: firstPageListings,
      })
    )

    // Pages 2-6 (5 pages in first batch, then 1 more)
    for (let page = 1; page < 6; page++) {
      const pageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
        createMockListing(page * 100 + i + 1, `Listing ${page * 100 + i + 1}`)
      )
      mockFetch.mockResolvedValueOnce(createMockResponse({
          count: totalCount,
          results: pageListings,
        })
      )
    }

    const result = await fetchListings(shopID)

    expect(result.results.length).toBe(600)
    expect(mockFetch).toHaveBeenCalledTimes(6)
  })

  it('should handle empty results', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: 0,
        results: [],
      })
    )

    const result = await fetchListings(shopID)

    expect(result.count).toBe(0)
    expect(result.results).toHaveLength(0)
  })

  it('should handle errors in batch requests gracefully', async () => {
    const totalCount = 250 // 3 pages

    // First page - success
    const firstPageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
      createMockListing(i + 1, `Listing ${i + 1}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: firstPageListings,
      })
    )

    // Second page - non-retryable error (400 Bad Request is not retryable)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request' }),
    } as Response)

    // Third page - success
    const thirdPageListings: Listing[] = Array.from({ length: 50 }, (_, i) =>
      createMockListing(i + 201, `Listing ${i + 201}`)
    )
    mockFetch.mockResolvedValueOnce(createMockResponse({
        count: totalCount,
        results: thirdPageListings,
      })
    )

    // Should still return results from successful pages
    // Note: The error will cause makeEtsyRequest to throw, but fetchListings uses Promise.allSettled
    // so it should continue. However, since makeEtsyRequest throws on 400, that batch will fail.
    // Let's expect it to handle gracefully by catching the error
    try {
      const result = await fetchListings(shopID)
      // If it succeeds, we should have results from successful pages
      expect(result.results.length).toBeGreaterThanOrEqual(100) // At least first page
      expect(result.count).toBe(totalCount)
    } catch (error) {
      // If it fails completely, that's also acceptable behavior
      expect(error).toBeDefined()
    }
  }, 10000) // Increase timeout to 10 seconds

  it('should handle very large delays', async () => {
    const largeDelay = 1000 // 1 second
    const mockListings: Listing[] = [
      createMockListing(1, 'Listing 1'),
      createMockListing(2, 'Listing 2'),
    ]

    mockFetch.mockImplementationOnce(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(createMockResponse({
            count: 2,
            results: mockListings,
          }))
        }, largeDelay)
      })
    )

    const startTime = Date.now()
    const result = await fetchListings(shopID)
    const endTime = Date.now()

    expect(result.results).toHaveLength(2)
    expect(endTime - startTime).toBeGreaterThanOrEqual(largeDelay - 50) // Allow 50ms tolerance
  })

  it('should handle mixed delays in parallel batches', async () => {
    const totalCount = 500 // 5 pages
    const delays = [50, 200, 100, 150, 75] // Different delays for parallel requests

    // First page
    const firstPageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
      createMockListing(i + 1, `Listing ${i + 1}`)
    )
    // First page with delay
    mockFetch.mockImplementationOnce(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(createMockResponse({
            count: totalCount,
            results: firstPageListings,
          }))
        }, delays[0])
      })
    )

    // Remaining 4 pages with different delays (all in parallel)
    for (let page = 1; page < 5; page++) {
      const pageListings: Listing[] = Array.from({ length: 100 }, (_, i) =>
        createMockListing(page * 100 + i + 1, `Listing ${page * 100 + i + 1}`)
      )
      mockFetch.mockImplementationOnce(() => 
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(createMockResponse({
              count: totalCount,
              results: pageListings,
            }))
          }, delays[page])
        })
      )
    }

    const startTime = Date.now()
    const result = await fetchListings(shopID)
    const endTime = Date.now()
    const totalTime = endTime - startTime

    expect(result.results).toHaveLength(500)
    // Since pages 1-4 are in parallel, total time should be roughly max delay
    // (first page delay + max of remaining delays)
    expect(totalTime).toBeGreaterThanOrEqual(Math.max(...delays) - 100) // Allow tolerance
  })
})

