// Backup service - creates CSV backup of listings before changes are applied

import { getListing } from './etsyApi'
import { convertListingsToCSV, downloadCSV } from './csvService'
import { PreviewResponse } from './previewService'
import { logger } from '../utils/logger'

/**
 * Creates a CSV backup of all listings that will be changed (updated or deleted)
 * Only backs up existing listings, not new ones being created
 */
export async function createBackupCSV(
  previewData: PreviewResponse,
  acceptedChangeIds: string[]
): Promise<void> {
  // Extract unique listing IDs that will be updated or deleted (not created)
  const listingIDs = new Set<number>()
  
  for (const change of previewData.changes || []) {
    // Only include changes that are accepted
    if (!acceptedChangeIds.includes(change.changeId)) {
      continue
    }
    
    // Only backup listings that exist (updates and deletes)
    // Creates don't need backup since they don't exist yet
    if (change.listingId > 0 && (change.changeType === 'update' || change.changeType === 'delete')) {
      listingIDs.add(change.listingId)
    }
  }

  if (listingIDs.size === 0) {
    logger.log('No existing listings to backup (only creates or no accepted changes)')
    return
  }

  // Fetch all listings that will be changed
  const listingsToBackup = []
  for (const listingID of listingIDs) {
    try {
      const listing = await getListing(listingID)
      listingsToBackup.push(listing)
    } catch (error) {
      logger.error(`Error fetching listing ${listingID} for backup:`, error)
      // Continue with other listings - don't fail the whole backup
    }
  }

  if (listingsToBackup.length === 0) {
    logger.log('No listings could be fetched for backup')
    return
  }

  // Convert to CSV format
  const csvContent = convertListingsToCSV({
    count: listingsToBackup.length,
    results: listingsToBackup,
  })

  // Download backup with timestamp
  const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  const filename = `etsy-backup-before-changes-${timestamp}.csv`
  downloadCSV(csvContent, filename)
  
  logger.log(`Backup created: ${filename} (${listingsToBackup.length} listings)`)
}

