import * as React from "react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
const quote = createReactBlockSpec(
  { type: "quote", propSchema: {}, content: "inline" },
  {
    render: (props) => (
      <blockquote style={{ borderLeft: "3px solid #bbb", paddingLeft: 16 }}>
        <div ref={props.contentRef} />
      </blockquote>
    ),
  },
);
const divider = createReactBlockSpec(
  { type: "divider", propSchema: {}, content: "none" },
  { render: () => <hr /> },
);
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    codeBlock: defaultBlockSpecs.codeBlock,
    image: defaultBlockSpecs.image,
    quote,
    divider,
  },
});
