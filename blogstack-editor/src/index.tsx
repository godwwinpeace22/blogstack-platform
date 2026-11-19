import * as React from "react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

import type { BlogStackEditorProps, EditorSaveEvent } from "./types.js";
import { useEditor } from "./hooks/useEditor.js";

export function BlogStackEditor({
  postId,
  projectId,
  initialContent,
  onSave,
  onChange,
  readOnly = false,
  className,
  uploadFile,
}: BlogStackEditorProps) {
  const editor = useEditor({
    postId,
    projectId,
    initialContent: initialContent ?? undefined,
    readOnly,
    ...(uploadFile ? { uploadFile } : {}),
  });

  const saveTimeoutRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  React.useEffect(
    () => () => {
      if (saveTimeoutRef.current !== undefined)
        clearTimeout(saveTimeoutRef.current);
    },
    [],
  );

  function handleChange() {
    const blocks = editor.document as EditorSaveEvent["blocks"];
    const event: EditorSaveEvent = { blocks };
    onChange?.(event);

    // Auto-save after 1.5 s of inactivity
    if (saveTimeoutRef.current !== undefined) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (!onSave) return;
    saveTimeoutRef.current = setTimeout(() => {
      onSave?.(event);
    }, 1500);
  }

  // Ctrl/Cmd+S to save immediately
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimeoutRef.current !== undefined) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = undefined;
        }
        const blocks = editor.document as EditorSaveEvent["blocks"];
        onSave?.({ blocks });
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor, onSave]);

  return (
    <BlockNoteView
      editor={editor}
      onChange={handleChange}
      editable={!readOnly}
      className={className}
      theme="light"
    />
  );
}

export type {
  BlogStackEditorProps,
  EditorSaveEvent,
  BlockContent,
} from "./types.js";
