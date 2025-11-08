// Rule-based SEO analysis for Etsy listings
// Provides fast, reliable SEO suggestions without AI dependencies
// Based on SEO best practices and Etsy's official limits (13 tags max)

export interface SEOAnalysis {
  title: {
    score: number; // 0-100
    length: number;
    optimalLength: boolean;
    keywordDensity: number;
    hasFillerWords: boolean;
    suggestions: string[];
  };
  description: {
    score: number; // 0-100
    length: number;
    wordCount: number;
    optimalLength: boolean;
    hasKeywords: boolean;
    suggestions: string[];
  };
  tags: {
    score: number; // 0-100
    count: number;
    optimalCount: number; // 13 is Etsy's official maximum
    hasLongTailKeywords: boolean;
    suggestions: string[];
  };
  overallScore: number; // Average of all scores
}

export interface SEOSuggestion {
  field: 'title' | 'description' | 'tags';
  current: string;
  suggested: string;
  score: number; // 0-100
  issues: string[];
  improvements: string[];
  source: 'rule-based' | 'ai';
}

// Common filler words to avoid in titles
const FILLER_WORDS = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];

// Analyze title SEO
export function analyzeTitle(title: string): SEOAnalysis['title'] {
  const trimmed = title.trim();
  const length = trimmed.length;
  const words = trimmed.toLowerCase().split(/\s+/);
  const wordCount = words.length;
  
  // Optimal length: 50-60 characters (best practice for SEO and readability)
  const optimalLength = length >= 50 && length <= 60;
  
  // Count filler words
  const fillerCount = words.filter(w => FILLER_WORDS.includes(w)).length;
  const hasFillerWords = fillerCount > wordCount * 0.3; // More than 30% filler words
  
  // Calculate keyword density (simplified - count unique meaningful words)
  const meaningfulWords = words.filter(w => !FILLER_WORDS.includes(w) && w.length > 2);
  const uniqueWords = new Set(meaningfulWords);
  const keywordDensity = uniqueWords.size / Math.max(wordCount, 1);
  
  // Calculate score
  let score = 100;
  if (!optimalLength) score -= 30;
  if (hasFillerWords) score -= 20;
  if (keywordDensity < 0.5) score -= 20;
  if (length < 30) score -= 15;
  if (length > 70) score -= 15;
  score = Math.max(0, Math.min(100, score));
  
  // Generate suggestions
  const suggestions: string[] = [];
  if (length < 50) {
    suggestions.push(`Title is too short (${length} chars). Aim for 50-60 characters for better SEO visibility.`);
  }
  if (length > 60) {
    suggestions.push(`Title is too long (${length} chars). Consider keeping it to 50-60 characters for optimal search visibility.`);
  }
  if (hasFillerWords) {
    suggestions.push('Remove unnecessary filler words to make room for keywords.');
  }
  if (keywordDensity < 0.5) {
    suggestions.push('Add more relevant keywords to improve search visibility.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Title looks good! It follows SEO best practices.');
  }
  
  return {
    score,
    length,
    optimalLength,
    keywordDensity,
    hasFillerWords,
    suggestions,
  };
}

// Analyze description SEO
export function analyzeDescription(description: string): SEOAnalysis['description'] {
  const trimmed = description.trim();
  const length = trimmed.length;
  const words = trimmed.toLowerCase().split(/\s+/);
  const wordCount = words.length;
  
  // Optimal length: 200-500 words (best practice for comprehensive product information)
  const optimalLength = wordCount >= 200 && wordCount <= 500;
  
  // Check for keywords (simplified - look for repeated meaningful words)
  const meaningfulWords = words.filter(w => w.length > 3);
  const wordFrequency = new Map<string, number>();
  meaningfulWords.forEach(w => {
    wordFrequency.set(w, (wordFrequency.get(w) || 0) + 1);
  });
  const hasKeywords = Array.from(wordFrequency.values()).some(count => count >= 2);
  
  // Calculate score
  let score = 100;
  if (!optimalLength) {
    if (wordCount < 200) score -= 30;
    if (wordCount > 500) score -= 20;
  }
  if (!hasKeywords) score -= 20;
  if (length < 100) score -= 20;
  score = Math.max(0, Math.min(100, score));
  
  // Generate suggestions
  const suggestions: string[] = [];
  if (wordCount < 200) {
    suggestions.push(`Description is too short (${wordCount} words). Aim for 200-500 words to provide comprehensive product details.`);
  }
  if (wordCount > 500) {
    suggestions.push(`Description is too long (${wordCount} words). Consider condensing to 200-500 words for better readability.`);
  }
  if (!hasKeywords) {
    suggestions.push('Include relevant keywords naturally throughout the description.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Description looks good! It follows SEO best practices.');
  }
  
  return {
    score,
    length,
    wordCount,
    optimalLength,
    hasKeywords,
    suggestions,
  };
}

