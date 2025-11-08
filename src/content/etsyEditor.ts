// Content script for Etsy listing editor page
// Injects a side panel with React components

import { createRoot } from 'react-dom/client';
import React from 'react';
import ClipsyPanel from '../content-components/ClipsyPanel';
import './etsyEditor.css';
import { logger } from '../utils/logger';

// Message handler for communication with background script
interface MessageRequest {
  action: string;
  listingId?: number;
  [key: string]: unknown;
}

// Check if we're on the listing editor page
function isListingEditorPage(): boolean {
  return window.location.pathname.includes('/listing-editor/edit/');
}

// Extract listing ID from URL
function getListingIdFromURL(): number | null {
  const match = window.location.pathname.match(/\/edit\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Check user preference for auto-open
async function shouldAutoOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['clipsy_auto_open_panel'], (result) => {
      // Default to true if not set
      resolve(result.clipsy_auto_open_panel !== false);
    });
  });
}

// Wait for Etsy's form fields to actually appear (smarter than arbitrary delay)
function waitForFormFields(maxWait: number = 5000): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Check immediately first - try multiple selectors
    const checkForFields = () => {
      const titleSelectors = [
        'input[name="title"]',
        'input[data-test-id*="title"]',
        'textarea[data-test-id*="title"]',
        '[contenteditable="true"][data-test-id*="title"]',
      ];
      const descSelectors = [
        'textarea[name="description"]',
        'textarea[data-test-id*="description"]',
        '[contenteditable="true"][data-test-id*="description"]',
      ];
      
      const hasTitle = titleSelectors.some(sel => document.querySelector(sel));
      const hasDesc = descSelectors.some(sel => document.querySelector(sel));
      
      return hasTitle || hasDesc;
    };
    
    if (checkForFields()) {
      resolve();
      return;
    }
    
    // Use MutationObserver to watch for form fields
    const observer = new MutationObserver(() => {
      if (checkForFields()) {
        observer.disconnect();
        resolve();
        return;
      }
      
      // Timeout fallback
      if (Date.now() - startTime > maxWait) {
        observer.disconnect();
        logger.warn('Clipsy: Form fields not found after timeout, proceeding anyway');
        resolve();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    
    // Cleanup timeout
    setTimeout(() => {
      observer.disconnect();
      if (Date.now() - startTime < maxWait) {
        resolve(); // Already resolved or will resolve
      }
    }, maxWait);
  });
}

// Wait for page to be ready
function waitForPageReady(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      waitForFormFields().then(resolve);
    } else {
      window.addEventListener('load', () => {
        waitForFormFields().then(resolve);
      }, { once: true });
    }
  });
}

// Create and inject the side panel
function createSidePanel(): HTMLElement {
  // Remove existing panel if present
  const existing = document.getElementById('clipsy-side-panel');
  if (existing) {
    existing.remove();
  }

  const panel = document.createElement('div');
  panel.id = 'clipsy-side-panel';
  panel.className = 'clipsy-side-panel';
  
  // Insert into body
  document.body.appendChild(panel);
  
  return panel;
}

// Set up input click/focus detection
function setupInputDetection(onInputFocus: (element: HTMLElement, value: string) => void) {
  // Helper to check if element is within the side panel
  const isWithinSidePanel = (element: HTMLElement): boolean => {
    const sidePanel = document.getElementById('clipsy-side-panel');
    const toggleButton = document.getElementById('clipsy-toggle-btn');
    
    // Check if element is within side panel or toggle button
    return !!(
      (sidePanel?.contains(element)) ||
      (toggleButton?.contains(element))
    );
  };

  // Use event delegation to catch all input interactions
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    
    // Ignore events from within the side panel
    if (isWithinSidePanel(target)) {
      return;
    }
    
    // Check if it's an input, textarea, or contenteditable element
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.closest('input, textarea, [contenteditable="true"]')
    ) {
      const inputElement = target.closest('input, textarea, [contenteditable="true"]') as HTMLElement;
      if (inputElement && !isWithinSidePanel(inputElement)) {
        const inputValue = inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT'
          ? (inputElement as HTMLInputElement | HTMLTextAreaElement).value
          : inputElement.textContent || '';
        
        onInputFocus(inputElement, inputValue);
      }
    }
  }, true); // Use capture phase to catch events early

  // Also listen for clicks on inputs
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // Ignore events from within the side panel
    if (isWithinSidePanel(target)) {
      return;
    }
    
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.closest('input, textarea, [contenteditable="true"]')
    ) {
      const inputElement = target.closest('input, textarea, [contenteditable="true"]') as HTMLElement;
      if (inputElement && !isWithinSidePanel(inputElement)) {
        const inputValue = inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT'
          ? (inputElement as HTMLInputElement | HTMLTextAreaElement).value
          : inputElement.textContent || '';
        
        onInputFocus(inputElement, inputValue);
      }
    }
  }, true);
}

