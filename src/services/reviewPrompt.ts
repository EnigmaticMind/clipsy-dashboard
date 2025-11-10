// Review prompt service - tracks usage and determines when to show review prompt

const STORAGE_KEYS = {
  FIRST_USE_DATE: 'clipsy:first_use_date',
  SUCCESSFUL_OPERATIONS: 'clipsy:successful_operations',
  REVIEW_PROMPT_SHOWN: 'clipsy:review_prompt_shown',
  REVIEW_PROMPT_DISMISSED: 'clipsy:review_prompt_dismissed',
  REVIEW_PROMPT_PENDING: 'clipsy:review_prompt_pending',
} as const;

const REVIEW_PROMPT_CONDITIONS = {
  MIN_DAYS: 7, // Show after 7 days of use
  MIN_OPERATIONS: 10, // Or after 10 successful operations
} as const;

// Initialize first use date if not set
export async function initializeFirstUseDate(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FIRST_USE_DATE);
  if (!result[STORAGE_KEYS.FIRST_USE_DATE]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.FIRST_USE_DATE]: Date.now(),
    });
  }
}

// Track a successful operation (download, upload, etc.)
export async function trackSuccessfulOperation(): Promise<void> {
  await initializeFirstUseDate();
  
  const result = await chrome.storage.local.get(STORAGE_KEYS.SUCCESSFUL_OPERATIONS);
  const currentCount = result[STORAGE_KEYS.SUCCESSFUL_OPERATIONS] || 0;
  await chrome.storage.local.set({
    [STORAGE_KEYS.SUCCESSFUL_OPERATIONS]: currentCount + 1,
  });
}

// Check if review prompt should be shown
export async function shouldShowReviewPrompt(): Promise<boolean> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.REVIEW_PROMPT_SHOWN,
    STORAGE_KEYS.REVIEW_PROMPT_DISMISSED,
    STORAGE_KEYS.FIRST_USE_DATE,
    STORAGE_KEYS.SUCCESSFUL_OPERATIONS,
  ]);

  // Don't show if user already dismissed it
  if (result[STORAGE_KEYS.REVIEW_PROMPT_DISMISSED] === true) {
    return false;
  }

  // Don't show if already shown (user clicked "Already reviewed")
  if (result[STORAGE_KEYS.REVIEW_PROMPT_SHOWN] === true) {
    return false;
  }

  // Check if enough time has passed
  const firstUseDate = result[STORAGE_KEYS.FIRST_USE_DATE];
  if (firstUseDate) {
    const daysSinceFirstUse =
      (Date.now() - firstUseDate) / (1000 * 60 * 60 * 24);
    if (daysSinceFirstUse >= REVIEW_PROMPT_CONDITIONS.MIN_DAYS) {
      return true;
    }
  }

  // Check if enough operations completed
  const operations = result[STORAGE_KEYS.SUCCESSFUL_OPERATIONS] || 0;
  if (operations >= REVIEW_PROMPT_CONDITIONS.MIN_OPERATIONS) {
    return true;
  }

  return false;
}

// Mark review prompt as shown (user clicked "Already reviewed")
export async function markReviewPromptShown(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.REVIEW_PROMPT_SHOWN]: true,
  });
}

// Mark review prompt as dismissed (user clicked "Maybe later")
export async function markReviewPromptDismissed(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.REVIEW_PROMPT_DISMISSED]: true,
  });
}

// Set a pending flag to show review prompt on next page visit
export async function setReviewPromptPending(): Promise<void> {
  await trackSuccessfulOperation();
  
  // Check if we should show the prompt (based on conditions)
  const shouldShow = await shouldShowReviewPrompt();
  if (shouldShow) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.REVIEW_PROMPT_PENDING]: true,
    });
  }
}

// Check if there's a pending review prompt
export async function hasPendingReviewPrompt(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.REVIEW_PROMPT_PENDING);
  return result[STORAGE_KEYS.REVIEW_PROMPT_PENDING] === true;
}

// Clear the pending flag (called when prompt is shown)
export async function clearPendingReviewPrompt(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.REVIEW_PROMPT_PENDING);
}

// Get Chrome Web Store review URL
export function getReviewUrl(): string {
  return 'https://chromewebstore.google.com/detail/clipsy-dashboard/fneojnnbgbogeopngljlphapcakjglhe/reviews';
}