// Analyze tags SEO
export function analyzeTags(tags: string[]): SEOAnalysis['tags'] {
  const count = tags.length;
  const optimalCount = 13; // Etsy's official maximum limit
  const hasLongTailKeywords = tags.some(tag => tag.split(/\s+/).length > 1);
  
  // Calculate score
  let score = 100;
  if (count < 10) score -= 30;
  if (count < optimalCount) score -= 10;
  if (count > optimalCount) score -= 20;
  if (!hasLongTailKeywords) score -= 15;
  score = Math.max(0, Math.min(100, score));
  
  // Generate suggestions
  const suggestions: string[] = [];
  if (count < optimalCount) {
    suggestions.push(`You have ${count} tags. Use all ${optimalCount} tags for maximum visibility.`);
  }
  if (count > optimalCount) {
    suggestions.push(`You have ${count} tags. Etsy's maximum is ${optimalCount} tags.`);
  }
  if (!hasLongTailKeywords) {
    suggestions.push('Include long-tail keywords (multi-word phrases) for better search targeting.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Tags look good! You\'re using the optimal number of tags.');
  }
  
  return {
    score,
    count,
    optimalCount,
    hasLongTailKeywords,
    suggestions,
  };
}

// Analyze entire listing
export function analyzeListing(title: string, description: string, tags: string[]): SEOAnalysis {
  const titleAnalysis = analyzeTitle(title);
  const descriptionAnalysis = analyzeDescription(description);
  const tagsAnalysis = analyzeTags(tags);
  
  const overallScore = Math.round(
    (titleAnalysis.score + descriptionAnalysis.score + tagsAnalysis.score) / 3
  );
  
  return {
    title: titleAnalysis,
    description: descriptionAnalysis,
    tags: tagsAnalysis,
    overallScore,
  };
}

// Generate rule-based suggestions
export function generateRuleBasedSuggestions(
  title: string,
  description: string,
  tags: string[]
): SEOSuggestion[] {
  const analysis = analyzeListing(title, description, tags);
  const suggestions: SEOSuggestion[] = [];
  
  // Title suggestion
  let suggestedTitle = title;
  const titleIssues: string[] = [];
  const titleImprovements: string[] = [];
  
  if (title.length < 50) {
    titleIssues.push('Too short');
    titleImprovements.push('Add more descriptive keywords');
  } else if (title.length > 60) {
    titleIssues.push('Too long');
    suggestedTitle = title.substring(0, 60).trim();
    if (suggestedTitle.endsWith(',')) {
      suggestedTitle = suggestedTitle.slice(0, -1).trim();
    }
    titleImprovements.push('Trim to 50-60 characters');
  }
  
  if (analysis.title.hasFillerWords) {
    titleIssues.push('Too many filler words');
    // Remove common filler words
    const words = title.split(/\s+/);
    const filtered = words.filter(w => !FILLER_WORDS.includes(w.toLowerCase()));
    if (filtered.length > 0) {
      suggestedTitle = filtered.join(' ');
    }
    titleImprovements.push('Remove unnecessary words');
  }
  
  suggestions.push({
    field: 'title',
    current: title,
    suggested: suggestedTitle,
    score: analysis.title.score,
    issues: titleIssues.length > 0 ? titleIssues : ['Good'],
    improvements: titleImprovements.length > 0 ? titleImprovements : ['No changes needed'],
    source: 'rule-based',
  });
  
  // Description suggestion
  const suggestedDescription = description;
  const descIssues: string[] = [];
  const descImprovements: string[] = [];
  
  const descWords = description.split(/\s+/).length;
  if (descWords < 200) {
    descIssues.push('Too short');
    descImprovements.push('Expand to 200-500 words with more details');
  } else if (descWords > 500) {
    descIssues.push('Too long');
    descImprovements.push('Condense to 200-500 words');
  }
  
  suggestions.push({
    field: 'description',
    current: description,
    suggested: suggestedDescription,
    score: analysis.description.score,
    issues: descIssues.length > 0 ? descIssues : ['Good'],
    improvements: descImprovements.length > 0 ? descImprovements : ['No changes needed'],
    source: 'rule-based',
  });
  
  // Tags suggestion
  const suggestedTags = [...tags];
  const tagIssues: string[] = [];
  const tagImprovements: string[] = [];
  
  if (tags.length < 13) {
    tagIssues.push(`Only ${tags.length} tags`);
    // Suggest adding more (user would need to provide context)
    tagImprovements.push(`Add ${13 - tags.length} more relevant tags`);
  }
  
  if (!analysis.tags.hasLongTailKeywords) {
    tagIssues.push('No long-tail keywords');
    tagImprovements.push('Add multi-word keyword phrases');
  }
  
  suggestions.push({
    field: 'tags',
    current: tags.join(', '),
    suggested: suggestedTags.join(', '),
    score: analysis.tags.score,
    issues: tagIssues.length > 0 ? tagIssues : ['Good'],
    improvements: tagImprovements.length > 0 ? tagImprovements : ['No changes needed'],
    source: 'rule-based',
  });
  
  return suggestions;
}

