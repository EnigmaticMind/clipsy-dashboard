import ReviewChanges, { type PreviewResponse } from "./ReviewChanges";

interface UploadPreviewProps {
  preview: PreviewResponse;
  file: File;
  onClose: () => void;
  onApply: (acceptedChangeIds: string[], createBackup: boolean) => void;
  isApplying: boolean;
}

// Wrapper component for backward compatibility
// ReviewChanges is now always a modal
export default function UploadPreview({
  preview,
  file,
  onClose,
  onApply,
  isApplying,
}: UploadPreviewProps) {
  return (
    <ReviewChanges
      preview={preview}
      file={file}
      onClose={onClose}
      onApply={onApply}
      isApplying={isApplying}
    />
  );
}
