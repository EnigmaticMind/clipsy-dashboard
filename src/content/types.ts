// Types for content script communication
export type MessageRequest = {
  action: string;
  listingId?: number;
  [key: string]: unknown;
}

