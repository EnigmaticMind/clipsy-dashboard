import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import ReviewPrompt from "../components/ReviewPrompt";
import { 
  shouldShowReviewPrompt, 
  trackSuccessfulOperation,
  hasPendingReviewPrompt,
  clearPendingReviewPrompt,
} from "../services/reviewPrompt";

interface ReviewPromptContextType {
  showReviewPrompt: () => Promise<void>;
  checkAndShowReviewPrompt: () => Promise<void>;
  checkPendingReviewPrompt: () => Promise<void>;
}

const ReviewPromptContext = createContext<ReviewPromptContextType | undefined>(undefined);

export function useReviewPrompt() {
  const context = useContext(ReviewPromptContext);
  if (!context) {
    throw new Error("useReviewPrompt must be used within a ReviewPromptProvider");
  }
  return context;
}

interface ReviewPromptProviderProps {
  children: ReactNode;
}

export function ReviewPromptProvider({ children }: ReviewPromptProviderProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  // Track a successful operation and check if we should show the prompt
  const showReviewPrompt = useCallback(async () => {
    // Track the operation
    await trackSuccessfulOperation();
    
    // Check if we should show the prompt
    const shouldShow = await shouldShowReviewPrompt();
    if (shouldShow) {
      setShowPrompt(true);
    }
  }, []);

  // Just check if we should show the prompt (without tracking)
  const checkAndShowReviewPrompt = useCallback(async () => {
    const shouldShow = await shouldShowReviewPrompt();
    if (shouldShow) {
      setShowPrompt(true);
    }
  }, []);

  // Check for pending review prompt (called on page mount)
  const checkPendingReviewPrompt = useCallback(async () => {
    const hasPending = await hasPendingReviewPrompt();
    if (hasPending) {
      const shouldShow = await shouldShowReviewPrompt();
      if (shouldShow) {
        await clearPendingReviewPrompt();
        setShowPrompt(true);
      } else {
        // Clear pending if conditions no longer met
        await clearPendingReviewPrompt();
      }
    }
  }, []);

  const handleClose = useCallback(() => {
    setShowPrompt(false);
  }, []);

  return (
    <ReviewPromptContext.Provider
      value={{ showReviewPrompt, checkAndShowReviewPrompt, checkPendingReviewPrompt }}
    >
      {children}
      {/* Review Prompt Modal */}
      {showPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <ReviewPrompt onClose={handleClose} />
          </div>
        </div>
      )}
    </ReviewPromptContext.Provider>
  );
}

