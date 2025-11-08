import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBackupCSV } from '../backupService'
import type { PreviewResponse, PreviewChange } from '../previewService'
import type { Listing } from '../etsyApi'

// Mock dependencies
vi.mock('../etsyApi', () => ({
  getListing: vi.fn(),
}))

vi.mock('../csvService', () => ({
  convertListingsToCSV: vi.fn().mockReturnValue('mock,csv,content'),
  downloadCSV: vi.fn(),
}))

import { getListing } from '../etsyApi'
import { convertListingsToCSV, downloadCSV } from '../csvService'

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

// Helper to create mock preview change
function createMockPreviewChange(
  changeId: string,
  listingId: number,
  changeType: 'create' | 'update' | 'delete'
): PreviewChange {
  return {
    changeId,
    listingId,
    changeType,
    title: `Listing ${listingId}`,
    fieldChanges: [],
    variationChanges: [],
  }
}

describe('backupService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createBackupCSV', () => {
    it('should create backup for update changes', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 123, 'update'),
          createMockPreviewChange('change_2', 456, 'update'),
        ],
        summary: {
          totalChanges: 2,
          creates: 0,
          updates: 2,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1', 'change_2']
      const listing1 = createMockListing(123, 'Listing 123')
      const listing2 = createMockListing(456, 'Listing 456')

      vi.mocked(getListing)
        .mockResolvedValueOnce(listing1)
        .mockResolvedValueOnce(listing2)

      await createBackupCSV(previewData, acceptedChangeIds)

      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(123)
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(456)
      expect(vi.mocked(convertListingsToCSV)).toHaveBeenCalledWith({
        count: 2,
        results: [listing1, listing2],
      })
      expect(vi.mocked(downloadCSV)).toHaveBeenCalled()
    })

    it('should create backup for delete changes', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 789, 'delete'),
        ],
        summary: {
          totalChanges: 1,
          creates: 0,
          updates: 0,
          deletes: 1,
        },
      }
      const acceptedChangeIds = ['change_1']
      const listing = createMockListing(789, 'Listing 789')

      vi.mocked(getListing).mockResolvedValue(listing)

      await createBackupCSV(previewData, acceptedChangeIds)

      expect(vi.mocked(getListing)).toHaveBeenCalledWith(789)
      expect(vi.mocked(convertListingsToCSV)).toHaveBeenCalledWith({
        count: 1,
        results: [listing],
      })
      expect(vi.mocked(downloadCSV)).toHaveBeenCalled()
    })

    it('should not backup create changes', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 0, 'create'),
          createMockPreviewChange('change_2', 123, 'update'),
        ],
        summary: {
          totalChanges: 2,
          creates: 1,
          updates: 1,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1', 'change_2']
      const listing = createMockListing(123, 'Listing 123')

      vi.mocked(getListing).mockResolvedValue(listing)

      await createBackupCSV(previewData, acceptedChangeIds)

      // Should only fetch listing 123 (update), not listing 0 (create)
      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(123)
      expect(vi.mocked(convertListingsToCSV)).toHaveBeenCalledWith({
        count: 1,
        results: [listing],
      })
    })

    it('should only backup accepted changes', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 100, 'update'),
          createMockPreviewChange('change_2', 200, 'update'),
          createMockPreviewChange('change_3', 300, 'update'),
        ],
        summary: {
          totalChanges: 3,
          creates: 0,
          updates: 3,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1', 'change_3'] // Only accept 1 and 3
      const listing1 = createMockListing(100, 'Listing 100')
      const listing3 = createMockListing(300, 'Listing 300')

      vi.mocked(getListing)
        .mockResolvedValueOnce(listing1)
        .mockResolvedValueOnce(listing3)

      await createBackupCSV(previewData, acceptedChangeIds)

      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(100)
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(300)
      expect(vi.mocked(getListing)).not.toHaveBeenCalledWith(200)
      expect(vi.mocked(convertListingsToCSV)).toHaveBeenCalledWith({
        count: 2,
        results: [listing1, listing3],
      })
    })

    it('should handle empty preview data', async () => {
      const previewData: PreviewResponse = {
        changes: [],
        summary: {
          totalChanges: 0,
          creates: 0,
          updates: 0,
          deletes: 0,
        },
      }
      const acceptedChangeIds: string[] = []

      await createBackupCSV(previewData, acceptedChangeIds)

      expect(vi.mocked(getListing)).not.toHaveBeenCalled()
      expect(vi.mocked(convertListingsToCSV)).not.toHaveBeenCalled()
      expect(vi.mocked(downloadCSV)).not.toHaveBeenCalled()
    })

    it('should handle only create changes (nothing to backup)', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 0, 'create'),
          createMockPreviewChange('change_2', 0, 'create'),
        ],
        summary: {
          totalChanges: 2,
          creates: 2,
          updates: 0,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1', 'change_2']

      await createBackupCSV(previewData, acceptedChangeIds)

      expect(vi.mocked(getListing)).not.toHaveBeenCalled()
      expect(vi.mocked(convertListingsToCSV)).not.toHaveBeenCalled()
      expect(vi.mocked(downloadCSV)).not.toHaveBeenCalled()
    })

    it('should handle errors when fetching listings gracefully', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 123, 'update'),
          createMockPreviewChange('change_2', 456, 'update'),
        ],
        summary: {
          totalChanges: 2,
          creates: 0,
          updates: 2,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1', 'change_2']
      const listing2 = createMockListing(456, 'Listing 456')

      vi.mocked(getListing)
        .mockRejectedValueOnce(new Error('Listing not found'))
        .mockResolvedValueOnce(listing2)

      await createBackupCSV(previewData, acceptedChangeIds)

      // Should continue with other listings even if one fails
      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(convertListingsToCSV)).toHaveBeenCalledWith({
        count: 1,
        results: [listing2],
      })
      expect(vi.mocked(downloadCSV)).toHaveBeenCalled()
    })

    it('should handle all listings failing to fetch', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 123, 'update'),
        ],
        summary: {
          totalChanges: 1,
          creates: 0,
          updates: 1,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1']

      vi.mocked(getListing).mockRejectedValue(new Error('Listing not found'))

      await createBackupCSV(previewData, acceptedChangeIds)

      expect(vi.mocked(getListing)).toHaveBeenCalledWith(123)
      expect(vi.mocked(convertListingsToCSV)).not.toHaveBeenCalled()
      expect(vi.mocked(downloadCSV)).not.toHaveBeenCalled()
    })

    it('should generate filename with timestamp', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 123, 'update'),
        ],
        summary: {
          totalChanges: 1,
          creates: 0,
          updates: 1,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1']
      const listing = createMockListing(123, 'Listing 123')

      vi.mocked(getListing).mockResolvedValue(listing)

      await createBackupCSV(previewData, acceptedChangeIds)

      expect(vi.mocked(downloadCSV)).toHaveBeenCalled()
      const downloadCall = vi.mocked(downloadCSV).mock.calls[0]
      expect(downloadCall[0]).toBe('mock,csv,content')
      expect(downloadCall[1]).toMatch(/etsy-backup-before-changes-\d{4}-\d{2}-\d{2}\.csv/)
    })

    it('should handle mixed change types correctly', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 0, 'create'),
          createMockPreviewChange('change_2', 100, 'update'),
          createMockPreviewChange('change_3', 200, 'delete'),
        ],
        summary: {
          totalChanges: 3,
          creates: 1,
          updates: 1,
          deletes: 1,
        },
      }
      const acceptedChangeIds = ['change_1', 'change_2', 'change_3']
      const listing1 = createMockListing(100, 'Listing 100')
      const listing2 = createMockListing(200, 'Listing 200')

      vi.mocked(getListing)
        .mockResolvedValueOnce(listing1)
        .mockResolvedValueOnce(listing2)

      await createBackupCSV(previewData, acceptedChangeIds)

      // Should only backup update and delete (not create)
      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(100)
      expect(vi.mocked(getListing)).toHaveBeenCalledWith(200)
      expect(vi.mocked(convertListingsToCSV)).toHaveBeenCalledWith({
        count: 2,
        results: [listing1, listing2],
      })
    })

    it('should deduplicate listing IDs', async () => {
      const previewData: PreviewResponse = {
        changes: [
          createMockPreviewChange('change_1', 123, 'update'),
          createMockPreviewChange('change_2', 123, 'update'), // Same listing ID
          createMockPreviewChange('change_3', 456, 'update'),
        ],
        summary: {
          totalChanges: 3,
          creates: 0,
          updates: 3,
          deletes: 0,
        },
      }
      const acceptedChangeIds = ['change_1', 'change_2', 'change_3']
      const listing1 = createMockListing(123, 'Listing 123')
      const listing2 = createMockListing(456, 'Listing 456')

      vi.mocked(getListing)
        .mockResolvedValueOnce(listing1)
        .mockResolvedValueOnce(listing2)

      await createBackupCSV(previewData, acceptedChangeIds)

      // Should only fetch each listing once (deduplicated)
      expect(vi.mocked(getListing)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(convertListingsToCSV)).toHaveBeenCalledWith({
        count: 2,
        results: [listing1, listing2],
      })
    })
  })
})

