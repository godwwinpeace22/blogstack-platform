export type BlockContent = Record<string, unknown>[];

export interface EditorSaveEvent {
  blocks: BlockContent;
  html?: string;
}

export interface BlogStackEditorProps {
  /** Post ID (used for storage key) */
  postId: string;
  /** Project ID */
  projectId: string;
  /** Initial content as BlockNote JSON blocks */
  initialContent?: BlockContent;
  /** Called when the user saves (Ctrl+S) or after debounce */
  onSave?: (event: EditorSaveEvent) => void;
  /** Called on every content change */
  onChange?: (event: EditorSaveEvent) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  uploadFile?: (file: File) => Promise<string>;
  /** Additional class names */
  className?: string;
}
