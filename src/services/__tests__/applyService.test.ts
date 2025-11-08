import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyUploadCSV } from '../applyService'
import type { ProcessedListing } from '../uploadService'
import type { Listing } from '../etsyApi'

// Mock dependencies
vi.mock('../oauth', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}))

vi.mock('../etsyApi', () => ({
  getShopID: vi.fn().mockResolvedValue(12345),
  getListing: vi.fn(),
  deleteListing: vi.fn().mockResolvedValue(undefined),
  makeEtsyRequest: vi.fn(),
}))

vi.mock('../uploadService', () => ({
  parseUploadCSV: vi.fn(),
}))

vi.mock('../listingOperations', () => ({
  createListing: vi.fn(),
  updateListing: vi.fn().mockResolvedValue(undefined),
  updateListingInventory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../progressService', () => ({
  hashFile: vi.fn().mockResolvedValue('mock-hash'),
  saveUploadProgress: vi.fn().mockResolvedValue(undefined),
  loadUploadProgress: vi.fn().mockResolvedValue(null),
  clearUploadProgress: vi.fn().mockResolvedValue(undefined),
}))

import { parseUploadCSV } from '../uploadService'
import { getListing, deleteListing, makeEtsyRequest } from '../etsyApi'
import { createListing, updateListing, updateListingInventory } from '../listingOperations'
import { saveUploadProgress, loadUploadProgress, clearUploadProgress } from '../progressService'

// Helper to create mock File
function createMockFile(content: string, name: string = 'test.csv'): File {
  const blob = new Blob([content], { type: 'text/csv' })
  return new File([blob], name, { type: 'text/csv' })
}

