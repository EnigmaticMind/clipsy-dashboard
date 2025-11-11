// Configuration functions for Google Sheets

import { STORAGE_SHEET_NAME_KEY } from './types'

// Get custom sheet name from storage
export async function getCustomSheetName(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_SHEET_NAME_KEY)
  return result[STORAGE_SHEET_NAME_KEY] || null
}

// Set custom sheet name in storage
export async function setCustomSheetName(name: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_SHEET_NAME_KEY]: name })
}

