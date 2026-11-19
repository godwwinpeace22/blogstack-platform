import * as React from "react";
import { createRoot } from "react-dom/client";
import { Blog } from "../src/components/blog.js";

function Preview() {
  const [layout, setLayout] = React.useState<"editorial" | "grid" | "list">("editorial");
  return <><div className="flex flex-wrap items-center justify-between gap-4 bg-foreground px-6 py-3 text-sm text-background"><span>BlogStack · Complete blog preview · Sample content</span><label className="flex items-center gap-3">Layout<select aria-label="Layout" value={layout} onChange={event => setLayout(event.target.value as typeof layout)} className="rounded bg-background px-3 py-1 text-foreground"><option value="editorial">Editorial</option><option value="grid">Grid</option><option value="list">List</option></select></label></div><Blog projectSlug="demo" apiUrl={window.location.origin} title="Field notes." description="Thoughtful ideas on making things for the web. Design, engineering, and the details in between." layout={layout} pageSize={3} footer={<footer className="mx-auto flex max-w-6xl justify-between px-8 py-12 text-sm text-muted-foreground"><span>Field notes</span><span>Made with BlogStack</span></footer>} /></>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
