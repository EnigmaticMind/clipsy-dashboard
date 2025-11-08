// Background service worker for Chrome extension
// Opens the dashboard when the extension icon is clicked
// Handles Google Gemini API calls for AI suggestions

import { getValidAccessToken } from './services/oauth';
import { getListing } from './services/etsyApi';
import { generateBulkEditCSV, type BulkEditOperation } from './services/bulkEditService';
import { logger } from './utils/logger';

// Google Gemini API endpoint - using gemini-2.0-flash
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Make API call to Google Gemini
async function callGeminiAPI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response from Gemini API');
  }

  const text = data.candidates[0].content.parts[0]?.text;
  if (!text) {
    throw new Error('No text in Gemini API response');
  }

  return text.trim();
}

// Test Gemini API key
async function testGeminiAPI(apiKey: string): Promise<boolean> {
  try {
    await callGeminiAPI(apiKey, 'Say "OK" if you can read this.');
    return true;
  } catch (error) {
    logger.warn('Gemini API test failed:', error);
    return false;
  }
}

chrome.action.onClicked.addListener(() => {
  // Open the dashboard in a new tab
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html')
  });
});

// Handle messages from content script
interface Message {
  action: string;
  listingId?: number;
  bulkEditOperation?: BulkEditOperation;
  apiKey?: string;
  prompt?: string;
  [key: string]: unknown;
}

interface Response {
  success: boolean;
  data?: unknown;
  error?: string;
  token?: string;
  message?: string;
  csvContent?: string;
  suggestion?: string;
}

chrome.runtime.onMessage.addListener(
  (message: Message, _sender: chrome.runtime.MessageSender, sendResponse: (response: Response) => void) => {
    if (message.action === 'getListing') {
      // Fetch listing from Etsy API
      (async () => {
        try {
          await getValidAccessToken();
          if (!message.listingId) {
            sendResponse({
              success: false,
              error: 'Missing listingId',
            });
            return;
          }
          const listing = await getListing(message.listingId);
          
          sendResponse({
            success: true,
            data: {
              title: listing.title,
              description: listing.description,
              tags: listing.tags,
            },
          });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();
      
      return true; // Keep channel open for async response
    }
    
    if (message.action === 'getAccessToken') {
      // Get access token from storage
      (async () => {
        try {
          const token = await getValidAccessToken();
          sendResponse({ success: true, token });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'No token found',
          });
        }
      })();
      
      return true; // Keep channel open for async response
    }

    if (message.action === 'generateAISuggestion') {
      // Generate AI suggestion using Gemini API
      (async () => {
        try {
          if (!message.apiKey) {
            sendResponse({
              success: false,
              error: 'API key is required',
            });
            return;
          }

          if (!message.prompt) {
            sendResponse({
              success: false,
              error: 'Prompt is required',
            });
            return;
          }

          const suggestion = await callGeminiAPI(message.apiKey, message.prompt);
          
          sendResponse({
            success: true,
            suggestion,
          });
        } catch (error) {
          logger.error('Gemini API error:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();
      
      return true; // Keep channel open for async response
    }

    if (message.action === 'testGeminiAPI') {
      // Test Gemini API key
      (async () => {
        try {
          if (!message.apiKey) {
            sendResponse({
              success: false,
              error: 'API key is required',
            });
            return;
          }

          const isValid = await testGeminiAPI(message.apiKey);
          
          sendResponse({
            success: isValid,
            error: isValid ? undefined : 'API key validation failed',
          });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();
      
      return true; // Keep channel open for async response
    }
    
    if (message.action === 'generateBulkEditCSV') {
      // Generate bulk edit CSV from background script to avoid CORS issues
      (async () => {
        try {
          if (!message.bulkEditOperation) {
            sendResponse({
              success: false,
              error: 'Missing bulkEditOperation',
            });
            return;
          }

          const csvContent = await generateBulkEditCSV(
            message.bulkEditOperation,
            (message, current, total) => {
              logger.log(`Bulk edit progress: ${message}${current !== undefined ? ` (${current}/${total})` : ''}`);
            }
          );

          sendResponse({
            success: true,
            csvContent,
          });
        } catch (error) {
          logger.error('Bulk edit error:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();

      return true; // Keep channel open for async response
    }

    if (message.action === 'openDashboard') {
      // Open dashboard in a new tab from background script (content scripts can't use chrome.tabs)
      (async () => {
        try {
          chrome.tabs.create({
            url: chrome.runtime.getURL('dashboard.html'),
          });
          sendResponse({ success: true });
        } catch (error) {
          logger.error('Failed to open dashboard:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();

      return true; // Keep channel open for async response
    }
  }
);
