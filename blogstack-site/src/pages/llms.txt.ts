import type { APIRoute } from "astro";
import { DOCS_URL, STARTER_URL } from "../lib/site";
export const GET: APIRoute = () =>
  new Response(
    [
      "# BlogStack",
      "> Native blog pages, a hosted publishing workspace, SEO, link analytics and reviewable AI for personal, company and client publications.",
      "",
      "## Integration",
      "- Quickstart: " + DOCS_URL + "/docs/quickstart",
      "- AI setup guide: " + DOCS_URL + "/docs/ai-setup",
      "- Self-hosting the frontend: " + DOCS_URL + "/docs/self-hosting",
      "- Public SDK: " + DOCS_URL + "/docs/sdk",
      "- Editable components: " + DOCS_URL + "/docs/components",
      "- Next.js source starter: " + STARTER_URL,
      "",
      "## Publishing",
      "- SEO: " + DOCS_URL + "/docs/seo",
      "- Analytics and link health: " + DOCS_URL + "/docs/analytics",
      "- Publishing AI assistants: " + DOCS_URL + "/docs/agents",
      "",
      "## Important boundaries",
      "The complete reference integration uses Next.js App Router. The public client is framework independent.",
      "Public reads need a project slug, not a private management key.",
      "Self-hosting covers the customer website/frontend; the publishing API/dashboard remain hosted by BlogStack Cloud.",
      "Preserve existing routes, configuration and SEO. Obtain the website owner's approval before deploying or changing external services.",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
