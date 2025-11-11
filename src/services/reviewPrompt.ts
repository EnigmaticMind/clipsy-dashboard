// Review prompt service - tracks usage and determines when to show review prompt

const STORAGE_KEYS = {
  FIRST_USE_DATE: 'clipsy:first_use_date',
  REVIEW_PROMPT_LAST_SHOWN: 'clipsy:review_prompt_last_shown', // Timestamp of when last shown
  REVIEW_PROMPT_DISMISSED: 'clipsy:review_prompt_dismissed',
  REVIEW_PROMPT_PENDING: 'clipsy:review_prompt_pending',
} as const;

// Show prompt again after 10 hours
const HOURS_BETWEEN_PROMPTS = 10;

// Initialize first use date if not set
export async function initializeFirstUseDate(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FIRST_USE_DATE);
  if (!result[STORAGE_KEYS.FIRST_USE_DATE]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.FIRST_USE_DATE]: Date.now(),
    });
  }
}

// Check if review prompt should be shown
export async function shouldShowReviewPrompt(): Promise<boolean> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.REVIEW_PROMPT_LAST_SHOWN,
    STORAGE_KEYS.REVIEW_PROMPT_DISMISSED,
  ]);

  // Don't show if user dismissed it (permanently)
  if (result[STORAGE_KEYS.REVIEW_PROMPT_DISMISSED] === true) {
    return false;
  }

  // Check if enough time has passed since last shown (24 hours)
  const lastShown = result[STORAGE_KEYS.REVIEW_PROMPT_LAST_SHOWN];
  if (lastShown) {
    const hoursSinceLastShown = (Date.now() - lastShown) / (1000 * 60 * 60);
    if (hoursSinceLastShown < HOURS_BETWEEN_PROMPTS) {
      // Not enough time has passed
      return false;
    }
  }

  // Show if never shown before, or enough time has passed
  return true;
}

// Mark review prompt as shown (user clicked "Already reviewed" or "Leave a Review")
export async function markReviewPromptShown(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.REVIEW_PROMPT_LAST_SHOWN]: Date.now(),
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
  // Check if we should show the prompt
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

