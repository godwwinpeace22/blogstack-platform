import type { APIRoute } from "astro";
import { DOCS_URL, STARTER_URL, SOURCE_URL } from "../lib/site";
export const GET: APIRoute = () =>
  new Response(
    [
      "# BlogStack",
      "> Native blog pages, a hosted publishing workspace, SEO, link analytics and reviewable AI for personal, company and client publications.",
      "",
      "## Integration",
      "- Quickstart: " + DOCS_URL + "/docs/quickstart",
      "- AI setup guide: " + DOCS_URL + "/docs/ai-setup",
      "- Full platform self-hosting: " + DOCS_URL + "/docs/self-hosting",
      "- Complete MIT source: " + SOURCE_URL,
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
      "The complete MIT platform can run in the operator's own Cloudflare account. It needs the operator's own provider resources and email configuration, without a BlogStack Cloud subscription or Polar setup.",
      "The blog frontend also runs on Node.js. A Docker/VPS backend runtime is not included.",
      "Preserve existing routes, configuration and SEO. Obtain the website owner's approval before deploying or changing external services.",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
