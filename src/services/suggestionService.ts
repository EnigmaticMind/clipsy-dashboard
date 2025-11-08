// Suggestion service - combines rule-based and AI suggestions
// Main entry point for getting SEO suggestions

import { generateRuleBasedSuggestions, type SEOSuggestion } from './seoService';
import {
  enhanceSuggestionsWithAI,
  loadAIConfig,
  saveAIConfig,
  checkAIAvailability,
  type AIConfig,
} from './aiService';

export interface ListingContext {
  title: string;
  description: string;
  tags: string[];
  category?: string;
}

export interface SuggestionResult {
  suggestions: SEOSuggestion[];
  aiAvailable: boolean;
  aiEnabled: boolean;
  aiLoading?: boolean;
  aiLoadingProgress?: { progress: number; text: string } | null;
  error?: string;
}

// Get suggestions (rule-based + optional AI)
export async function getSuggestions(
  context: ListingContext
): Promise<SuggestionResult> {
  // Always generate rule-based suggestions first
  const ruleBasedSuggestions = generateRuleBasedSuggestions(
    context.title,
    context.description,
    context.tags
  );

  // Load AI config
  const aiConfig = await loadAIConfig();
  
  // Check if AI is enabled and available
  let aiAvailable = false;
  const aiEnabled = aiConfig.enabled;
  let error: string | undefined;

  if (aiConfig.enabled) {
    try {
      const availability = await checkAIAvailability();
      aiAvailable = availability.available;
      if (!aiAvailable) {
        error = availability.error || 'API key is required or invalid.';
      }
    } catch (err) {
      aiAvailable = false;
      error = 'Failed to check Gemini API availability.';
    }
  }

  // No loading state for Gemini API (instant responses)
  const aiLoading = false;
  const aiLoadingProgress = null;
  
  // Always start with rule-based suggestions - show them immediately
  let finalSuggestions: SEOSuggestion[] = ruleBasedSuggestions;
  
  // If AI is enabled and available, try to enhance suggestions
  if (aiConfig.enabled && aiAvailable) {
    try {
      const aiEnhanced = await enhanceSuggestionsWithAI(
        ruleBasedSuggestions.map(s => ({
          field: s.field,
          current: s.current,
          suggested: s.suggested,
        })),
        context,
        aiConfig
      );

      // Merge AI suggestions with rule-based
      // Prefer AI suggestions if available, fallback to rule-based
      finalSuggestions = ruleBasedSuggestions.map((ruleBased) => {
        const aiSuggestion = aiEnhanced.find(
          ai => ai.field === ruleBased.field
        );
        
        if (aiSuggestion) {
          return {
            ...ruleBased,
            suggested: aiSuggestion.suggested,
            source: 'ai' as const,
            improvements: [
              ...ruleBased.improvements,
              'Enhanced with AI suggestions',
            ],
          };
        }
        
        return ruleBased;
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate AI suggestions';
      
      // Set error for API failures
      error = errorMsg;
    }
  }
  
  // Ensure we always return rule-based suggestions, even if AI fails or is loading
  // The component will poll for AI-enhanced suggestions when ready
  // Rule-based suggestions should always be available

  return {
    suggestions: finalSuggestions, // Always includes rule-based suggestions
    aiAvailable,
    aiEnabled,
    aiLoading,
    aiLoadingProgress,
    error, // Only set for non-model-loading errors
  };
}

// Get AI config
export async function getAIConfig(): Promise<AIConfig> {
  return loadAIConfig();
}

// Update AI config
export async function updateAIConfig(config: Partial<AIConfig>): Promise<void> {
  const current = await loadAIConfig();
  const updated = { ...current, ...config };
  await saveAIConfig(updated);
}

