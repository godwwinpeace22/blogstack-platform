"use client";
import { BlogIndex } from "@blogstack/ui/components/blog-index";
import type { PublicPost, PublicTag } from "@blogstack/sdk";
export function BlogListing(props: {
  projectSlug: string;
  apiUrl: string;
  initialPosts: PublicPost[];
  initialTags: PublicTag[];
  initialNextCursor: string | null;
  showAttribution: boolean;
  title: string;
}) {
  return (
    <BlogIndex
      {...props}
      postHref={(post) => "/blog/" + encodeURIComponent(post.slug)}
    />
  );
}
