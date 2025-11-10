import { useState, useEffect } from 'react';
import { trackEvent } from '../services/analytics';

interface Feature {
  id: string;
  name: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    id: 'bulk-edit-improvements',
    name: 'Bulk Edit Improvements',
    description: 'Enhanced bulk editing with filters, search, and batch operations',
  },
  {
    id: 'google-sheets-sync',
    name: 'Google Sheets Auto-Sync',
    description: 'Automatic two-way sync between Etsy and Google Sheets',
  },
  {
    id: 'image-management',
    name: 'Image Management',
    description: 'Upload, organize, and manage listing images directly in Clipsy',
  },
  {
    id: 'variation-bulk-edit',
    name: 'Variation Bulk Editing',
    description: 'Edit variations in bulk with advanced filtering options',
  },
  {
    id: 'scheduled-publishing',
    name: 'Scheduled Publishing',
    description: 'Schedule listings to go live at specific dates and times',
  },
  {
    id: 'multi-shop-support',
    name: 'Multi-Shop Support',
    description: 'Manage multiple Etsy shops from a single dashboard',
  },
  {
    id: 'ai-seo-suggestions',
    name: 'AI SEO Suggestions',
    description: 'AI-powered SEO optimization suggestions for titles and descriptions',
  },
  {
    id: 'inventory-tracking',
    name: 'Inventory Tracking',
    description: 'Track inventory levels and get low stock alerts',
  },
];

// Check if user has voted for a feature in this session
function hasVotedInSession(featureId: string): boolean {
  const votes = sessionStorage.getItem('clipsy:feature_votes');
  if (!votes) return false;
  const votesObj = JSON.parse(votes);
  return votesObj[featureId] !== undefined;
}

// Record a vote in session storage
function recordVote(featureId: string, vote: 'up' | 'down'): void {
  const votes = sessionStorage.getItem('clipsy:feature_votes');
  const votesObj = votes ? JSON.parse(votes) : {};
  votesObj[featureId] = vote;
  sessionStorage.setItem('clipsy:feature_votes', JSON.stringify(votesObj));
}

// Get the user's vote for a feature
function getUserVote(featureId: string): 'up' | 'down' | null {
  const votes = sessionStorage.getItem('clipsy:feature_votes');
  if (!votes) return null;
  const votesObj = JSON.parse(votes);
  return votesObj[featureId] || null;
}

export default function FeatureVoting() {
  const [votedFeatures, setVotedFeatures] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load voted features from session storage
    const votes = sessionStorage.getItem('clipsy:feature_votes');
    if (votes) {
      const votesObj = JSON.parse(votes);
      setVotedFeatures(new Set(Object.keys(votesObj)));
    }
  }, []);

  const handleVote = async (featureId: string, vote: 'up' | 'down') => {
    // Check if already voted
    if (hasVotedInSession(featureId)) {
      return;
    }

    // Record vote in session storage
    recordVote(featureId, vote);
    setVotedFeatures(new Set([...votedFeatures, featureId]));

    // Track vote in Google Analytics
    await trackEvent('feature_vote', {
      feature_id: featureId,
      vote: vote,
      event_category: 'feedback',
      event_label: FEATURES.find(f => f.id === featureId)?.name || featureId,
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">
        Feature Requests
      </h2>
      <p className="text-gray-600 mb-6">
        Help us prioritize features! Vote on what you'd like to see next. You can vote once per feature per session.
      </p>

      <div className="space-y-4">
        {FEATURES.map((feature) => {
          const hasVoted = votedFeatures.has(feature.id);
          const userVote = getUserVote(feature.id);

          return (
            <div
              key={feature.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {feature.name}
                  </h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVote(feature.id, 'up')}
                    disabled={hasVoted}
                    className={`
                      flex items-center gap-1 px-3 py-2 rounded-lg transition
                      ${
                        hasVoted && userVote === 'up'
                          ? 'bg-green-100 text-green-700 border-2 border-green-300'
                          : hasVoted
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-50 text-gray-700 hover:bg-green-50 hover:text-green-700 border border-gray-200'
                      }
                    `}
                    title={hasVoted ? 'You already voted' : 'Vote up'}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-medium">Up</span>
                  </button>
                  <button
                    onClick={() => handleVote(feature.id, 'down')}
                    disabled={hasVoted}
                    className={`
                      flex items-center gap-1 px-3 py-2 rounded-lg transition
                      ${
                        hasVoted && userVote === 'down'
                          ? 'bg-red-100 text-red-700 border-2 border-red-300'
                          : hasVoted
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-50 text-gray-700 hover:bg-red-50 hover:text-red-700 border border-gray-200'
                      }
                    `}
                    title={hasVoted ? 'You already voted' : 'Vote down'}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-medium">Down</span>
                  </button>
                </div>
              </div>
              {hasVoted && (
                <div className="mt-2 text-xs text-gray-500">
                  ✓ You voted {userVote === 'up' ? '👍' : '👎'} for this feature
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
        <p className="text-sm text-indigo-800">
          <strong>Note:</strong> Votes are tracked anonymously via Google Analytics to help us prioritize features. 
          You can vote once per feature per browser session.
        </p>
      </div>
    </div>
  );
}

