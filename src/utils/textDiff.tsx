import React from "react";

/**
 * Simple word-based diff algorithm to highlight differences between two strings
 * Returns JSX with highlighted additions (green) and deletions (red)
 */
export function highlightTextDiff(
  before: string | null | undefined,
  after: string | null | undefined
): React.ReactNode {
  // Handle null/undefined
  const beforeText = before?.toString() || "";
  const afterText = after?.toString() || "";

  // If they're the same, just return the text
  if (beforeText === afterText) {
    return <span>{beforeText || "(empty)"}</span>;
  }

  // If one is empty, show the other with appropriate styling
  if (!beforeText) {
    return (
      <span>
        <span className="text-gray-400 italic">(empty)</span> →{" "}
        <span className="bg-green-200 text-green-900 px-1 rounded">
          {afterText}
        </span>
      </span>
    );
  }

  if (!afterText) {
    return (
      <span>
        <span className="bg-red-200 text-red-900 px-1 rounded line-through">
          {beforeText}
        </span>{" "}
        → <span className="text-gray-400 italic">(empty)</span>
      </span>
    );
  }

  // Split into words for comparison
  const beforeWords = beforeText.split(/(\s+)/);
  const afterWords = afterText.split(/(\s+)/);

  // Simple diff: find common prefix and suffix, highlight the middle
  let prefixEnd = 0;
  let suffixStart = Math.min(beforeWords.length, afterWords.length);

  // Find common prefix
  while (
    prefixEnd < beforeWords.length &&
    prefixEnd < afterWords.length &&
    beforeWords[prefixEnd] === afterWords[prefixEnd]
  ) {
    prefixEnd++;
  }

  // Find common suffix
  while (
    suffixStart > prefixEnd &&
    suffixStart > 0 &&
    beforeWords[suffixStart - 1] === afterWords[suffixStart - 1]
  ) {
    suffixStart--;
  }

  const beforeDiff = beforeWords.slice(prefixEnd, suffixStart).join("");
  const afterDiff = afterWords.slice(prefixEnd, suffixStart).join("");

  // If differences are too large, just show both with highlighting
  if (beforeDiff.length > 50 || afterDiff.length > 50) {
    return (
      <span>
        <span className="bg-red-100 text-red-900 px-1 rounded">
          {beforeText}
        </span>{" "}
        →{" "}
        <span className="bg-green-100 text-green-900 px-1 rounded">
          {afterText}
        </span>
      </span>
    );
  }

  // Build the result with highlighted differences
  const prefix = beforeWords.slice(0, prefixEnd).join("");
  const suffix = beforeWords.slice(suffixStart).join("");

  return (
    <span>
      {prefix && <span>{prefix}</span>}
      {beforeDiff && (
        <span className="bg-red-200 text-red-900 px-1 rounded line-through">
          {beforeDiff}
        </span>
      )}
      {beforeDiff && afterDiff && <span> → </span>}
      {afterDiff && (
        <span className="bg-green-200 text-green-900 px-1 rounded">
          {afterDiff}
        </span>
      )}
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

/**
 * Highlight differences for the "After" column - shows what's new
 */
export function highlightAfter(
  before: string | number | null | undefined,
  after: string | number | null | undefined
): React.ReactNode {
  const beforeText = before?.toString() || "";
  const afterText = after?.toString() || "";

  if (beforeText === afterText) {
    return <span>{afterText || "(empty)"}</span>;
  }

  if (!beforeText) {
    return (
      <span className="bg-green-200 text-green-900 px-1 rounded">
        {afterText}
      </span>
    );
  }

  if (!afterText) {
    return <span className="text-gray-400 italic">(empty)</span>;
  }

  // Split into words
  const beforeWords = beforeText.split(/(\s+)/);
  const afterWords = afterText.split(/(\s+)/);

  let prefixEnd = 0;
  let suffixStart = Math.min(beforeWords.length, afterWords.length);

  // Find common prefix
  while (
    prefixEnd < beforeWords.length &&
    prefixEnd < afterWords.length &&
    beforeWords[prefixEnd] === afterWords[prefixEnd]
  ) {
    prefixEnd++;
  }

  // Find common suffix
  while (
    suffixStart > prefixEnd &&
    suffixStart > 0 &&
    beforeWords[suffixStart - 1] === afterWords[suffixStart - 1]
  ) {
    suffixStart--;
  }

  const afterDiff = afterWords.slice(prefixEnd, suffixStart).join("");

  if (afterDiff.length > 50) {
    return (
      <span className="bg-green-100 text-green-900 px-1 rounded">
        {afterText}
      </span>
    );
  }

  const prefix = afterWords.slice(0, prefixEnd).join("");
  const suffix = afterWords.slice(suffixStart).join("");

  return (
    <span>
      {prefix && <span>{prefix}</span>}
      {afterDiff && (
        <span className="bg-green-200 text-green-900 px-1 rounded font-semibold">
          {afterDiff}
        </span>
      )}
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

/**
 * Highlight differences for the "Before" column - shows what's being removed
 */
export function highlightBefore(
  before: string | number | null | undefined,
  after: string | number | null | undefined
): React.ReactNode {
  const beforeText = before?.toString() || "";
  const afterText = after?.toString() || "";

  if (beforeText === afterText) {
    return <span>{beforeText || "(empty)"}</span>;
  }

  if (!beforeText) {
    return <span className="text-gray-400 italic">(empty)</span>;
  }

  if (!afterText) {
    return (
      <span className="bg-red-200 text-red-900 px-1 rounded line-through">
        {beforeText}
      </span>
    );
  }

  // Split into words
  const beforeWords = beforeText.split(/(\s+)/);
  const afterWords = afterText.split(/(\s+)/);

  let prefixEnd = 0;
  let suffixStart = Math.min(beforeWords.length, afterWords.length);

  // Find common prefix
  while (
    prefixEnd < beforeWords.length &&
    prefixEnd < afterWords.length &&
    beforeWords[prefixEnd] === afterWords[prefixEnd]
  ) {
    prefixEnd++;
  }

  // Find common suffix
  while (
    suffixStart > prefixEnd &&
    suffixStart > 0 &&
    beforeWords[suffixStart - 1] === afterWords[suffixStart - 1]
  ) {
    suffixStart--;
  }

  const beforeDiff = beforeWords.slice(prefixEnd, suffixStart).join("");

  if (beforeDiff.length > 50) {
    return (
      <span className="bg-red-100 text-red-900 px-1 rounded line-through">
        {beforeText}
      </span>
    );
  }

  const prefix = beforeWords.slice(0, prefixEnd).join("");
  const suffix = beforeWords.slice(suffixStart).join("");

  return (
    <span>
      {prefix && <span>{prefix}</span>}
      {beforeDiff && (
        <span className="bg-red-200 text-red-900 px-1 rounded line-through">
          {beforeDiff}
        </span>
      )}
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