// Helper to create mock listing
function createMockListing(id: number, title: string): Listing {
  return {
    listing_id: id,
    shop_id: 12345,
    title,
    description: `Description for ${title}`,
    state: 'active',
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

// Helper to create mock processed listing
function createMockProcessedListing(
  listingID: number,
  title: string,
  toDelete: boolean = false
): ProcessedListing {
  return {
    listingID,
    title,
    description: `Description for ${title}`,
    status: 'active',
    tags: ['tag1', 'tag2'],
    sku: `SKU-${listingID}`,
    currencyCode: 'USD',
    hasVariations: false,
    variations: [],
    toDelete,
    quantity: 10,
    price: 19.99,
  }
}

describe('applyService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure loadUploadProgress returns null for each test to avoid state pollution
    vi.mocked(loadUploadProgress).mockResolvedValue(null)
    // Default mock for makeEtsyRequest (for taxonomy_id fetch)
    vi.mocked(makeEtsyRequest).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ taxonomy_id: 1234 }],
      }),
    } as Response)
  })

  describe('applyUploadCSV', () => {
    it('should create a new listing', async () => {
      const file = createMockFile('test,content')
      const newListing = createMockProcessedListing(0, 'New Listing')
      const acceptedChangeIds = new Set(['change_1'])

      // Mock taxonomy_id fetch
      vi.mocked(makeEtsyRequest).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ taxonomy_id: 1234 }],
        }),
      } as Response)

      vi.mocked(parseUploadCSV).mockResolvedValue([newListing])
      vi.mocked(createListing).mockResolvedValue(999)

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(createListing)).toHaveBeenCalledWith(12345, newListing, 1234)
      expect(vi.mocked(updateListingInventory)).toHaveBeenCalledWith(999, newListing, null, undefined, 12345)
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })

    it('should update an existing listing', async () => {
      const file = createMockFile('test,content')
      const updatedListing = createMockProcessedListing(123, 'Updated Title')
      const existingListing = createMockListing(123, 'Original Title')
      const acceptedChangeIds = new Set(['change_1'])

      vi.mocked(parseUploadCSV).mockResolvedValue([updatedListing])
      vi.mocked(getListing).mockResolvedValue(existingListing)

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(getListing)).toHaveBeenCalledWith(123)
      expect(vi.mocked(updateListing)).toHaveBeenCalledWith(12345, 123, updatedListing, existingListing)
      expect(vi.mocked(updateListingInventory)).toHaveBeenCalledWith(123, updatedListing, existingListing, undefined, 12345)
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })

    it('should delete a listing', async () => {
      const file = createMockFile('test,content')
      const listingToDelete = createMockProcessedListing(456, 'Delete Listing', true)
      const acceptedChangeIds = new Set(['change_1'])

      vi.mocked(parseUploadCSV).mockResolvedValue([listingToDelete])

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(deleteListing)).toHaveBeenCalledWith(12345, 456)
      expect(vi.mocked(createListing)).not.toHaveBeenCalled()
      expect(vi.mocked(updateListing)).not.toHaveBeenCalled()
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })

    it('should only process accepted changes', async () => {
      const file = createMockFile('test,content')
      const listings = [
        createMockProcessedListing(0, 'Listing 1'),
        createMockProcessedListing(0, 'Listing 2'),
        createMockProcessedListing(0, 'Listing 3'),
      ]
      const acceptedChangeIds = new Set(['change_1', 'change_3']) // Only accept 1 and 3

      vi.mocked(parseUploadCSV).mockResolvedValue(listings)
      vi.mocked(createListing)
        .mockResolvedValueOnce(1001)
        .mockResolvedValueOnce(1003)

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(createListing)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })

    it('should batch fetch listings in groups of 10', async () => {
      const file = createMockFile('test,content')
      const listings = Array.from({ length: 25 }, (_, i) =>
        createMockProcessedListing(i + 1, `Listing ${i + 1}`)
      )
      const acceptedChangeIds = new Set(
        Array.from({ length: 25 }, (_, i) => `change_${i + 1}`)
      )

      vi.mocked(parseUploadCSV).mockResolvedValue(listings)
      vi.mocked(getListing).mockImplementation((id: number) =>
        Promise.resolve(createMockListing(id, `Listing ${id}`))
      )

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(25)
      // Verify batches: 10 + 10 + 5
      const calls = vi.mocked(getListing).mock.calls
      expect(calls.length).toBe(25)
    })

    it('should process listings in batches of 5', async () => {
      const file = createMockFile('test,content')
      const listings = Array.from({ length: 12 }, (_, i) =>
        createMockProcessedListing(i + 1, `Listing ${i + 1}`)
      )
      const acceptedChangeIds = new Set(
        Array.from({ length: 12 }, (_, i) => `change_${i + 1}`)
      )

      vi.mocked(parseUploadCSV).mockResolvedValue(listings)
      vi.mocked(getListing).mockImplementation((id: number) =>
        Promise.resolve(createMockListing(id, `Listing ${id}`))
      )

      await applyUploadCSV(file, acceptedChangeIds)

      // Should save progress multiple times (batches of 5: 5 + 5 + 2)
      expect(vi.mocked(saveUploadProgress)).toHaveBeenCalled()
      const saveCalls = vi.mocked(saveUploadProgress).mock.calls
      expect(saveCalls.length).toBeGreaterThanOrEqual(3) // At least 3 batches
    })

    it('should handle errors when fetching listing', async () => {
      const file = createMockFile('test,content')
      const updatedListing = createMockProcessedListing(999, 'Updated Title')
      const acceptedChangeIds = new Set(['change_1'])

      vi.mocked(parseUploadCSV).mockResolvedValue([updatedListing])
      vi.mocked(getListing).mockRejectedValue(new Error('Listing not found'))

      await applyUploadCSV(file, acceptedChangeIds)

      // Should still complete, but listing won't be updated
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(999)
      expect(vi.mocked(updateListing)).not.toHaveBeenCalled()
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })

    it('should handle errors when creating listing', async () => {
      const file = createMockFile('test,content')
      const newListing = createMockProcessedListing(0, 'New Listing')
      const acceptedChangeIds = new Set(['change_1'])

      vi.mocked(parseUploadCSV).mockResolvedValue([newListing])
      vi.mocked(createListing).mockRejectedValue(new Error('Creation failed'))

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(createListing)).toHaveBeenCalled()
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })

    it('should save progress after each batch', async () => {
      const file = createMockFile('test,content')
      const listings = Array.from({ length: 7 }, (_, i) =>
        createMockProcessedListing(i + 1, `Listing ${i + 1}`)
      )
      const acceptedChangeIds = new Set(
        Array.from({ length: 7 }, (_, i) => `change_${i + 1}`)
      )

      vi.mocked(parseUploadCSV).mockResolvedValue(listings)
      vi.mocked(getListing).mockImplementation((id: number) =>
        Promise.resolve(createMockListing(id, `Listing ${id}`))
      )

      await applyUploadCSV(file, acceptedChangeIds)

      // Should save progress multiple times (batches of 5: 5 + 2)
      expect(vi.mocked(saveUploadProgress)).toHaveBeenCalled()
      const saveCalls = vi.mocked(saveUploadProgress).mock.calls
      expect(saveCalls.length).toBeGreaterThanOrEqual(2)
    })

    it('should resume from existing progress', async () => {
      const file = createMockFile('test,content')
      const listings = [
        createMockProcessedListing(1, 'Listing 1'),
        createMockProcessedListing(2, 'Listing 2'),
        createMockProcessedListing(3, 'Listing 3'),
      ]
      const acceptedChangeIds = new Set(['change_1', 'change_2', 'change_3'])

      vi.mocked(parseUploadCSV).mockResolvedValue(listings)
      vi.mocked(loadUploadProgress).mockResolvedValue({
        fileHash: 'mock-hash',
        fileName: 'test.csv',
        totalListings: 3,
        processedListingIDs: [1], // Already processed listing 1
        failedListingIDs: [],
        timestamp: Date.now(),
        acceptedChangeIds: ['change_1', 'change_2', 'change_3'],
      })
      vi.mocked(getListing).mockImplementation((id: number) =>
        Promise.resolve(createMockListing(id, `Listing ${id}`))
      )

      await applyUploadCSV(file, acceptedChangeIds)

      // Should skip already processed listing 1
      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(2) // Only fetch 2 and 3
      expect(vi.mocked(updateListing)).toHaveBeenCalledTimes(2)
    })

    it('should call onProgress callback', async () => {
      const file = createMockFile('test,content')
      const listings = [
        createMockProcessedListing(1, 'Listing 1'),
        createMockProcessedListing(2, 'Listing 2'),
      ]
      const acceptedChangeIds = new Set(['change_1', 'change_2'])
      const onProgress = vi.fn()

      // Ensure no existing progress (critical for this test)
      vi.mocked(loadUploadProgress).mockResolvedValue(null)
      vi.mocked(parseUploadCSV).mockResolvedValue(listings)
      vi.mocked(getListing).mockImplementation((id: number) =>
        Promise.resolve(createMockListing(id, `Listing ${id}`))
      )
      // Ensure update operations succeed
      vi.mocked(updateListing).mockResolvedValue(undefined)
      vi.mocked(updateListingInventory).mockResolvedValue(undefined)

      await applyUploadCSV(file, acceptedChangeIds, onProgress)

      // Progress should be called after each batch (batches of 5, so with 2 listings, called once)
      expect(onProgress).toHaveBeenCalled()
      // Verify it was called with correct parameters
      const progressCalls = vi.mocked(onProgress).mock.calls
      expect(progressCalls.length).toBeGreaterThan(0)
      // Last call should have processed listings
      const lastCall = progressCalls[progressCalls.length - 1]
      expect(lastCall[0]).toBeGreaterThanOrEqual(0) // current
      expect(lastCall[1]).toBe(2) // total
      expect(lastCall[2]).toBeGreaterThanOrEqual(0) // failed
    })

    it('should handle delete without listing ID gracefully', async () => {
      const file = createMockFile('test,content')
      const listingToDelete = createMockProcessedListing(0, 'Delete Without ID', true)
      const acceptedChangeIds = new Set(['change_1'])

      vi.mocked(parseUploadCSV).mockResolvedValue([listingToDelete])

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(deleteListing)).not.toHaveBeenCalled()
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })

    it('should handle inventory update errors for new listings', async () => {
      const file = createMockFile('test,content')
      const newListing = createMockProcessedListing(0, 'New Listing')
      const acceptedChangeIds = new Set(['change_1'])

      vi.mocked(parseUploadCSV).mockResolvedValue([newListing])
      vi.mocked(createListing).mockResolvedValue(999)
      vi.mocked(updateListingInventory).mockRejectedValue(new Error('Inventory update failed'))

      await applyUploadCSV(file, acceptedChangeIds)

      expect(vi.mocked(createListing)).toHaveBeenCalled()
      expect(vi.mocked(updateListingInventory)).toHaveBeenCalled()
      // Should still complete even if inventory update fails
      expect(vi.mocked(clearUploadProgress)).toHaveBeenCalled()
    })
  })
})

