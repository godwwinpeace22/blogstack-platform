import "server-only";
import { BlogStackClient } from "@blogstack/sdk";
export const projectSlug = process.env.BLOGSTACK_PROJECT_SLUG || "your-project";
export const apiUrl =
  process.env.BLOGSTACK_API_URL || "https://blogstack-app.hidden-silence-2d18.workers.dev";
export const siteUrl = (
  process.env.SITE_URL || "http://localhost:3003"
).replace(/\/+$/, "");
export const blogUrl = siteUrl + "/blog";
export const blog = new BlogStackClient({
  baseUrl: apiUrl,
  fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
});
export async function blogInfo() {
  const info = await blog.public.info(projectSlug);
  if (info.blogUrl?.replace(/\/+$/, "") !== blogUrl)
    throw new Error(
      "Set this project's Website blog URL in BlogStack to " + blogUrl,
    );
  return info;
}
