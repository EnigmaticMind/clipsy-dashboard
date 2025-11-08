import { useState, useEffect } from "react";
import {
  getSuggestions,
  type ListingContext,
} from "../services/suggestionService";
import type { SEOSuggestion } from "../services/seoService";
import { logger } from "../utils/logger";

interface SEOSuggestionsProps {
  listingContext: ListingContext | null;
}

export default function SEOSuggestions({
  listingContext,
}: SEOSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SEOSuggestion[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listingContext) {
      setSuggestions([]);
      return;
    }

    const loadSuggestions = async () => {
      setError(null);

      try {
        const result = await getSuggestions(listingContext);
        // Suggestions are available immediately (rule-based or AI-enhanced)
        setSuggestions(result.suggestions);
        setAiAvailable(result.aiAvailable);
        setAiEnabled(result.aiEnabled);

        if (result.error) {
          setError(result.error);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load suggestions"
        );
      }
    };

    loadSuggestions();
  }, [listingContext]);

  if (!listingContext) {
    return (
      <div
        style={{
          padding: "16px",
          background: "#f9f9f9",
          borderRadius: "8px",
          textAlign: "center",
          color: "#999",
          fontSize: "14px",
        }}
      >
        Load listing data to see SEO suggestions
      </div>
    );
  }

  // Filter suggestions by focused field if provided
  const displaySuggestions = suggestions;

  // Always show suggestions if we have them, even if there's an error
  // Error should be displayed as a warning, not block the suggestions
  if (displaySuggestions.length === 0 && !error) {
    return null;
  }

  // If we have no suggestions but there's an error, show the error
  if (displaySuggestions.length === 0 && error) {
    return (
      <div
        style={{
          padding: "12px",
          background: "#fee",
          borderRadius: "8px",
          border: "1px solid #fcc",
          color: "#c33",
          fontSize: "14px",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "16px",
            fontWeight: 600,
            color: "#222",
          }}
        >
          SEO Suggestions
        </h3>
        {aiEnabled && (
          <span
            style={{
              fontSize: "11px",
              padding: "4px 8px",
              background: aiAvailable ? "#d4edda" : "#f8d7da",
              color: aiAvailable ? "#155724" : "#721c24",
              borderRadius: "4px",
              fontWeight: 500,
            }}
          >
            {aiAvailable ? "AI ✓" : "AI ✗"}
          </span>
        )}
      </div>

      {/* Show error as warning if present, but don't block suggestions */}
      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fff3cd",
            borderRadius: "6px",
            border: "1px solid #ffeaa7",
            color: "#856404",
            fontSize: "12px",
            marginBottom: "12px",
          }}
        >
          ⚠️ {error} (Showing rule-based suggestions)
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {displaySuggestions.map((suggestion, index) => (
          <div
            key={index}
            style={{
              padding: "12px",
              background: "#f8f9fa",
              borderRadius: "8px",
              border: "1px solid #dee2e6",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#495057",
                  textTransform: "capitalize",
                }}
              >
                {suggestion.field}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "#666",
                  }}
                >
                  Score: {suggestion.score}/100
                </div>
                {suggestion.source === "ai" && (
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      background: "#d1ecf1",
                      color: "#0c5460",
                      borderRadius: "3px",
                    }}
                  >
                    AI
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: "8px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#666",
                  marginBottom: "4px",
                }}
              >
                Current:
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#495057",
                  padding: "6px",
                  background: "white",
                  borderRadius: "4px",
                  border: "1px solid #dee2e6",
                  maxHeight: "60px",
                  overflow: "auto",
                  wordBreak: "break-word",
                }}
              >
                {suggestion.current || "(empty)"}
              </div>
            </div>

            <div style={{ marginBottom: "8px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#666",
                  marginBottom: "4px",
                }}
              >
                Suggested:
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#28a745",
                  fontWeight: 500,
                  padding: "6px",
                  background: "#d4edda",
                  borderRadius: "4px",
                  border: "1px solid #c3e6cb",
                  maxHeight: "60px",
                  overflow: "auto",
                  wordBreak: "break-word",
                }}
              >
                {suggestion.suggested}
              </div>
            </div>

            {suggestion.issues.length > 0 && (
              <div style={{ marginBottom: "8px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#856404",
                    marginBottom: "4px",
                  }}
                >
                  Issues:
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#856404",
                  }}
                >
                  {suggestion.issues.join(", ")}
                </div>
              </div>
            )}

            {suggestion.improvements.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#0066cc",
                    marginBottom: "4px",
                  }}
                >
                  Improvements:
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "20px",
                    fontSize: "12px",
                    color: "#0066cc",
                  }}
                >
                  {suggestion.improvements.map((imp, i) => (
                    <li key={i}>{imp}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => {
                // Apply suggestion to Etsy's form field
                applySuggestionToEtsy(suggestion.field, suggestion.suggested);
              }}
              style={{
                marginTop: "8px",
                width: "100%",
                padding: "6px 12px",
                background: "#0a7c4a",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              Apply Suggestion
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Apply suggestion to Etsy's form field
function applySuggestionToEtsy(
  field: "title" | "description" | "tags",
  value: string
) {
  // Find the appropriate input field in Etsy's form
  let input: HTMLInputElement | HTMLTextAreaElement | null = null;

  switch (field) {
    case "title":
      // Try specific selector first (textarea with name and id)
      input = document.querySelector(
        'textarea[name="title"]#listing-title-input'
      ) as HTMLTextAreaElement;
      // Fallback to other selectors
      if (!input) {
        input = document.querySelector(
          'textarea[name="title"]'
        ) as HTMLTextAreaElement;
      }
      if (!input) {
        input = document.querySelector(
          "#listing-title-input"
        ) as HTMLTextAreaElement;
      }
      break;
    case "description":
      // Try common description selectors
      input = document.querySelector(
        'textarea[name="description"]'
      ) as HTMLTextAreaElement;
      if (!input) {
        input = document.querySelector(
          '[data-test-id*="description"] textarea'
        ) as HTMLTextAreaElement;
      }
      break;
    case "tags":
      // Tags input field
      input = document.querySelector("#listing-tags-input") as HTMLInputElement;
      if (!input) {
        input = document.querySelector('input[id*="tag"]') as HTMLInputElement;
      }
      break;
  }

  if (input) {
    // Set the value
    input.value = value;

    // Trigger React's synthetic events
    // React listens for these events on the input
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set ||
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, value);
    }

    // Dispatch events that React listens to
    // Also try React's synthetic event system
    const reactInputEvent = new Event("input", { bubbles: true });
    Object.defineProperty(reactInputEvent, "target", {
      writable: false,
      value: input,
    });

    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(reactInputEvent);
    input.dispatchEvent(changeEvent);

    // Focus the input to ensure React sees the change
    input.focus();
    input.blur();

    logger.log(`Clipsy: Applied ${field} suggestion:`, value);
  } else {
    logger.warn(`Clipsy: Could not find ${field} input field in Etsy's form`);
    // Try to log available inputs for debugging
    const allInputs = document.querySelectorAll("input, textarea");
    logger.log(
      "Clipsy: Available inputs:",
      Array.from(allInputs).map((el) => ({
        tagName: el.tagName,
        name: (el as HTMLInputElement).name,
        id: el.id,
        type: (el as HTMLInputElement).type,
      }))
    );
  }
}
