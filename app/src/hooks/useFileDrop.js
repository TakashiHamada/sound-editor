// Drag-and-drop file target: tracks whether files are being dragged over the element and hands
// dropped files to `onFilesDrop(files[])`. Spread `dropHandlers` onto the target element.
import { useCallback, useState } from 'react';

// `ignoreLeaveIntoChildren`: keep the highlight when the pointer moves onto a child element
// (dragleave fires on the parent then); without it every dragleave clears the highlight.
export function useFileDrop(onFilesDrop, { ignoreLeaveIntoChildren = false } = {}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);
  const onDragLeave = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (ignoreLeaveIntoChildren && event.currentTarget.contains(event.relatedTarget)) return;
      setIsDragOver(false);
    },
    [ignoreLeaveIntoChildren],
  );
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      const files = event.dataTransfer.files;
      if (files && files.length > 0 && onFilesDrop) onFilesDrop(Array.from(files));
    },
    [onFilesDrop],
  );
  return { isDragOver, dropHandlers: { onDragOver, onDragLeave, onDrop } };
}
