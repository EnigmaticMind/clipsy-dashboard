import { useState, useEffect } from "react";
import { trackEvent } from "../services/analytics";

interface Feature {
  id: string;
  name: string;
}

const FEATURES: Feature[] = [
  {
    id: "more-shops-support",
    name: "Support for Shopify or other e-commerce platforms",
  },
  {
    id: "more-etsy-shops-support",
    name: "Support for multiple Etsy shops",
  },
  {
    id: "bulk-edit-improvements",
    name: "Bulk Edit Improvements with advanced filtering options",
  },
  {
    id: "image-management",
    name: "Image management support for listings",
  },
  {
    id: "scheduled-publishing",
    name: "Scheduled Publishing of listings for specific dates and times",
  },
  {
    id: "multi-shop-support",
    name: "Multi-Shop Support",
  },
  {
    id: "ai-seo-suggestions",
    name: "AI SEO Suggestions for Titles and Descriptions",
  },
  {
    id: "ai-image-generation",
    name: "AI image generation for listings",
  },
];

// Check if user has voted for a feature in this session
function hasVotedInSession(featureId: string): boolean {
  const votes = sessionStorage.getItem("clipsy:feature_votes");
  if (!votes) return false;
  const votesObj = JSON.parse(votes);
  return votesObj[featureId] !== undefined;
}

// Record a vote in session storage
function recordVote(featureId: string, vote: "up" | "down"): void {
  const votes = sessionStorage.getItem("clipsy:feature_votes");
  const votesObj = votes ? JSON.parse(votes) : {};
  votesObj[featureId] = vote;
  sessionStorage.setItem("clipsy:feature_votes", JSON.stringify(votesObj));
}

// Get the user's vote for a feature
function getUserVote(featureId: string): "up" | "down" | null {
  const votes = sessionStorage.getItem("clipsy:feature_votes");
  if (!votes) return null;
  const votesObj = JSON.parse(votes);
  return votesObj[featureId] || null;
}

export default function FeatureVoting() {
  const [votedFeatures, setVotedFeatures] = useState<Set<string>>(new Set());
  const [customSuggestion, setCustomSuggestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    // Load voted features from session storage
    const votes = sessionStorage.getItem("clipsy:feature_votes");
    if (votes) {
      const votesObj = JSON.parse(votes);
      setVotedFeatures(new Set(Object.keys(votesObj)));
    }
  }, []);

  const handleVote = async (featureId: string, vote: "up" | "down") => {
    // Check if already voted
    if (hasVotedInSession(featureId)) {
      return;
    }

    // Record vote in session storage
    recordVote(featureId, vote);
    setVotedFeatures(new Set([...votedFeatures, featureId]));

    // Track vote in Google Analytics
    await trackEvent("feature_vote", {
      feature_id: featureId,
      vote: vote,
      event_category: "feedback",
      event_label: FEATURES.find((f) => f.id === featureId)?.name || featureId,
    });
  };

  const handleCustomSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customSuggestion.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Track custom feature suggestion in Google Analytics
      await trackEvent("custom_feature_suggestion", {
        suggestion: customSuggestion.trim(),
        event_category: "feedback",
        event_label: "custom_suggestion",
      });

      // Clear form and show success
      setCustomSuggestion("");
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 3000);
    } catch (error) {
      console.error("Error submitting suggestion:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
      <p className="text-gray-600 mb-6">
        Vote on what you'd like to see next. You can vote once per feature per
        session.
      </p>

      <div className="space-y-2">
        {FEATURES.map((feature) => {
          const hasVoted = votedFeatures.has(feature.id);
          const userVote = getUserVote(feature.id);

          return (
            <div
              key={feature.id}
              className="flex items-center justify-between gap-4 p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 rounded transition"
            >
              <h3 className="font-medium text-gray-900 flex-1">
                {feature.name}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleVote(feature.id, "up")}
                  disabled={hasVoted}
                  className={`
                    p-2 rounded-full transition
                    ${
                      hasVoted && userVote === "up"
                        ? "bg-green-100 text-green-600"
                        : hasVoted
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : "bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600"
                    }
                  `}
                  title="Vote up"
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
                </button>
                <button
                  onClick={() => handleVote(feature.id, "down")}
                  disabled={hasVoted}
                  className={`
                    p-2 rounded-full transition
                    ${
                      hasVoted && userVote === "down"
                        ? "bg-red-100 text-red-600"
                        : hasVoted
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                        : "bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600"
                    }
                  `}
                  title="Vote down"
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
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
        <p className="text-sm text-indigo-800">
          <strong>Note:</strong> Votes are tracked anonymously via Google
          Analytics to help us prioritize features. You can vote once per
          feature per browser session.
        </p>
      </div>

      {/* Custom Feature Suggestion Form */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Have Another Idea?
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          Suggest a new feature that isn't listed above.
        </p>
        <form onSubmit={handleCustomSuggestionSubmit}>
          <div className="flex gap-3">
            <input
              type="text"
              value={customSuggestion}
              onChange={(e) => setCustomSuggestion(e.target.value)}
              placeholder="Enter your feature suggestion..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={
                isSubmitting || !customSuggestion.trim() || submitSuccess
              }
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {submitSuccess
                ? "✓ Sent"
                : isSubmitting
                ? "Sending..."
                : "Submit"}
            </button>
          </div>
          {submitSuccess && (
            <p className="mt-2 text-sm text-green-600">
              Thank you! Your suggestion has been recorded.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
