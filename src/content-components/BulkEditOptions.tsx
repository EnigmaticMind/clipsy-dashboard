import { useState } from "react";
import type { FieldType } from "../utils/fieldDetection";
import type { BulkEditOperation } from "../services/bulkEditService";
import { createCSVFile } from "../services/bulkEditService";
import { logger } from "../utils/logger";

interface BulkEditOptionsProps {
  fieldType: FieldType;
  fieldName: string;
  currentValue?: string;
  onGeneratePreview: (csvFile: File) => void;
}

export default function BulkEditOptions({
  fieldType,
  fieldName,
  onGeneratePreview,
}: BulkEditOptionsProps) {
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get available operations for this field type
  const getAvailableOperations = (): Array<{
    id: string;
    label: string;
    description: string;
    parameterFields: Array<{
      name: string;
      label: string;
      type: 'text' | 'number' | 'textarea';
      placeholder?: string;
    }>;
  }> => {
    switch (fieldType) {
      case 'title':
        return [
          {
            id: 'add_prefix',
            label: 'Add Prefix',
            description: 'Add text to the beginning of all titles',
            parameterFields: [
              { name: 'prefix', label: 'Prefix Text', type: 'text', placeholder: 'e.g., "Handmade" or "Vintage"' },
            ],
          },
          {
            id: 'add_suffix',
            label: 'Add Suffix',
            description: 'Add text to the end of all titles',
            parameterFields: [
              { name: 'suffix', label: 'Suffix Text', type: 'text', placeholder: 'e.g., " - Limited Edition"' },
            ],
          },
          {
            id: 'replace_text',
            label: 'Find & Replace',
            description: 'Replace specific text in all titles',
            parameterFields: [
              { name: 'find', label: 'Find', type: 'text', placeholder: 'Text to find' },
              { name: 'replace', label: 'Replace With', type: 'text', placeholder: 'Replacement text' },
            ],
          },
          {
            id: 'capitalize',
            label: 'Capitalize Words',
            description: 'Capitalize the first letter of each word',
            parameterFields: [],
          },
        ];

      case 'description':
        return [
          {
            id: 'add_prefix',
            label: 'Add to Beginning',
            description: 'Add text to the beginning of all descriptions',
            parameterFields: [
              { name: 'prefix', label: 'Text to Add', type: 'textarea', placeholder: 'Enter text to add at the beginning...' },
            ],
          },
          {
            id: 'add_suffix',
            label: 'Add to End',
            description: 'Add text to the end of all descriptions',
            parameterFields: [
              { name: 'suffix', label: 'Text to Add', type: 'textarea', placeholder: 'Enter text to add at the end...' },
            ],
          },
          {
            id: 'replace_text',
            label: 'Find & Replace',
            description: 'Replace specific text in all descriptions',
            parameterFields: [
              { name: 'find', label: 'Find', type: 'textarea', placeholder: 'Text to find' },
              { name: 'replace', label: 'Replace With', type: 'textarea', placeholder: 'Replacement text' },
            ],
          },
        ];

      case 'tags':
        return [
          {
            id: 'add_tags',
            label: 'Add Tags',
            description: 'Add new tags to all listings (comma-separated)',
            parameterFields: [
              { name: 'tags', label: 'Tags to Add', type: 'text', placeholder: 'tag1, tag2, tag3 (max 13 total)' },
            ],
          },
          {
            id: 'remove_tags',
            label: 'Remove Tags',
            description: 'Remove specific tags from all listings',
            parameterFields: [
              { name: 'tags', label: 'Tags to Remove', type: 'text', placeholder: 'tag1, tag2' },
            ],
          },
          {
            id: 'replace_tags',
            label: 'Replace All Tags',
            description: 'Replace all tags with new ones',
            parameterFields: [
              { name: 'tags', label: 'New Tags', type: 'text', placeholder: 'tag1, tag2, tag3 (max 13)' },
            ],
          },
        ];

      case 'price':
        return [
          {
            id: 'increase_percent',
            label: 'Increase by %',
            description: 'Increase all prices by a percentage',
            parameterFields: [
              { name: 'percent', label: 'Percentage', type: 'number', placeholder: 'e.g., 10 for 10%' },
            ],
          },
          {
            id: 'decrease_percent',
            label: 'Decrease by %',
            description: 'Decrease all prices by a percentage',
            parameterFields: [
              { name: 'percent', label: 'Percentage', type: 'number', placeholder: 'e.g., 10 for 10%' },
            ],
          },
          {
            id: 'set_price',
            label: 'Set to Price',
            description: 'Set all prices to a specific amount',
            parameterFields: [
              { name: 'price', label: 'Price', type: 'number', placeholder: 'e.g., 19.99' },
            ],
          },
          {
            id: 'round_to_nearest',
            label: 'Round to Nearest',
            description: 'Round all prices to nearest value',
            parameterFields: [
              { name: 'nearest', label: 'Round To', type: 'number', placeholder: 'e.g., 0.50 or 5.00' },
            ],
          },
        ];

      case 'quantity':
        return [
          {
            id: 'set_quantity',
            label: 'Set Quantity',
            description: 'Set all quantities to a specific number',
            parameterFields: [
              { name: 'quantity', label: 'Quantity', type: 'number', placeholder: 'e.g., 10' },
            ],
          },
          {
            id: 'increase_by',
            label: 'Increase by Amount',
            description: 'Increase all quantities by a specific amount',
            parameterFields: [
              { name: 'amount', label: 'Amount', type: 'number', placeholder: 'e.g., 5' },
            ],
          },
          {
            id: 'decrease_by',
            label: 'Decrease by Amount',
            description: 'Decrease all quantities by a specific amount',
            parameterFields: [
              { name: 'amount', label: 'Amount', type: 'number', placeholder: 'e.g., 2' },
            ],
          },
        ];

      case 'status':
        return [
          {
            id: 'set_status',
            label: 'Set Status',
            description: 'Set all listings to a specific status',
            parameterFields: [
              { name: 'status', label: 'Status', type: 'text', placeholder: 'active, draft, or inactive' },
            ],
          },
        ];

      default:
        return [];
    }
  };

  const operations = getAvailableOperations();

  const handleOperationSelect = (operationId: string) => {
    setSelectedOperation(operationId);
    setParameters({});
    setError(null);
  };

  const handleParameterChange = (name: string, value: string) => {
    setParameters(prev => ({ ...prev, [name]: value }));
  };

  const handleGeneratePreview = async () => {
    if (!selectedOperation) return;

    const operation = operations.find(op => op.id === selectedOperation);
    if (!operation) return;

    // Validate required parameters
    for (const field of operation.parameterFields) {
      if (!parameters[field.name] || parameters[field.name].trim() === '') {
        setError(`Please fill in: ${field.label}`);
        return;
      }
    }

    setIsGenerating(true);
    setError(null);

    try {
      const bulkEditOperation: BulkEditOperation = {
        fieldType,
        operation: selectedOperation,
        parameters: {
          ...parameters,
          // Convert number fields
          ...(operation.parameterFields.some(f => f.type === 'number') && {
            ...Object.fromEntries(
              operation.parameterFields
                .filter(f => f.type === 'number')
                .map(f => [f.name, parameters[f.name] ? Number(parameters[f.name]) : undefined])
            ),
          }),
        },
      };

      // Send message to background script to generate CSV (avoids CORS issues)
      const response = await chrome.runtime.sendMessage({
        action: 'generateBulkEditCSV',
        bulkEditOperation,
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to generate bulk edit CSV');
      }

      if (!response.csvContent) {
        throw new Error('No CSV content returned from background script');
      }

      const csvFile = createCSVFile(response.csvContent, `bulk-edit-${fieldType}-${Date.now()}.csv`);
      onGeneratePreview(csvFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
      logger.error('Bulk edit error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (operations.length === 0) {
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
        Bulk editing not available for this field type
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "16px",
        background: "#fff",
        borderRadius: "8px",
        border: "1px solid #e5e5e5",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#222",
          marginBottom: "12px",
        }}
      >
        Bulk Edit: {fieldName}
      </div>

      <div style={{ marginBottom: "16px" }}>
        <div
          style={{
            fontSize: "12px",
            color: "#666",
            marginBottom: "8px",
          }}
        >
          Select an operation:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {operations.map((op) => (
            <label
              key={op.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "8px",
                borderRadius: "4px",
                cursor: "pointer",
                background: selectedOperation === op.id ? "#f0f7ff" : "transparent",
                border: selectedOperation === op.id ? "1px solid #0066cc" : "1px solid transparent",
              }}
            >
              <input
                type="radio"
                name="bulk-operation"
                value={op.id}
                checked={selectedOperation === op.id}
                onChange={() => handleOperationSelect(op.id)}
                style={{ marginTop: "2px" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#222" }}>
                  {op.label}
                </div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                  {op.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {selectedOperation && (
        <div style={{ marginBottom: "16px" }}>
          {operations
            .find((op) => op.id === selectedOperation)
            ?.parameterFields.map((field) => (
              <div key={field.name} style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#333",
                    marginBottom: "4px",
                  }}
                >
                  {field.label}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={parameters[field.name] || ''}
                    onChange={(e) => handleParameterChange(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    style={{
                      width: "100%",
                      minHeight: "60px",
                      padding: "8px",
                      fontSize: "13px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                ) : (
                  <input
                    type={field.type}
                    value={parameters[field.name] || ''}
                    onChange={(e) => handleParameterChange(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "13px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                    }}
                  />
                )}
              </div>
            ))}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fee",
            border: "1px solid #fcc",
            borderRadius: "4px",
            color: "#c00",
            fontSize: "12px",
            marginBottom: "12px",
          }}
        >
          {error}
        </div>
      )}

      {selectedOperation && (
        <button
          onClick={handleGeneratePreview}
          disabled={isGenerating}
          style={{
            width: "100%",
            padding: "10px",
            background: isGenerating ? "#ccc" : "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: isGenerating ? "not-allowed" : "pointer",
          }}
        >
          {isGenerating ? "Generating Preview..." : "Generate Preview"}
        </button>
      )}
    </div>
  );
}

