import { sanitizeArticle } from "@blogstack/core";
import { validContent } from "./content.js";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { BundledLanguage, BundledTheme } from "shiki";
// Native RegExp avoids dynamic Wasm compilation, which Workers disallows.
let highlighter: ReturnType<typeof createHighlighterCore> | null = null;
async function getHighlighter() {
  if (!highlighter)
    highlighter = createHighlighterCore({
      engine: createJavaScriptRegexEngine({ forgiving: true }),
      themes: [
        import("shiki/themes/github-dark.mjs"),
        import("shiki/themes/github-light.mjs"),
      ],
      langs: [
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/jsx.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/php.mjs"),
        import("shiki/langs/go.mjs"),
        import("shiki/langs/rust.mjs"),
        import("shiki/langs/ruby.mjs"),
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/yaml.mjs"),
        import("shiki/langs/toml.mjs"),
        import("shiki/langs/sql.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/markdown.mjs"),
      ],
    }).catch((error) => {
      highlighter = null;
      throw error;
    });
  return highlighter;
}

// ─── BlockNote JSON → HTML ────────────────────────────────────────────────────

interface BlockNoteNode {
  type: string;
  id?: string;
  props?: Record<string, unknown>;
  content?: BlockNoteInline[] | BlockNoteNode[];
  children?: BlockNoteNode[];
}

interface BlockNoteInline {
  type: "text" | "link";
  text?: string;
  href?: string;
  styles?: Record<string, unknown>;
  content?: BlockNoteInline[];
}

/**
 * Renders BlockNote JSON to HTML, applying Shiki syntax highlighting to code
 * blocks. Does NOT depend on @blocknote/react (no DOM required).
 */
export async function renderBlockNote(json: string): Promise<string> {
  if (!validContent(json)) throw new Error("Invalid document");
  let blocks: BlockNoteNode[];
  try {
    blocks = JSON.parse(json) as BlockNoteNode[];
  } catch {
    return "<p></p>";
  }

  return sanitizeArticle(await renderBlocks(blocks));
}

async function renderBlock(block: BlockNoteNode): Promise<string> {
  switch (block.type) {
    case "paragraph":
      return `<p>${renderInlines(block.content as BlockNoteInline[])}</p>`;

    case "heading": {
      const rawLevel = block.props?.level;
      const level =
        typeof rawLevel === "number" && Number.isInteger(rawLevel)
          ? Math.max(1, Math.min(6, rawLevel))
          : 1;
      const text = renderInlines(block.content as BlockNoteInline[]);
      return `<h${level}>${text}</h${level}>`;
    }

    case "bulletListItem":
      return `<li>${renderInlines(block.content as BlockNoteInline[])}</li>`;

    case "numberedListItem": {
      const num = Number.isSafeInteger(block.props?.start)
        ? Number(block.props?.start)
        : 1;
      return `<li value="${num}">${renderInlines(block.content as BlockNoteInline[])}</li>`;
    }

    case "codeBlock": {
      const lang = (
        (block.props?.language as string | undefined) ?? "text"
      ).toLowerCase();
      const code = extractText(block.content as BlockNoteInline[]);
      try {
        const hl = await getHighlighter();
        return hl.codeToHtml(code, {
          lang: (["sh", "zsh"].includes(lang)
            ? "bash"
            : lang) as BundledLanguage,
          themes: {
            dark: "github-dark" as BundledTheme,
            light: "github-light" as BundledTheme,
          },
        });
      } catch {
        return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`;
      }
    }

    case "image": {
      const src = escapeHtml(safeUrl(block.props?.url));
      const alt = escapeHtml(
        (block.props?.caption as string | undefined) ?? "",
      );
      if (!src) return "";
      return `<figure><img src="${src}" alt="${alt}" loading="lazy" /></figure>`;
    }

    case "quote":
      return `<blockquote>${renderInlines(block.content as BlockNoteInline[])}</blockquote>`;

    case "divider":
      return "<hr />";

    default:
      // Render children recursively for unknown container blocks
      if (Array.isArray(block.children)) {
        const childHtml = await Promise.all(
          (block.children as BlockNoteNode[]).map((c) => renderBlock(c)),
        );
        return childHtml.join("\n");
      }
      return "";
  }
}

async function renderBlocks(blocks: BlockNoteNode[]): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type === "bulletListItem" || block.type === "numberedListItem") {
      const listType = block.type,
        tag = listType === "bulletListItem" ? "ul" : "ol";
      const items: string[] = [];
      while (i < blocks.length && blocks[i]!.type === listType) {
        const item = blocks[i]!;
        items.push(
          "<li>" +
            renderInlines(item.content as BlockNoteInline[]) +
            (await renderBlocks(item.children ?? [])) +
            "</li>",
        );
        i++;
      }
      i--;
      parts.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
    } else
      parts.push(
        (await renderBlock(block)) + (await renderBlocks(block.children ?? [])),
      );
  }
  return parts.join("\n");
}

function renderInlines(inlines?: BlockNoteInline[]): string {
  if (!Array.isArray(inlines)) return "";
  return inlines.map(renderInline).join("");
}

function renderInline(inline: BlockNoteInline): string {
  if (inline.type === "link") {
    const href = escapeHtml(safeUrl(inline.href));
    const text = renderInlines(inline.content);
    return `<a href="${href}">${text}</a>`;
  }

  // text node
  let html = escapeHtml(inline.text ?? "");
  const s = inline.styles ?? {};
  if (s["bold"]) html = `<strong>${html}</strong>`;
  if (s["italic"]) html = `<em>${html}</em>`;
  if (s["underline"]) html = `<u>${html}</u>`;
  if (s["strikethrough"]) html = `<s>${html}</s>`;
  if (s["code"]) html = `<code>${html}</code>`;
  return html;
}

function extractText(inlines?: BlockNoteInline[]): string {
  if (!Array.isArray(inlines)) return "";
  return inlines.map((i) => i.text ?? extractText(i.content)).join("");
}

function safeUrl(value: unknown): string {
  return typeof value === "string" &&
    /^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(value.trim())
    ? value.trim()
    : "";
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
