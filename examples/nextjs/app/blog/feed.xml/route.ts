import { BlogStackApiError } from "@blogstack/sdk";
import { blog, projectSlug } from "../../../lib/blog";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return new Response(await blog.public.feed(projectSlug), {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof BlogStackApiError)
      return new Response("Feed unavailable", {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    throw error;
  }
}
