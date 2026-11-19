import * as React from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { schema } from "../schema.js";
import { editorContent } from "../content.js";
import type { BlockContent } from "../types.js";
export interface UseEditorOptions {
  postId: string;
  projectId: string;
  initialContent: BlockContent | undefined;
  readOnly?: boolean;
  uploadFile?: (file: File) => Promise<string>;
}
export function useEditor({
  initialContent,
  readOnly = false,
  uploadFile,
}: UseEditorOptions) {
  const editor = useCreateBlockNote({
    schema,
    domAttributes: {
      editor: {
        role: "textbox",
        "aria-label": "Article body",
        "aria-multiline": "true",
      },
    },
    ...(initialContent?.length
      ? { initialContent: editorContent(initialContent) as any }
      : {}),
    ...(uploadFile ? { uploadFile } : {}),
  });
  React.useEffect(() => {
    editor.isEditable = !readOnly;
  }, [editor, readOnly]);
  return editor;
}
