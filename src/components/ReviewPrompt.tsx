import { getReviewUrl, markReviewPromptShown, markReviewPromptDismissed } from '../services/reviewPrompt';

interface ReviewPromptProps {
  onClose: () => void;
}

export default function ReviewPrompt({ onClose }: ReviewPromptProps) {
  const handleLeaveReview = async () => {
    await markReviewPromptShown();
    onClose();
    // Open review page in new tab
    window.open(getReviewUrl(), '_blank', 'noopener,noreferrer');
  };

  const handleAlreadyReviewed = async () => {
    await markReviewPromptShown();
    onClose();
  };

  const handleMaybeLater = async () => {
    await markReviewPromptDismissed();
    onClose();
  };

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-6 shadow-lg">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-indigo-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Enjoying Clipsy?
          </h3>
          <p className="text-sm text-gray-700 mb-4">
            Your feedback helps us improve! Please consider leaving a review on
            the Chrome Web Store.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleLeaveReview}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm"
            >
              Leave a Review
            </button>
            <button
              onClick={handleAlreadyReviewed}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium text-sm"
            >
              Already Reviewed
            </button>
            <button
              onClick={handleMaybeLater}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition font-medium text-sm"
            >
              Maybe Later
            </button>
          </div>
        </div>
        <button
          onClick={handleMaybeLater}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

