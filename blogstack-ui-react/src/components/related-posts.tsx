import * as React from "react";
import { cn } from "../lib/cn.js";
import type { BlogPost } from "../lib/blog-types.js";
import { BlogList } from "./blog-list.js";

export interface RelatedPostsProps extends React.ComponentPropsWithoutRef<"section"> { posts: BlogPost[]; currentPostId?: string; heading?: string; limit?: number }
export function RelatedPosts({ posts, currentPostId, heading = "Related posts", limit = 3, className, ...props }: RelatedPostsProps) {
  const related = posts.filter(post => post.id !== currentPostId).slice(0, Math.max(0, limit));
  if (!related.length) return null;
  return <section className={cn("space-y-5", className)} {...props}><h2 className="text-2xl font-semibold">{heading}</h2><BlogList posts={related} /></section>;
}
