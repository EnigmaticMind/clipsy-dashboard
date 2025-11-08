// Apply service - applies accepted changes to Etsy
// Ported from backend Go code

import { parseUploadCSV, ProcessedListing } from './uploadService'
import { getShopID, getListing, deleteListing, Listing, makeEtsyRequest } from './etsyApi'
import { getValidAccessToken } from './oauth'
import { createListing, updateListing, updateListingInventory } from './listingOperations'
import { 
  hashFile, 
  saveUploadProgress, 
  loadUploadProgress, 
  clearUploadProgress
} from './progressService'
import { logger } from '../utils/logger'

// Apply changes from CSV file with progress persistence and batch fetching
// acceptedChangeIds: Set of change IDs to apply (from preview)
// onProgress: Optional callback for progress updates
export async function applyUploadCSV(
  file: File,
  acceptedChangeIds: Set<string>,
  onProgress?: (current: number, total: number, failed: number) => void
): Promise<void> {
  // Get access token
  await getValidAccessToken()

  // Get shop ID
  const shopID = await getShopID()

  // Generate file hash for progress tracking
  const fileHash = await hashFile(file)

  // Check for existing progress
  const existingProgress = await loadUploadProgress(fileHash)
  let filteredListings: ProcessedListing[] = []
  let processedListingIDs: number[] = []
  let failedListingIDs: { listingID: number; error: string }[] = []

  if (existingProgress) {
    // Resume from previous progress
    logger.log(`Resuming upload from previous session (${existingProgress.processedListingIDs.length}/${existingProgress.totalListings} completed)`)
    processedListingIDs = existingProgress.processedListingIDs
    failedListingIDs = existingProgress.failedListingIDs
  }

  // Parse CSV
  const listings = await parseUploadCSV(file)

  // Filter listings based on accepted change IDs
  // Generate change IDs in the same order as preview
  const changeIDToIndexMap = new Map<string, number>()
  let changeCounter = 0
  for (let i = 0; i < listings.length; i++) {
    changeCounter++
    const changeID = `change_${changeCounter}`
    changeIDToIndexMap.set(changeID, i)
  }

  // Filter listings based on accepted change IDs
  for (const [changeID, idx] of changeIDToIndexMap) {
    if (acceptedChangeIds.has(changeID)) {
      filteredListings.push(listings[idx])
    }
  }

  // Filter out already processed listings
  if (existingProgress) {
    filteredListings = filteredListings.filter(
      l => !processedListingIDs.includes(l.listingID) || l.listingID === 0
    )
  }

  // Check if we need to create any new listings (need taxonomy_id, shipping_profile_id, and readiness_state_id for that)
  const hasNewListings = filteredListings.some(l => l.listingID === 0 && !l.toDelete)
  let defaultTaxonomyID: number | undefined = undefined
  let defaultReadinessStateID: number | undefined = undefined

  // If we need to create listings, fetch one existing listing to get required fields
  if (hasNewListings) {
    try {
      // Fetch one listing from the shop to get taxonomy_id, shipping_profile_id, and readiness_state_id
      const firstListingResponse = await makeEtsyRequest(
        'GET',
        `/application/shops/${shopID}/listings?limit=1&includes=Inventory,Shipping`
      )
      const firstListingData = await firstListingResponse.json()
      
      if (firstListingData.results && firstListingData.results.length > 0) {
        const firstListing = firstListingData.results[0]
        if (firstListing.taxonomy_id) {
          defaultTaxonomyID = firstListing.taxonomy_id
          logger.log(`Using taxonomy_id ${defaultTaxonomyID} from existing listing`)
        }
        // Also fetch readiness_state_id from first offering (required for physical listings)
        if (firstListing.inventory && firstListing.inventory.products.length > 0) {
          const firstProduct = firstListing.inventory.products.find((p: { is_deleted?: boolean }) => !p.is_deleted)
          if (firstProduct && firstProduct.offerings && firstProduct.offerings.length > 0) {
            const firstOffering = firstProduct.offerings.find((o: { is_deleted?: boolean }) => !o.is_deleted)
            if (firstOffering && firstOffering.readiness_state_id) {
              defaultReadinessStateID = firstOffering.readiness_state_id
              logger.log(`Using readiness_state_id ${defaultReadinessStateID} from existing listing`)
            }
          }
        }
      }
      
      if (!defaultTaxonomyID) {
        throw new Error('Could not find taxonomy_id from existing listings. Please ensure you have at least one listing in your shop.')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to get required fields for creating new listings: ${errorMsg}. Please ensure you have at least one existing listing in your shop.`)
    }
  }

  // Batch fetch all existing listings we need to update (in parallel)
  const listingIDsToFetch = filteredListings
    .filter(l => l.listingID > 0 && !l.toDelete)
    .map(l => l.listingID)

  const existingListingsMap = new Map<number, Listing>()
  
  if (listingIDsToFetch.length > 0) {
    logger.log(`Batch fetching ${listingIDsToFetch.length} existing listings...`)
    const batchSize = 10 // Fetch 10 listings in parallel
    
    for (let i = 0; i < listingIDsToFetch.length; i += batchSize) {
      const batch = listingIDsToFetch.slice(i, i + batchSize)
      const batchPromises = batch.map(id => 
        getListing(id).catch(error => {
          logger.error(`Error fetching listing ${id}:`, error)
          return null // Return null on error, we'll handle it later
        })
      )
      
      const batchResults = await Promise.all(batchPromises)
      
      batchResults.forEach((listing, idx) => {
        if (listing) {
          existingListingsMap.set(batch[idx], listing)
          // Also capture taxonomy_id from first listing if we don't have it yet
          if (!defaultTaxonomyID && listing.taxonomy_id) {
            defaultTaxonomyID = listing.taxonomy_id
          }
        }
      })
    }
  }

  // Process listings in batches with progress saving
  const batchSize = 5 // Process 5 listings at a time
  const totalListings = filteredListings.length

  for (let i = 0; i < filteredListings.length; i += batchSize) {
    const batch = filteredListings.slice(i, i + batchSize)
    
    // Process batch in parallel
    await Promise.allSettled(
      batch.map(listing => processListing(listing, existingListingsMap.get(listing.listingID)))
    )

    // Update progress after each batch
    if (onProgress) {
      onProgress(processedListingIDs.length, totalListings, failedListingIDs.length)
    }

    // Save progress after each batch
    await saveUploadProgress({
      fileHash,
      fileName: file.name,
      totalListings,
      processedListingIDs: [...processedListingIDs],
      failedListingIDs: [...failedListingIDs],
      timestamp: Date.now(),
      acceptedChangeIds: Array.from(acceptedChangeIds),
    })
  }

  // Clear progress on successful completion
  await clearUploadProgress(fileHash)

  // Helper function to process a single listing
  async function processListing(listing: ProcessedListing, existingListing: Listing | undefined): Promise<void> {
    // defaultTaxonomyID is captured from closure
    try {
      // Handle delete
      if (listing.toDelete) {
        if (listing.listingID === 0) {
          logger.warn('Cannot delete listing without Listing ID')
          return
        }
        await deleteListing(shopID, listing.listingID)
        logger.log(`Deleted listing ${listing.listingID}`)
        processedListingIDs.push(listing.listingID)
        return
      }

      // Handle create (no listing ID)
      if (listing.listingID === 0) {
        if (!defaultTaxonomyID) {
          const errorMsg = 'Cannot create listing: taxonomy_id is required. Please ensure you have at least one existing listing in your shop.'
          logger.error(errorMsg)
          failedListingIDs.push({ listingID: 0, error: errorMsg })
          return
        }
        
        let newListingID: number
        try {
          newListingID = await createListing(shopID, listing, defaultTaxonomyID)
          logger.log(`Created listing ${newListingID}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          logger.error(`Error creating listing:`, error)
          failedListingIDs.push({ listingID: 0, error: `Listing creation failed: ${errorMsg}` })
          return
        }

            // Update inventory for new listing
            try {
              await updateListingInventory(newListingID, listing, null, defaultReadinessStateID, shopID)
              logger.log(`Updated inventory for new listing ${newListingID}`)
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error'
              logger.error(`Error updating inventory for new listing ${newListingID}:`, error)
              // Listing was created but inventory update failed - mark as failed with details
              failedListingIDs.push({ listingID: newListingID, error: `Inventory update failed: ${errorMsg}` })
              return
            }
        processedListingIDs.push(0) // Track creates with 0
        return
      }

      // Handle update (has listing ID)
      if (!existingListing) {
        // Try to fetch if not in batch
        try {
          existingListing = await getListing(listing.listingID)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          logger.error(`Error fetching existing listing ${listing.listingID}:`, error)
          failedListingIDs.push({ listingID: listing.listingID, error: errorMsg })
          return
        }
      }

      // Update listing (only if changed)
      try {
        await updateListing(shopID, listing.listingID, listing, existingListing)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`Error updating listing ${listing.listingID}:`, error)
        // If it's a critical error, mark as failed
        // Otherwise continue - try inventory update anyway
        if (errorMsg.includes('required') || errorMsg.includes('invalid') || errorMsg.includes('must')) {
          failedListingIDs.push({ listingID: listing.listingID, error: `Listing update failed: ${errorMsg}` })
          return
        }
      }

      // Update inventory (only if changed)
      try {
        await updateListingInventory(listing.listingID, listing, existingListing, defaultReadinessStateID, shopID)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`Error updating inventory for listing ${listing.listingID}:`, error)
        failedListingIDs.push({ listingID: listing.listingID, error: `Inventory update failed: ${errorMsg}` })
        return
      }

      logger.log(`Updated listing ${listing.listingID}`)
      processedListingIDs.push(listing.listingID)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Error processing listing ${listing.listingID}:`, error)
      if (listing.listingID > 0) {
        failedListingIDs.push({ listingID: listing.listingID, error: errorMsg })
      }
    }
  }
}