// Main initialization
async function init() {
  if (!isListingEditorPage()) {
    return;
  }

  const listingId = getListingIdFromURL();
  if (!listingId) {
    logger.log('Clipsy: Could not extract listing ID from URL');
    return;
  }

  await waitForPageReady();

  // Check if should auto-open
  const autoOpen = await shouldAutoOpen();
  
  // Create panel container
  const panelContainer = createSidePanel();
  
  // Fetch listing data from Etsy API
  let listingData: {
    title: string;
    description: string;
    tags: string[];
  } | null = null;

  const fetchListingData = async () => {
    try {
      // Request listing data from background script
      const response = await chrome.runtime.sendMessage({
        action: 'getListing',
        listingId: listingId,
      } as MessageRequest);

      if (response && response.success && response.data) {
        listingData = {
          title: response.data.title || '',
          description: response.data.description || '',
          tags: response.data.tags || [],
        };
      } else {
        // Fallback: try to extract from page
        listingData = extractListingFromPage();
      }
    } catch (error) {
      logger.warn('Failed to fetch listing from API, using page data:', error);
      listingData = extractListingFromPage();
    }
  };

  // Extract listing data from Etsy's page as fallback
  const extractListingFromPage = (): {
    title: string;
    description: string;
    tags: string[];
  } => {
    // Try specific Etsy selectors first (most reliable)
    let title = '';
    
    // Primary: Try the specific textarea with id listing-title-input
    const titleTextarea = document.querySelector('textarea[name="title"]#listing-title-input') as HTMLTextAreaElement;
    if (titleTextarea && titleTextarea.value) {
      title = titleTextarea.value.trim();
    }
    
    // Fallback: Try other title selectors
    if (!title) {
      const titleSelectors = [
        'textarea[name="title"]',
        'textarea#listing-title-input',
        'input[name="title"]',
        'input[data-test-id*="title"]',
        'input[placeholder*="title" i]',
        'input[aria-label*="title" i]',
        '[data-test-id*="title"] input',
        '[data-test-id*="title"] textarea',
        'input[type="text"]', // Fallback: first text input
      ];
      
      for (const selector of titleSelectors) {
        const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
        if (element && element.value) {
          title = element.value.trim();
          break;
        }
      }
    }
    
    // If no title found, try contenteditable divs
    if (!title) {
      const contentEditable = document.querySelector('[contenteditable="true"][data-test-id*="title"]') as HTMLElement;
      if (contentEditable) {
        title = contentEditable.textContent?.trim() || '';
      }
    }

    // Try multiple selectors for description
    let description = '';
    const descSelectors = [
      'textarea[name="description"]',
      'textarea[data-test-id*="description"]',
      'textarea[placeholder*="description" i]',
      'textarea[aria-label*="description" i]',
      '[data-test-id*="description"] textarea',
      '[data-test-id*="description"] [contenteditable="true"]',
      'textarea', // Fallback: first textarea
    ];
    
    for (const selector of descSelectors) {
      const element = document.querySelector(selector) as HTMLTextAreaElement;
      if (element) {
        if (element.tagName === 'TEXTAREA') {
          description = element.value?.trim() || '';
        } else if (element.isContentEditable) {
          description = element.textContent?.trim() || '';
        }
        if (description) break;
      }
    }
    
    // If no description found, try contenteditable divs
    if (!description) {
      const contentEditable = document.querySelector('[contenteditable="true"][data-test-id*="description"]') as HTMLElement;
      if (contentEditable) {
        description = contentEditable.textContent?.trim() || '';
      }
    }

    // Extract tags - Etsy displays tags as pills in a ul.wt-action-group
    // IMPORTANT: Only extract tags from the tags section, not from other fields like closure
    const tags: string[] = [];
    
    // First, find the tags input field to identify the tags section
    const tagsInput = document.querySelector('#listing-tags-input') as HTMLInputElement;
    let tagsContainer: Element | null = null;
    
    if (tagsInput) {
      // Find the parent container that holds the tags section
      // Look for the closest parent that contains the tag pills
      let parent = tagsInput.parentElement;
      while (parent && parent !== document.body) {
        // Check if this parent contains tag pills
        const hasTagPills = parent.querySelector('.le-pill, ul.wt-action-group');
        if (hasTagPills) {
          tagsContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
      
      // If we couldn't find a container, try to find the section by looking for nearby elements
      if (!tagsContainer) {
        // Look for a fieldset or div that contains both the input and the pills
        const possibleContainers = document.querySelectorAll('fieldset, div[class*="field"], div[class*="section"]');
        for (const container of possibleContainers) {
          if (container.contains(tagsInput)) {
            const hasTagPills = container.querySelector('.le-pill, ul.wt-action-group');
            if (hasTagPills) {
              tagsContainer = container;
              break;
            }
          }
        }
      }
    }
    
    // Strategy 1: Look for tag pills ONLY within the tags section
    if (tagsContainer) {
      const tagPills = tagsContainer.querySelectorAll('.le-pill');
      logger.log('Clipsy: Found', tagPills.length, 'tag pills in tags section');
      
      tagPills.forEach((pill) => {
        // Get the text content, but exclude the delete button
        const clone = pill.cloneNode(true) as HTMLElement;
        const deleteButton = clone.querySelector('button[aria-label*="Delete"], button[aria-label*="remove" i]');
        if (deleteButton) {
          deleteButton.remove();
        }
        const tagText = clone.textContent?.trim() || '';
        
        // Validate it's a reasonable tag (not too long, not empty)
        if (tagText && tagText.length > 0 && tagText.length < 50 && !tags.includes(tagText)) {
          tags.push(tagText);
          logger.log('Clipsy: Found tag from pill:', tagText);
        }
      });
      
      // Strategy 2: Also check for ul.wt-action-group within the tags container
      const tagList = tagsContainer.querySelector('ul.wt-action-group, ul[class*="action-group"]');
      if (tagList) {
        logger.log('Clipsy: Found tag list in tags section');
        const listItems = tagList.querySelectorAll('li.wt-action-group__item-container, li');
        
        listItems.forEach((li) => {
          const pill = li.querySelector('.le-pill');
          if (pill) {
            const clone = pill.cloneNode(true) as HTMLElement;
            const deleteButton = clone.querySelector('button[aria-label*="Delete"], button[aria-label*="remove" i]');
            if (deleteButton) {
              deleteButton.remove();
            }
            const tagText = clone.textContent?.trim() || '';
            
            if (tagText && tagText.length > 0 && tagText.length < 50 && !tags.includes(tagText)) {
              tags.push(tagText);
              logger.log('Clipsy: Found tag from list item:', tagText);
            }
          }
        });
      }
    } else {
      // Fallback: If we can't find the container, use a more specific selector
      // Look for pills that are near the tags input (within a reasonable distance in the DOM)
      logger.log('Clipsy: Could not find tags container, using fallback method');
      
      // Find all .le-pill elements, but filter to only those near the tags input
      const allPills = document.querySelectorAll('.le-pill');
      const tagsInputRect = tagsInput?.getBoundingClientRect();
      
      allPills.forEach((pill) => {
        // Check if this pill is near the tags input (within 500px vertically)
        if (tagsInputRect) {
          const pillRect = pill.getBoundingClientRect();
          const verticalDistance = Math.abs(pillRect.top - tagsInputRect.top);
          
          // Only consider pills that are below the tags input and within reasonable distance
          if (pillRect.top > tagsInputRect.top && verticalDistance < 500) {
            const clone = pill.cloneNode(true) as HTMLElement;
            const deleteButton = clone.querySelector('button[aria-label*="Delete"], button[aria-label*="remove" i]');
            if (deleteButton) {
              deleteButton.remove();
            }
            const tagText = clone.textContent?.trim() || '';
            
            if (tagText && tagText.length > 0 && tagText.length < 50 && !tags.includes(tagText)) {
              tags.push(tagText);
              logger.log('Clipsy: Found tag from pill (fallback):', tagText);
            }
          }
        }
      });
    }
    
    // Strategy 3: Fallback - try to find tags input field value (if tags are typed but not yet added as pills)
    if (tagsInput && tagsInput.value && tags.length === 0) {
      // Tags might be comma-separated in the input
      const tagValues = tagsInput.value.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 0);
      tags.push(...tagValues);
      logger.log('Clipsy: Found tags from input value:', tagValues);
    }
    
    logger.log('Clipsy: All extracted tags:', tags);

    logger.log('Clipsy: Extracted from page:', { title, description, tags });
    logger.log('Clipsy: Title element found:', title ? 'Yes' : 'No', titleTextarea ? 'textarea found' : 'textarea not found');
    logger.log('Clipsy: Tags input found:', tagsInput ? 'Yes' : 'No', tagsInput?.value || 'no value');

    return {
      title,
      description,
      tags: tags.slice(0, 13), // Etsy max is 13 tags
    };
  };

  // Re-extract listing data periodically (in case it loads asynchronously)
  const reExtractData = () => {
    const extracted = extractListingFromPage();
    // Only update if we got new data and it's different
    const hasNewData = extracted.title || extracted.description || extracted.tags.length > 0;
    const isDifferent = !listingData || 
      listingData.title !== extracted.title ||
      listingData.description !== extracted.description ||
      JSON.stringify(listingData.tags) !== JSON.stringify(extracted.tags);
    
    if (hasNewData && isDifferent) {
      listingData = extracted;
      // Re-render panel with new data
      if (root) {
        root.render(
          React.createElement(ClipsyPanel, {
            listingId: listingId,
            focusedInput: null,
            inputValue: '',
            listingData: listingData,
            onClose: () => {
              panelContainer.style.display = 'none';
              if (globalReExtractInterval) {
                clearInterval(globalReExtractInterval);
                globalReExtractInterval = null;
              }
            },
            onToggleAutoOpen: async (enabled: boolean) => {
              await chrome.storage.local.set({ clipsy_auto_open_panel: enabled });
            },
          })
        );
      }
    }
  };

  // Set up periodic re-extraction (every 2 seconds for first 10 seconds, then every 5 seconds)
  const startReExtraction = () => {
    let attempts = 0;
    const maxQuickAttempts = 5; // 5 attempts * 2 seconds = 10 seconds
    
    if (globalReExtractInterval) {
      clearInterval(globalReExtractInterval);
    }
    
    globalReExtractInterval = window.setInterval(() => {
      attempts++;
      reExtractData();
      
      // After quick attempts, slow down
      if (attempts >= maxQuickAttempts && globalReExtractInterval) {
        clearInterval(globalReExtractInterval);
        globalReExtractInterval = window.setInterval(reExtractData, 5000); // Every 5 seconds
      }
    }, 2000); // Every 2 seconds initially
  };

  // Render React component
  let root: ReturnType<typeof createRoot> | null = null;
  
  const renderPanel = async (focusedInput: HTMLElement | null, inputValue: string) => {
    if (!root) {
      root = createRoot(panelContainer);
    }

    // Fetch listing data if not already loaded
    if (!listingData) {
      await fetchListingData();
      // Start periodic re-extraction to catch async-loaded data
      startReExtraction();
    }
    
    root.render(
      React.createElement(ClipsyPanel, {
        listingId: listingId,
        focusedInput: focusedInput,
        inputValue: inputValue,
        listingData: listingData,
        onClose: () => {
          // Slide panel to the side instead of hiding completely
          panelContainer.classList.add('clipsy-panel-hidden');
          // Show floating reopen icon
          showReopenIcon();
          if (globalReExtractInterval) {
            clearInterval(globalReExtractInterval);
            globalReExtractInterval = null;
          }
        },
        onToggleAutoOpen: async (enabled: boolean) => {
          await chrome.storage.local.set({ clipsy_auto_open_panel: enabled });
        },
      })
    );
  };

  // Set up input detection callback
  const handleInputFocus = (element: HTMLElement, value: string) => {
    // Update React component with new focused input
    renderPanel(element, value);
  };

  // Set up input detection
  setupInputDetection(handleInputFocus);

  // Initial render (will fetch listing data)
  renderPanel(null, '');

  // Auto-open if enabled
  if (autoOpen) {
    panelContainer.style.display = 'block';
    panelContainer.classList.remove('clipsy-panel-hidden');
  } else {
    panelContainer.style.display = 'block';
    panelContainer.classList.add('clipsy-panel-hidden');
    // Add a button to manually open
    addToggleButton(panelContainer);
  }
  
  // Always add the floating reopen icon (will be shown/hidden as needed)
  addReopenIcon(panelContainer);
}

// Add a toggle button to show/hide panel
function addToggleButton(panelContainer: HTMLElement) {
  // Remove existing button if present
  const existing = document.getElementById('clipsy-toggle-btn');
  if (existing) {
    existing.remove();
  }
  
  const button = document.createElement('button');
  button.id = 'clipsy-toggle-btn';
  button.className = 'clipsy-toggle-btn';
  button.innerHTML = '📊 Clipsy';
  button.title = 'Open Clipsy Panel';
  button.onclick = () => {
    const isHidden = panelContainer.classList.contains('clipsy-panel-hidden');
    if (isHidden) {
      panelContainer.classList.remove('clipsy-panel-hidden');
      hideReopenIcon();
    } else {
      panelContainer.classList.add('clipsy-panel-hidden');
      showReopenIcon();
    }
  };
  document.body.appendChild(button);
}

// Add floating reopen icon
function addReopenIcon(panelContainer: HTMLElement) {
  // Remove existing icon if present
  const existing = document.getElementById('clipsy-reopen-icon');
  if (existing) {
    existing.remove();
  }
  
  const icon = document.createElement('button');
  icon.id = 'clipsy-reopen-icon';
  icon.className = 'clipsy-reopen-icon';
  icon.innerHTML = '📊';
  icon.title = 'Reopen Clipsy Panel';
  icon.onclick = () => {
    panelContainer.classList.remove('clipsy-panel-hidden');
    hideReopenIcon();
  };
  document.body.appendChild(icon);
}

// Show the floating reopen icon
function showReopenIcon() {
  const icon = document.getElementById('clipsy-reopen-icon');
  if (icon) {
    icon.classList.add('clipsy-reopen-visible');
  }
}

// Hide the floating reopen icon
function hideReopenIcon() {
  const icon = document.getElementById('clipsy-reopen-icon');
  if (icon) {
    icon.classList.remove('clipsy-reopen-visible');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-initialize on navigation (Etsy uses client-side routing)
let lastUrl = location.href;
let globalReExtractInterval: number | null = null;

new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // Clear any existing re-extraction interval
    if (globalReExtractInterval) {
      clearInterval(globalReExtractInterval);
      globalReExtractInterval = null;
    }
    if (isListingEditorPage()) {
      // Wait for form fields instead of arbitrary delay
      waitForFormFields(3000).then(() => {
        init();
      });
    }
  }
}).observe(document, { subtree: true, childList: true });

