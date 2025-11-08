// AI service for Google Gemini API integration
// Provides AI-enhanced SEO suggestions using Google's Gemini API
// Users provide their own API key - all costs are billed to their account

import { logger } from '../utils/logger';

export interface AIConfig {
  enabled: boolean;
  apiKey?: string;
}

const DEFAULT_CONFIG: AIConfig = {
  enabled: false,
};

// Generate AI suggestion for a specific field using Google Gemini API
export async function generateAISuggestion(
  field: 'title' | 'description' | 'tags',
  currentValue: string,
  context: {
    title?: string;
    description?: string;
    tags?: string[];
    category?: string;
  },
  config: AIConfig = DEFAULT_CONFIG
): Promise<string> {
  if (!config.enabled) {
    throw new Error('AI suggestions are not enabled');
  }

  if (!config.apiKey) {
    throw new Error('Google Gemini API key is required. Please add your API key in Settings.');
  }

  // Build field-specific guidelines
  const fieldGuidelines: Record<string, string> = {
    title: `You are an SEO expert helping optimize an Etsy listing title. 
CRITICAL REQUIREMENTS:
- Title must be 50-60 characters long (this is a hard requirement)
- Include relevant keywords naturally
- Make it compelling and clear
- Avoid filler words like "the", "a", "an"
- Focus on what makes the product unique

Current title: "${currentValue}"
${context.description ? `Product description context: "${context.description.substring(0, 200)}"` : ''}
${context.tags && context.tags.length > 0 ? `Current tags: ${context.tags.join(', ')}` : ''}

Generate an optimized Etsy listing title that is exactly 50-60 characters. Return ONLY the title text, nothing else.`,

    description: `You are an SEO expert helping optimize an Etsy listing description.
CRITICAL REQUIREMENTS:
- Description must be 200-500 words long (this is a hard requirement)
- Include relevant keywords naturally throughout
- Structure with clear sections (product details, features, care instructions, etc.)
- Make it compelling and informative
- Include call-to-action naturally

Current description: "${currentValue}"
${context.title ? `Product title: "${context.title}"` : ''}
${context.tags && context.tags.length > 0 ? `Current tags: ${context.tags.join(', ')}` : ''}

Generate an optimized Etsy listing description that is 200-500 words. Return ONLY the description text, nothing else.`,

    tags: `You are an SEO expert helping optimize Etsy listing tags.
CRITICAL REQUIREMENTS:
- Suggest exactly 13 Etsy tags (comma-separated) for this listing. Etsy allows a maximum of 13 tags.
- Include a mix of broad and specific keywords
- Use relevant long-tail keywords
- Avoid duplicates
- Make tags specific to the product

Current tags: ${currentValue || 'None'}
${context.title ? `Product title: "${context.title}"` : ''}
${context.description ? `Product description: "${context.description.substring(0, 300)}"` : ''}

Generate exactly 13 comma-separated tags optimized for Etsy SEO. Return ONLY the tags as a comma-separated list, nothing else.`,
  };

  if (!field || !(field in fieldGuidelines)) {
    throw new Error(`Invalid field: ${field}`);
  }

  const prompt = fieldGuidelines[field];

  try {
    // Make API call to Google Gemini
    const response = await chrome.runtime.sendMessage({
      action: 'generateAISuggestion',
      apiKey: config.apiKey,
      prompt,
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to generate AI suggestion');
    }

    if (!response.suggestion) {
      throw new Error('No suggestion returned from AI');
    }

    let suggestion = response.suggestion.trim();

    // Post-process to ensure minimum requirements are met
    if (field === 'title') {
      // Ensure title is 50-60 characters
      if (suggestion.length < 50) {
        // Expand with keywords from description only (not tags)
        const descriptionWords = (context.description?.split(' ') || [])
          .filter(w => w.length > 3) // Only meaningful words
          .slice(0, 5);
        
        const needed = 50 - suggestion.length;
        if (descriptionWords.length > 0 && needed > 0) {
          suggestion = `${suggestion} ${descriptionWords.slice(0, Math.ceil(needed / 5)).join(' ')}`.substring(0, 60);
        } else {
          // Generic expansion
          suggestion = `${suggestion} - Handmade Quality Product`.substring(0, 60);
        }
      } else if (suggestion.length > 60) {
        suggestion = suggestion.substring(0, 60).trim();
      }
    } else if (field === 'description') {
      // Ensure description is 200-500 words
      const words = suggestion.split(/\s+/);
      if (words.length < 200) {
        // Expand with context
        const expansion = `\n\nThis high-quality product is perfect for your needs. Each item is carefully crafted with attention to detail. We take pride in offering exceptional products that meet your expectations.`;
        suggestion = (suggestion + expansion).substring(0, 3000); // Max ~500 words
      } else if (words.length > 500) {
        suggestion = words.slice(0, 500).join(' ');
      }
    } else if (field === 'tags') {
      // Ensure exactly 13 tags
      const tags = suggestion.split(',').map((t: string) => t.trim()).filter(Boolean);
      if (tags.length < 13) {
        // Add generic tags if needed
        const genericTags = ['handmade', 'unique', 'gift', 'custom', 'artisan', 'quality', 'handcrafted'];
        const needed = 13 - tags.length;
        tags.push(...genericTags.slice(0, needed));
      } else if (tags.length > 13) {
        // Take first 13
        suggestion = tags.slice(0, 13).join(', ');
        return suggestion;
      }
      suggestion = tags.join(', ');
    }

    return suggestion;
  } catch (error) {
    throw new Error(`Gemini API generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Enhance rule-based suggestions with AI
export async function enhanceSuggestionsWithAI(
  suggestions: Array<{ field: string; current: string; suggested: string }>,
  context: {
    title?: string;
    description?: string;
    tags?: string[];
  },
  config: AIConfig = DEFAULT_CONFIG
): Promise<Array<{ field: string; current: string; suggested: string; source: 'ai' }>> {
  if (!config.enabled) {
    throw new Error('AI suggestions are not enabled');
  }

  const enhanced: Array<{ field: string; current: string; suggested: string; source: 'ai' }> = [];

  for (const suggestion of suggestions) {
    try {
      const aiSuggestion = await generateAISuggestion(
        suggestion.field as 'title' | 'description' | 'tags',
        suggestion.current,
        context,
        config
      );

      enhanced.push({
        field: suggestion.field,
        current: suggestion.current,
        suggested: aiSuggestion,
        source: 'ai',
      });
    } catch (error) {
      // If AI fails, silently fall back to rule-based suggestion
      logger.warn(`AI suggestion failed for ${suggestion.field}:`, error);
      // Return empty array element - caller should use rule-based suggestion
    }
  }

  return enhanced;
}

// Load AI config from storage
export async function loadAIConfig(): Promise<AIConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['clipsy_ai_config'], (result) => {
      if (result.clipsy_ai_config) {
        resolve({ ...DEFAULT_CONFIG, ...result.clipsy_ai_config });
      } else {
        resolve(DEFAULT_CONFIG);
      }
    });
  });
}

// Save AI config to storage
export async function saveAIConfig(config: AIConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ clipsy_ai_config: config }, () => {
      resolve();
    });
  });
}

// Check if AI is available (API key is set and valid)
export async function checkAIAvailability(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    const config = await loadAIConfig();
    
    if (!config.enabled) {
      return {
        available: false,
        error: 'AI suggestions are not enabled',
      };
    }

    if (!config.apiKey || config.apiKey.trim() === '') {
      return {
        available: false,
        error: 'Google Gemini API key is required. Please add your API key in Settings.',
      };
    }

    // Test the API key by making a simple request
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'testGeminiAPI',
        apiKey: config.apiKey,
      });

      if (response?.success) {
        return {
          available: true,
        };
      } else {
        return {
          available: false,
          error: response?.error || 'API key validation failed',
        };
      }
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Failed to validate API key',
      };
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// These functions are kept for backward compatibility but return false/null
// since we don't have a loading engine anymore
export async function isEngineLoading(): Promise<boolean> {
  return false;
}

export async function getLoadingProgress(): Promise<{ progress: number; text: string } | null> {
  return null;
}

// Debug info (simplified for Gemini API)
export interface EngineDebugInfo {
  hasEngine: boolean;
  isLoading: boolean;
  progress: { progress: number; text: string } | null;
  availableModels: string[];
  engineInitializing: boolean;
  apiKeySet: boolean;
}

export async function getEngineDebugInfo(): Promise<EngineDebugInfo | null> {
  try {
    const config = await loadAIConfig();
    return {
      hasEngine: config.enabled && !!config.apiKey,
      isLoading: false,
      progress: null,
      availableModels: ['gemini-2.0-flash'],
      engineInitializing: false,
      apiKeySet: !!config.apiKey,
    };
  } catch (error) {
    logger.warn('Clipsy: Could not get engine debug info:', error);
    return null;
  }
}
