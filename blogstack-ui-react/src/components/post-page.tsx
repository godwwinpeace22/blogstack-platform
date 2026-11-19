import * as React from "react";
import { cn } from "../lib/cn.js";
import { formatPostDate, safeHref, type BlogPost } from "../lib/blog-types.js";

export interface PostPageProps extends React.ComponentPropsWithoutRef<"article"> {
  post: BlogPost;
}
/** Pass sanitized rendered content as children. This component never injects raw HTML. */
export function PostPage({
  post,
  className,
  children,
  ...props
}: PostPageProps) {
  return (
    <article
      className={cn("mx-auto max-w-3xl space-y-8", className)}
      {...props}
    >
      <header className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="text-lg text-muted-foreground">{post.excerpt}</p>
        ) : null}
        <div className="flex gap-3 text-sm text-muted-foreground">
          {post.author?.name ? <span>{post.author.name}</span> : null}
          {post.publishedAt !== null ? (
            <time dateTime={new Date(post.publishedAt * 1000).toISOString()}>
              {formatPostDate(post.publishedAt)}
            </time>
          ) : null}
        </div>
      </header>
      {post.coverImage ? (
        <img
          src={safeHref(post.coverImage)}
          alt=""
          className="aspect-video w-full rounded-lg object-cover"
        />
      ) : null}
      <div className="space-y-4 leading-relaxed [&_a]:underline [&_h2]:text-2xl [&_h2]:font-semibold [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-4">
        {children}
      </div>
    </article>
  );
}
