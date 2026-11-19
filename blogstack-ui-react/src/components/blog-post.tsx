"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import type { BlogPost as BlogPostData } from "../lib/blog-types.js";
import { createBlogClient, type BlogDataSource } from "../lib/blog-client.js";
import { PostPage } from "./post-page.js";
import { BlogContent } from "./blog-content.js";
import { AuthorCard } from "./author-card.js";
import {
  CommentsSlot,
  NewsletterSlot,
  BlogAttribution,
  useBlogBranding,
} from "./blog-attribution.js";
import { BlogAnalytics } from "./blog-analytics.js";
import { Button } from "./button.js";
import { Skeleton } from "./skeleton.js";

export interface BlogPostProps {
  projectSlug: string;
  slug: string;
  apiUrl?: string;
  backHref?: string;
  onBack?: () => void;
  className?: string;
  renderContent?: (html: string) => React.ReactNode;
  /** Article fetched by the host during SSR, SSG, or an edge render. */
  initialPost?: BlogPostData;
  dataSource?: BlogDataSource;
  commentsSlot?: React.ReactNode;
  newsletterSlot?: React.ReactNode;
  showAttribution?: boolean;
  analytics?: boolean;
  preview?: boolean;
}

/** A complete article page: fetch, sanitize, render, author details and recovery. */
export function BlogPost({
  projectSlug,
  slug,
  apiUrl = "https://blogstack-app.hidden-silence-2d18.workers.dev",
  backHref = "./",
  onBack,
  className,
  renderContent,
  initialPost,
  dataSource,
  commentsSlot,
  newsletterSlot,
  showAttribution,
  analytics = false,
  preview = false,
}: BlogPostProps) {
  const attribution = useBlogBranding(projectSlug, apiUrl, showAttribution);
  const seededPost = initialPost?.slug === slug ? initialPost : null;
  const [post, setPost] = React.useState<BlogPostData | null>(seededPost);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const articleRef = React.useRef<HTMLDivElement>(null);
  const client = React.useMemo(
    () => dataSource ?? createBlogClient({ projectSlug, apiUrl }),
    [dataSource, projectSlug, apiUrl],
  );
  React.useEffect(() => {
    if (seededPost && retry === 0) {
      setPost(seededPost);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setPost(null);
    setError(null);
    void client
      .getPost(slug, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setPost(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "This story could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [client, slug, retry, seededPost]);
  React.useEffect(() => {
    if (post) articleRef.current?.focus({ preventScroll: true });
  }, [post]);
  return (
    <section
      className={cn(
        "mx-auto max-w-5xl px-4 py-10 text-foreground sm:px-8 sm:py-20",
        className,
      )}
    >
      <a
        href={backHref}
        className="mb-12 inline-block rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          if (
            onBack &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            onBack();
          }
        }}
      >
        <span aria-hidden="true">← </span>All stories
      </a>
      {error ? (
        <div role="alert" className="space-y-5 rounded-2xl bg-muted p-8">
          <h1 className="font-serif text-3xl">{error}</h1>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {!post && !error ? (
        <div
          role="status"
          aria-label="Loading article"
          className="mx-auto max-w-3xl space-y-6"
        >
          <Skeleton className="h-16 w-4/5" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-80" />
        </div>
      ) : null}
      {post ? (
        <div ref={articleRef} tabIndex={-1} className="outline-none">
          {analytics ? (
            <BlogAnalytics
              projectSlug={projectSlug}
              postId={post.id}
              apiUrl={apiUrl}
              preview={preview}
            />
          ) : null}
          <PostPage
            post={post}
            className="[&_h1]:font-serif [&_h1]:font-normal [&_h1]:sm:text-6xl"
          >
            {renderContent ? (
              renderContent(post.renderedHtml ?? "")
            ) : (
              <BlogContent html={post.renderedHtml ?? ""} />
            )}
          </PostPage>
          {post.author ? (
            <AuthorCard
              author={post.author}
              className="mx-auto mt-16 max-w-3xl rounded-2xl border-0 bg-muted/50 p-8"
            />
          ) : null}
          <CommentsSlot>{commentsSlot}</CommentsSlot>
          <NewsletterSlot>{newsletterSlot}</NewsletterSlot>
          <BlogAttribution show={attribution} />
        </div>
      ) : null}
    </section>
  );
}
