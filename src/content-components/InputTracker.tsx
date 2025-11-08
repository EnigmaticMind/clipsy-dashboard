import { useState, useEffect } from "react";
import { detectFieldType, type FieldInfo } from "../utils/fieldDetection";
import BulkEditOptions from "./BulkEditOptions";

interface InputTrackerProps {
  focusedInput: HTMLElement | null;
  inputValue: string;
  onGeneratePreview: (csvFile: File) => void;
}

export default function InputTracker({
  focusedInput,
  inputValue,
  onGeneratePreview,
}: InputTrackerProps) {
  const [inputInfo, setInputInfo] = useState<{
    tagName: string;
    type: string;
    name: string;
    id: string;
    className: string;
    value: string;
    placeholder: string;
  } | null>(null);
  const [fieldInfo, setFieldInfo] = useState<FieldInfo | null>(null);

  useEffect(() => {
    // This effect runs whenever focusedInput or inputValue changes
    // causing the component to re-render
    if (focusedInput) {
      const element = focusedInput as HTMLElement;
      const isInput = element.tagName === "INPUT";
      const isTextarea = element.tagName === "TEXTAREA";

      const info = {
        tagName: element.tagName,
        type: isInput
          ? (element as HTMLInputElement).type
          : isTextarea
          ? "textarea"
          : "contenteditable",
        name: (element as HTMLInputElement).name || "",
        id: element.id || "",
        className: element.className || "",
        value: inputValue,
        placeholder: (element as HTMLInputElement).placeholder || "",
      };

      setInputInfo(info);

      // Detect field type for bulk editing
      const detected = detectFieldType(element);
      setFieldInfo(detected);
    } else {
      setInputInfo(null);
      setFieldInfo(null);
    }
  }, [focusedInput, inputValue]);

  if (!inputInfo) {
    return (
      <div
        style={{
          padding: "16px",
          background: "#f9f9f9",
          borderRadius: "8px",
          border: "1px dashed #ddd",
          textAlign: "center",
          color: "#999",
          fontSize: "14px",
        }}
      >
        Click on any input field to see details
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "16px",
        background: "#f0f7ff",
        borderRadius: "8px",
        border: "1px solid #b3d9ff",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "#0066cc",
          marginBottom: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Active Input Field
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>
            Current Value
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#222",
              background: "white",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ddd",
              maxHeight: "100px",
              overflow: "auto",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {inputInfo.value || (
              <span style={{ color: "#999", fontStyle: "italic" }}>
                (empty)
              </span>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>
            Character Count
          </div>
          <div style={{ fontSize: "14px", fontWeight: 500, color: "#222" }}>
            {inputInfo.value.length} characters
          </div>
        </div>
      </div>

      {/* Bulk Edit Options */}
      {fieldInfo && fieldInfo.type !== "unknown" && (
        <div
          style={{
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid #e5e5e5",
          }}
        >
          <BulkEditOptions
            fieldType={fieldInfo.type}
            fieldName={fieldInfo.fieldName}
            currentValue={fieldInfo.currentValue}
            onGeneratePreview={onGeneratePreview}
          />
        </div>
      )}
    </div>
  );
}
