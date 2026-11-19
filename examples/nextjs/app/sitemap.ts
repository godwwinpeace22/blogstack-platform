import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/blog";
/** Your main sitemap remains independent of BlogStack's blog sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl }, { url: siteUrl + "/blog" }];
}
