import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/blog";
/** In an existing site, APPEND the blog sitemap to your current rules. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/preview/"] },
    sitemap: [siteUrl + "/sitemap.xml", siteUrl + "/blog/sitemap.xml"],
  };
}
