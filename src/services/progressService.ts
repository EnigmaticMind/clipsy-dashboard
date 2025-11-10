// Progress persistence service - saves and loads upload/download progress

export interface UploadProgress {
  fileHash: string
  fileName: string
  totalListings: number
  processedListingIDs: number[]
  failedListingIDs: { listingID: number; error: string }[]
  timestamp: number
  acceptedChangeIds: string[]
}

// Generate hash for file (simple hash for identification)
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
}

// Save upload progress
export async function saveUploadProgress(progress: UploadProgress): Promise<void> {
  await chrome.storage.local.set({ 
    [`upload_progress_${progress.fileHash}`]: progress 
  })
}

// Load upload progress
export async function loadUploadProgress(fileHash: string): Promise<UploadProgress | null> {
  const result = await chrome.storage.local.get(`upload_progress_${fileHash}`)
  return result[`upload_progress_${fileHash}`] || null
}

// Clear upload progress
export async function clearUploadProgress(fileHash: string): Promise<void> {
  await chrome.storage.local.remove(`upload_progress_${fileHash}`)
}

// Get all upload progress entries (for cleanup)
export async function getAllUploadProgress(): Promise<UploadProgress[]> {
  const all = await chrome.storage.local.get(null)
  const progressEntries: UploadProgress[] = []
  for (const key in all) {
    if (key.startsWith('upload_progress_')) {
      progressEntries.push(all[key])
    }
  }
  return progressEntries
}

// Clean up old progress (older than 7 days)
export async function cleanupOldProgress(): Promise<void> {
  const allProgress = await getAllUploadProgress()
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
  
  for (const progress of allProgress) {
    if (progress.timestamp < sevenDaysAgo) {
      await clearUploadProgress(progress.fileHash)
    }
  }
}

