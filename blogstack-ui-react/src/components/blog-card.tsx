import * as React from "react";
import { cn } from "../lib/cn.js";
import { formatPostDate, safeHref, type BlogPost } from "../lib/blog-types.js";

export interface BlogCardProps
  extends React.ComponentPropsWithoutRef<"article"> {
  post: BlogPost;
  variant?: "default" | "featured" | "compact" | "horizontal" | "minimal";
  href?: string;
  showAuthor?: boolean;
  showTags?: boolean;
  showExcerpt?: boolean;
  showReadTime?: boolean;
}
export function BlogCard({
  post,
  variant = "default",
  href,
  showAuthor = true,
  showTags = true,
  showExcerpt = true,
  showReadTime = true,
  className,
  ...props
}: BlogCardProps) {
  const minimal = variant === "minimal";
  const image = post.coverImage && !minimal && variant !== "compact";
  return (
    <article
      className={cn(
        "group overflow-hidden rounded-lg border bg-card text-card-foreground",
        variant === "horizontal" && "sm:grid sm:grid-cols-2",
        minimal && "border-0 bg-transparent",
        className,
      )}
      {...props}
    >
      {image ? (
        <img
          src={safeHref(post.coverImage!)}
          alt=""
          loading="lazy"
          className={cn(
            "aspect-video w-full object-cover",
            variant === "featured" && "aspect-[2/1]",
            variant === "horizontal" && "h-full",
          )}
        />
      ) : null}
      <div className={cn("space-y-3 p-5", minimal && "px-0")}>
        {showTags && !minimal && post.tags?.length ? (
          <ul aria-label="Tags" className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li
                key={tag.id}
                className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
              >
                {tag.name}
              </li>
            ))}
          </ul>
        ) : null}
        <h2
          className={cn(
            "text-xl font-semibold tracking-tight",
            variant === "featured" && "text-3xl",
          )}
        >
          <a
            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={safeHref(href ?? `/posts/${encodeURIComponent(post.slug)}`)}
          >
            {post.title}
          </a>
        </h2>
        {showExcerpt && !minimal && variant !== "compact" && post.excerpt ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {showAuthor && !minimal && post.author?.name ? (
            <span>{post.author.name}</span>
          ) : null}
          {post.publishedAt !== null ? (
            <time dateTime={new Date(post.publishedAt * 1000).toISOString()}>
              {formatPostDate(post.publishedAt)}
            </time>
          ) : null}
          {showReadTime && !minimal && post.readingMinutes ? (
            <span>{post.readingMinutes} min read</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
