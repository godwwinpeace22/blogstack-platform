import * as React from "react";
import { cn } from "../lib/cn.js";
import type { BlogPost } from "../lib/blog-types.js";
import { BlogCard, type BlogCardProps } from "./blog-card.js";
import { EmptyState } from "./empty-state.js";

export interface BlogListProps extends React.ComponentPropsWithoutRef<"div"> {
  posts: BlogPost[];
  layout?: "grid" | "list";
  emptyMessage?: string;
  renderPost?: (post: BlogPost) => React.ReactNode;
  cardVariant?: BlogCardProps["variant"];
}
export function BlogList({
  posts,
  layout = "grid",
  emptyMessage = "No posts found",
  renderPost,
  cardVariant = "default",
  className,
  ...props
}: BlogListProps) {
  if (!posts.length)
    return <EmptyState {...props} title={emptyMessage} className={className} />;
  return (
    <div
      className={cn(
        "grid gap-6",
        layout === "grid" && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      {...props}
    >
      {posts.map((post) => (
        <React.Fragment key={post.id}>
          {renderPost ? (
            renderPost(post)
          ) : (
            <BlogCard post={post} variant={cardVariant} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
