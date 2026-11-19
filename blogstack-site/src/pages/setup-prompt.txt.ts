import type { APIRoute } from "astro";
import { buildSetupPrompt } from "../lib/setup";
export const GET: APIRoute = () =>
  new Response(buildSetupPrompt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
