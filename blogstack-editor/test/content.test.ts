import { expect, test } from "vitest";
import { BlockNoteEditor } from "@blocknote/core";
import { schema } from "../src/schema.js";
import { editorContent } from "../src/content.js";

test("API text, code, links and nested blocks reopen in the actual editor without losing content", () => {
  const blocks = [
    {
      id: "opening",
      type: "paragraph",
      content: [{ type: "text", text: "A private draft" }],
    },
    {
      id: "code",
      type: "codeBlock",
      props: { language: "typescript" },
      content: [{ type: "text", text: 'const publication = "reviewed";' }],
    },
    {
      id: "list",
      type: "bulletListItem",
      content: [{ type: "text", text: "Parent", styles: { bold: true } }],
      children: [
        {
          id: "child",
          type: "paragraph",
          content: [
            {
              type: "link",
              href: "https://example.com/blog/related",
              content: [{ type: "text", text: "Related article" }],
            },
          ],
        },
      ],
    },
  ];
  const source = JSON.stringify(blocks);
  const editor = BlockNoteEditor.create({
    schema,
    initialContent: editorContent(blocks) as any,
  });
  expect(editor.document[0]!.content).toEqual([
    { type: "text", text: "A private draft", styles: {} },
  ]);
  expect(editor.document[1]!.content).toEqual([
    { type: "text", text: 'const publication = "reviewed";', styles: {} },
  ]);
  expect(editor.document[2]!.content).toEqual([
    { type: "text", text: "Parent", styles: { bold: true } },
  ]);
  expect(editor.document[2]!.children[0]!.content).toEqual([
    {
      type: "link",
      href: "https://example.com/blog/related",
      content: [{ type: "text", text: "Related article", styles: {} }],
    },
  ]);
  expect(JSON.stringify(blocks)).toBe(source);
  editor._tiptapEditor.destroy();
});
