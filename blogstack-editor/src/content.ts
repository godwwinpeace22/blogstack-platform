import type { BlockContent } from "./types.js";

/**
 * API and agent documents may omit optional text styles. BlockNote 0.19 needs a
 * concrete styles object, including inside links and nested blocks.
 * Copy on load so initialization never mutates the saved draft.
 */
export function editorContent(blocks: BlockContent): BlockContent {
  function inline(value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    return value.map((item: unknown) => {
      if (!item || typeof item !== "object") return item;
      const node = item as Record<string, unknown>;
      if (node.type === "text") return { ...node, styles: node.styles ?? {} };
      if (node.type === "link")
        return { ...node, content: inline(node.content) };
      return node;
    });
  }
  return blocks.map((block) => ({
    ...block,
    ...(Array.isArray(block.content) ? { content: inline(block.content) } : {}),
    ...(Array.isArray(block.children)
      ? { children: editorContent(block.children as BlockContent) }
      : {}),
  }));
}
