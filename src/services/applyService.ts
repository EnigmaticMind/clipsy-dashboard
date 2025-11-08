// Apply service - applies accepted changes to Etsy
// Ported from backend Go code

import { parseUploadCSV, ProcessedListing } from './uploadService'
import { getShopID, getListing, deleteListing, Listing } from './etsyApi'
import { getValidAccessToken } from './oauth'
import { createListing, updateListing, updateListingInventory } from './listingOperations'
import { 
  hashFile, 
  saveUploadProgress, 
  loadUploadProgress, 
  clearUploadProgress
} from './progressService'

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
    console.log(`Resuming upload from previous session (${existingProgress.processedListingIDs.length}/${existingProgress.totalListings} completed)`)
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

  // Batch fetch all existing listings we need to update (in parallel)
  const listingIDsToFetch = filteredListings
    .filter(l => l.listingID > 0 && !l.toDelete)
    .map(l => l.listingID)

  const existingListingsMap = new Map<number, Listing>()
  
  if (listingIDsToFetch.length > 0) {
    console.log(`Batch fetching ${listingIDsToFetch.length} existing listings...`)
    const batchSize = 10 // Fetch 10 listings in parallel
    
    for (let i = 0; i < listingIDsToFetch.length; i += batchSize) {
      const batch = listingIDsToFetch.slice(i, i + batchSize)
      const batchPromises = batch.map(id => 
        getListing(id).catch(error => {
          console.error(`Error fetching listing ${id}:`, error)
          return null // Return null on error, we'll handle it later
        })
      )
      
      const batchResults = await Promise.all(batchPromises)
      
      batchResults.forEach((listing, idx) => {
        if (listing) {
          existingListingsMap.set(batch[idx], listing)
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
    try {
      // Handle delete
      if (listing.toDelete) {
        if (listing.listingID === 0) {
          console.warn('Cannot delete listing without Listing ID')
          return
        }
        await deleteListing(shopID, listing.listingID)
        console.log(`Deleted listing ${listing.listingID}`)
        processedListingIDs.push(listing.listingID)
        return
      }

      // Handle create (no listing ID)
      if (listing.listingID === 0) {
        const newListingID = await createListing(shopID, listing)
        console.log(`Created listing ${newListingID}`)

        // Update inventory for new listing
        try {
          await updateListingInventory(newListingID, listing, null)
        } catch (error) {
          console.error(`Error updating inventory for new listing ${newListingID}:`, error)
          // Continue - listing was created
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
          console.error(`Error fetching existing listing ${listing.listingID}:`, error)
          failedListingIDs.push({ listingID: listing.listingID, error: errorMsg })
          return
        }
      }

      // Update listing (only if changed)
      try {
        await updateListing(shopID, listing.listingID, listing, existingListing)
      } catch (error) {
        console.error(`Error updating listing ${listing.listingID}:`, error)
        // Continue - try inventory update anyway
      }

      // Update inventory (only if changed)
      try {
        await updateListingInventory(listing.listingID, listing, existingListing)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Error updating inventory for listing ${listing.listingID}:`, error)
        failedListingIDs.push({ listingID: listing.listingID, error: errorMsg })
        return
      }

      console.log(`Updated listing ${listing.listingID}`)
      processedListingIDs.push(listing.listingID)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Error processing listing ${listing.listingID}:`, error)
      if (listing.listingID > 0) {
        failedListingIDs.push({ listingID: listing.listingID, error: errorMsg })
      }
    }
  }
}

