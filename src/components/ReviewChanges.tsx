import { useState } from "react";
import type React from "react";
import LoadingSpinner from "./LoadingSpinner";
import { highlightBefore, highlightAfter } from "../utils/textDiff";

// Export types for use in other components
export interface FieldChange {
  field: string;
  before: string | number | null;
  after: string | number | null;
  changeType: "modified" | "added" | "removed";
}

export interface VariationChange {
  changeId: string;
  variationId: string;
  changeType: "create" | "update" | "delete";
  fieldChanges: FieldChange[];
}

export interface PreviewChange {
  changeId: string;
  changeType: "create" | "update" | "delete";
  listingId: number;
  title: string;
  fieldChanges?: FieldChange[];
  variationChanges?: VariationChange[];
}

export interface PreviewResponse {
  changes: PreviewChange[];
  summary: {
    totalChanges: number;
    creates: number;
    updates: number;
    deletes: number;
  };
}

interface ReviewChangesProps {
  preview: PreviewResponse;
  file: File;
  onClose: () => void;
  onApply: (acceptedChangeIds: string[], createBackup: boolean) => void;
  isApplying: boolean;
}

export default function ReviewChanges({
  preview,
  file,
  onClose,
  onApply,
  isApplying,
}: ReviewChangesProps) {
  // Ensure preview data is valid
  const safePreview = preview || {
    changes: [],
    summary: { totalChanges: 0, creates: 0, updates: 0, deletes: 0 },
  };

  const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(
    new Set((safePreview.changes || []).map((c) => c.changeId))
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "create" | "update" | "delete"
  >("all");
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(
    new Set()
  );

  // Determine if we're in production (checked by default) or dev build (unchecked by default)
  // Production build: backups ON by default
  // Dev build (build:dev) or dev server: backups OFF by default
  const isProduction = import.meta.env.MODE !== "development";
  const [createBackup, setCreateBackup] = useState(isProduction);

  // Filter changes based on search and filter type
  const filteredChanges = (safePreview.changes || []).filter((change) => {
    // Filter by type
    if (filterType !== "all" && change.changeType !== filterType) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const titleMatch = change.title?.toLowerCase().includes(query);
      const idMatch = change.listingId?.toString().includes(query);
      return titleMatch || idMatch;
    }

    return true;
  });

  // Group changes by type
  const groupedChanges = {
    create: filteredChanges.filter((c) => c.changeType === "create"),
    update: filteredChanges.filter((c) => c.changeType === "update"),
    delete: filteredChanges.filter((c) => c.changeType === "delete"),
  };

  const toggleChange = (changeId: string) => {
    const newAccepted = new Set(acceptedChanges);
    if (newAccepted.has(changeId)) {
      newAccepted.delete(changeId);
    } else {
      newAccepted.add(changeId);
    }
    setAcceptedChanges(newAccepted);
  };

  const acceptAll = () => {
    setAcceptedChanges(
      new Set((safePreview.changes || []).map((c) => c.changeId))
    );
  };

  const declineAll = () => {
    setAcceptedChanges(new Set());
  };

  // Bulk actions by type
  const acceptAllByType = (type: "create" | "update" | "delete") => {
    const newAccepted = new Set(acceptedChanges);
    groupedChanges[type].forEach((change) => {
      newAccepted.add(change.changeId);
    });
    setAcceptedChanges(newAccepted);
  };

  const declineAllByType = (type: "create" | "update" | "delete") => {
    const newAccepted = new Set(acceptedChanges);
    groupedChanges[type].forEach((change) => {
      newAccepted.delete(change.changeId);
    });
    setAcceptedChanges(newAccepted);
  };

  // Toggle expand/collapse for change details
  const toggleExpand = (changeId: string) => {
    const newExpanded = new Set(expandedChanges);
    if (newExpanded.has(changeId)) {
      newExpanded.delete(changeId);
    } else {
      newExpanded.add(changeId);
    }
    setExpandedChanges(newExpanded);
  };

  const handleApply = () => {
    onApply(Array.from(acceptedChanges), createBackup);
  };

  const getChangeTypeBadge = (type: string) => {
    const colors = {
      create: "bg-green-100 text-green-800",
      update: "bg-blue-100 text-blue-800",
      delete: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-semibold ${
          colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800"
        }`}
      >
        {type.toUpperCase()}
      </span>
    );
  };

  const formatValue = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "(empty)";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header Section */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Review Changes
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                File: {file.name} • {safePreview.summary?.totalChanges || 0}{" "}
                change
                {(safePreview.summary?.totalChanges || 0) !== 1 ? "s" : ""}{" "}
                found
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
              disabled={isApplying}
            >
              <svg
                className="w-6 h-6"
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

          {/* Summary */}
          <div className="mt-4 flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Summary:</span>
              {(safePreview.summary?.creates || 0) > 0 && (
                <span className="text-green-600">
                  {safePreview.summary.creates} create
                  {safePreview.summary.creates !== 1 ? "s" : ""}
                </span>
              )}
              {(safePreview.summary?.updates || 0) > 0 && (
                <span className="text-blue-600">
                  {safePreview.summary.updates} update
                  {safePreview.summary.updates !== 1 ? "s" : ""}
                </span>
              )}
              {(safePreview.summary?.deletes || 0) > 0 && (
                <span className="text-red-600">
                  {safePreview.summary.deletes} delete
                  {safePreview.summary.deletes !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Backup Notice */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2 text-sm text-blue-800">
              <svg
                className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    id="create-backup-checkbox"
                    checked={createBackup}
                    onChange={(e) => setCreateBackup(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    disabled={isApplying}
                  />
                  <label
                    htmlFor="create-backup-checkbox"
                    className="font-semibold cursor-pointer"
                  >
                    Create Backup CSV
                  </label>
                </div>
                <p className="ml-6">
                  A CSV backup of all listings that will be changed will be
                  created and downloaded before any changes are applied. This
                  ensures you have a copy of your original data just in case you
                  need to restore anything.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={acceptAll}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition"
              disabled={isApplying}
            >
              Accept All
            </button>
            <button
              onClick={declineAll}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition"
              disabled={isApplying}
            >
              Decline All
            </button>
            <div className="flex-1" />
            <button
              onClick={handleApply}
              disabled={isApplying || acceptedChanges.size === 0}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition"
            >
              {isApplying
                ? "Applying..."
                : `Apply ${acceptedChanges.size} Change${
                    acceptedChanges.size !== 1 ? "s" : ""
                  }`}
            </button>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="px-6 pt-4 pb-2 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-4 items-center">
            {/* Search Input */}
            <div className="flex-1 relative">
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search by title or listing ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            {/* Filter Buttons */}
            <div className="flex gap-2">
              {(["all", "create", "update", "delete"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    filterType === type
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                  }`}
                  type="button"
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                  {type !== "all" && (
                    <span className="ml-1 opacity-75">
                      ({groupedChanges[type].length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Changes List */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {isApplying ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner message="Applying changes..." />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Grouped View */}
              {/* Creates Section */}
              {groupedChanges.create.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Creates ({groupedChanges.create.length})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptAllByType("create")}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        Accept All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => declineAllByType("create")}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Decline All
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {groupedChanges.create.map((change) => (
                      <ChangeItem
                        key={change.changeId}
                        change={change}
                        acceptedChanges={acceptedChanges}
                        expandedChanges={expandedChanges}
                        onToggleChange={toggleChange}
                        onToggleExpand={toggleExpand}
                        getChangeTypeBadge={getChangeTypeBadge}
                        formatValue={formatValue}
                        highlightBefore={highlightBefore}
                        highlightAfter={highlightAfter}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Updates Section */}
              {groupedChanges.update.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      Updates ({groupedChanges.update.length})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptAllByType("update")}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        Accept All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => declineAllByType("update")}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Decline All
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {groupedChanges.update.map((change) => (
                      <ChangeItem
                        key={change.changeId}
                        change={change}
                        acceptedChanges={acceptedChanges}
                        expandedChanges={expandedChanges}
                        onToggleChange={toggleChange}
                        onToggleExpand={toggleExpand}
                        getChangeTypeBadge={getChangeTypeBadge}
                        formatValue={formatValue}
                        highlightBefore={highlightBefore}
                        highlightAfter={highlightAfter}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Deletes Section */}
              {groupedChanges.delete.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      Deletes ({groupedChanges.delete.length})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptAllByType("delete")}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        Accept All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => declineAllByType("delete")}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Decline All
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {groupedChanges.delete.map((change) => (
                      <ChangeItem
                        key={change.changeId}
                        change={change}
                        acceptedChanges={acceptedChanges}
                        expandedChanges={expandedChanges}
                        onToggleChange={toggleChange}
                        onToggleExpand={toggleExpand}
                        getChangeTypeBadge={getChangeTypeBadge}
                        formatValue={formatValue}
                        highlightBefore={highlightBefore}
                        highlightAfter={highlightAfter}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No results message */}
              {filteredChanges.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchQuery || filterType !== "all"
                    ? "No changes match your search or filter criteria."
                    : "No changes detected in the uploaded file."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Separate component for individual change items with collapsible details
interface ChangeItemProps {
  change: PreviewChange;
  acceptedChanges: Set<string>;
  expandedChanges: Set<string>;
  onToggleChange: (changeId: string) => void;
  onToggleExpand: (changeId: string) => void;
  getChangeTypeBadge: (type: string) => JSX.Element;
  formatValue: (value: string | number | null | undefined) => string;
  highlightBefore: (
    before: string | number | null,
    after: string | number | null
  ) => React.ReactNode;
  highlightAfter: (
    before: string | number | null,
    after: string | number | null
  ) => React.ReactNode;
}

function ChangeItem({
  change,
  acceptedChanges,
  expandedChanges,
  onToggleChange,
  onToggleExpand,
  getChangeTypeBadge,
  formatValue,
  highlightBefore,
  highlightAfter,
}: ChangeItemProps) {
  const isExpanded = expandedChanges.has(change.changeId);
  const hasDetails =
    (change.fieldChanges && change.fieldChanges.length > 0) ||
    (change.variationChanges && change.variationChanges.length > 0);

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <input
              type="checkbox"
              checked={acceptedChanges.has(change.changeId)}
              onChange={() => onToggleChange(change.changeId)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <h3 className="text-lg font-semibold text-gray-900">
              {change.title || `Listing ${change.listingId || "New"}`}
            </h3>
            {getChangeTypeBadge(change.changeType)}
          </div>
          {change.listingId > 0 && (
            <p className="text-sm text-gray-500 ml-8">
              Listing ID: {change.listingId}
            </p>
          )}
        </div>
        {hasDetails && (
          <button
            onClick={() => onToggleExpand(change.changeId)}
            className="ml-4 text-gray-500 hover:text-gray-700 transition"
            aria-label={isExpanded ? "Collapse details" : "Expand details"}
          >
            <svg
              className={`w-5 h-5 transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Collapsible Details */}
      {isExpanded && hasDetails && (
        <div className="mt-4 ml-8 space-y-4">
          {/* Field Changes */}
          {change.fieldChanges && change.fieldChanges.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Listing Changes:
              </h4>
              <div className="bg-gray-50 rounded-lg p-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">
                        Field
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">
                        Before
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">
                        After
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {change.fieldChanges.map((fc, idx) => {
                      const isTextField =
                        fc.field === "title" || fc.field === "description";
                      const beforeValue = formatValue(fc.before);
                      const afterValue = formatValue(fc.after);

                      return (
                        <tr
                          key={idx}
                          className="border-b border-gray-100 last:border-0"
                        >
                          <td className="py-2 px-3 font-medium text-gray-700 capitalize">
                            {fc.field.replace(/_/g, " ")}
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            {fc.changeType === "added" ? (
                              <span className="text-gray-400 italic">
                                (empty)
                              </span>
                            ) : isTextField ? (
                              highlightBefore(fc.before, fc.after)
                            ) : (
                              beforeValue
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {fc.changeType === "removed" ? (
                              <span className="text-red-600 line-through">
                                {afterValue}
                              </span>
                            ) : isTextField ? (
                              highlightAfter(fc.before, fc.after)
                            ) : (
                              <span className="text-green-600 font-semibold">
                                {afterValue}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Variation Changes */}
          {change.variationChanges && change.variationChanges.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Variation Changes:
              </h4>
              <div className="space-y-3">
                {change.variationChanges.map((varChange) => (
                  <div
                    key={varChange.changeId}
                    className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {getChangeTypeBadge(varChange.changeType)}
                      <span className="text-xs text-gray-500">
                        Variation ID: {varChange.variationId}
                      </span>
                    </div>
                    {varChange.fieldChanges &&
                      varChange.fieldChanges.length > 0 && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-1 px-2 font-semibold text-gray-700 text-xs">
                                Field
                              </th>
                              <th className="text-left py-1 px-2 font-semibold text-gray-700 text-xs">
                                Before
                              </th>
                              <th className="text-left py-1 px-2 font-semibold text-gray-700 text-xs">
                                After
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {varChange.fieldChanges.map((fc, idx) => {
                              const isTextField =
                                fc.field === "title" ||
                                fc.field === "description" ||
                                fc.field.includes("option");
                              const beforeValue = formatValue(fc.before);
                              const afterValue = formatValue(fc.after);

                              return (
                                <tr
                                  key={idx}
                                  className="border-b border-gray-100 last:border-0"
                                >
                                  <td className="py-1 px-2 font-medium text-gray-700 text-xs capitalize">
                                    {fc.field.replace(/_/g, " ")}
                                  </td>
                                  <td className="py-1 px-2 text-gray-600 text-xs">
                                    {fc.changeType === "added" ? (
                                      <span className="text-gray-400 italic">
                                        (empty)
                                      </span>
                                    ) : isTextField ? (
                                      highlightBefore(fc.before, fc.after)
                                    ) : (
                                      beforeValue
                                    )}
                                  </td>
                                  <td className="py-1 px-2 text-xs">
                                    {fc.changeType === "removed" ? (
                                      <span className="text-red-600 line-through">
                                        {afterValue}
                                      </span>
                                    ) : isTextField ? (
                                      highlightAfter(fc.before, fc.after)
                                    ) : (
                                      <span className="text-green-600 font-semibold">
                                        {afterValue}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
