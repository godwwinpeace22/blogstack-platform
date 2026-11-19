"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import type { BlogPost, BlogTag } from "../lib/blog-types.js";
import { createBlogClient, type BlogDataSource } from "../lib/blog-client.js";
import { BlogCard, type BlogCardProps } from "./blog-card.js";
import { SearchBar } from "./search-bar.js";
import { TagFilter } from "./tag-filter.js";
import { Button } from "./button.js";
import { EmptyState } from "./empty-state.js";
import { BlogAttribution, useBlogBranding } from "./blog-attribution.js";
import { Skeleton } from "./skeleton.js";

export interface BlogIndexProps {
  projectSlug: string;
  apiUrl?: string;
  title?: string;
  description?: string;
  layout?: "editorial" | "grid" | "list";
  pageSize?: number;
  showSearch?: boolean;
  showTags?: boolean;
  className?: string;
  postHref?: (post: BlogPost) => string;
  onOpenPost?: (slug: string) => void;
  renderCard?: (props: BlogCardProps) => React.ReactNode;
  /** Content fetched by the host during SSR, SSG, or an edge render. */
  initialPosts?: BlogPost[];
  initialTags?: BlogTag[];
  initialNextCursor?: string | null;
  /** Replace the default Fetch API client without coupling the UI to an SDK. */
  dataSource?: BlogDataSource;
  showAttribution?: boolean;
}

export function BlogIndex({
  projectSlug,
  apiUrl = "https://blogstack-app.hidden-silence-2d18.workers.dev",
  title = "The journal",
  description,
  layout = "editorial",
  pageSize = 9,
  showSearch = true,
  showTags = true,
  className,
  postHref,
  onOpenPost,
  renderCard,
  initialPosts,
  initialTags,
  initialNextCursor = null,
  dataSource,
  showAttribution,
}: BlogIndexProps) {
  const attribution = useBlogBranding(projectSlug, apiUrl, showAttribution);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [posts, setPosts] = React.useState<BlogPost[]>(initialPosts ?? []);
  const [tags, setTags] = React.useState<BlogTag[]>(initialTags ?? []);
  const [nextCursor, setNextCursor] = React.useState<string | null>(
    initialNextCursor,
  );
  const [loading, setLoading] = React.useState(initialPosts === undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [hasInteracted, setHasInteracted] = React.useState(false);
  const limit = Number.isFinite(pageSize)
    ? Math.max(1, Math.min(100, Math.floor(pageSize)))
    : 9;
  const client = React.useMemo(
    () => dataSource ?? createBlogClient({ projectSlug, apiUrl }),
    [dataSource, projectSlug, apiUrl],
  );

  const identity = React.useRef(projectSlug + "|" + apiUrl);
  React.useEffect(() => {
    const next = projectSlug + "|" + apiUrl;
    if (identity.current === next) return;
    identity.current = next;
    setHasInteracted(false);
    setSearch("");
    setQuery("");
    setTag(null);
    setCursor(null);
    setError(null);
  }, [projectSlug, apiUrl]);
  React.useEffect(() => {
    if (initialPosts === undefined || hasInteracted) return;
    setPosts(initialPosts);
    setNextCursor(initialNextCursor);
    setLoading(false);
  }, [initialPosts, initialNextCursor, hasInteracted]);
  React.useEffect(() => {
    if (initialTags !== undefined) setTags(initialTags);
  }, [initialTags]);

  React.useEffect(() => {
    if (initialPosts !== undefined && !hasInteracted) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (!cursor) setPosts([]);
    void client
      .listPosts({ limit, query, tag, cursor, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setPosts((previous) =>
          cursor
            ? [
                ...new Map(
                  [...previous, ...page.data].map((post) => [post.id, post]),
                ).values(),
              ]
            : page.data,
        );
        setNextCursor(page.nextCursor ?? null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Posts could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, query, tag, cursor, limit, retry, initialPosts, hasInteracted]);

  React.useEffect(() => {
    if (!showTags) return;
    if (initialTags !== undefined) return;
    const controller = new AbortController();
    setTags([]);
    void client
      .listTags({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setTags(result);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [client, showTags, initialTags]);

  function card(post: BlogPost, featured = false) {
    const props: BlogCardProps = {
      post,
      href: postHref?.(post) ?? `/posts/${encodeURIComponent(post.slug)}`,
      variant: featured
        ? "featured"
        : layout === "list"
          ? "compact"
          : "default",
      className: cn(
        "rounded-none border-0 bg-transparent [&>div]:px-0 [&_h2]:font-serif [&_h2]:font-normal",
        featured && "[&_h2]:text-4xl [&_h2]:sm:text-5xl",
        layout === "list" && "py-5",
      ),
      onClick: (event) => {
        if (
          !onOpenPost ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        if ((event.target as HTMLElement).closest("a")) {
          event.preventDefault();
          onOpenPost(post.slug);
        }
      },
    };
    return renderCard ? renderCard(props) : <BlogCard {...props} />;
  }
  const featured =
    layout === "editorial" && !query && !tag ? posts[0] : undefined;
  const rest = featured ? posts.slice(1) : posts;
  return (
    <section
      className={cn(
        "mx-auto max-w-6xl px-4 py-12 text-foreground sm:px-8 sm:py-24",
        className,
      )}
      aria-label={title}
    >
      <header className="mb-12 space-y-6 sm:mb-20">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Stories & perspectives
        </p>
        <div className="grid items-end gap-8 md:grid-cols-[1.3fr_1fr]">
          <h1 className="font-serif text-5xl tracking-tight sm:text-7xl lg:text-8xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </header>
      <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        {showTags && tags.length ? (
          <TagFilter
            tags={tags}
            value={tag}
            onValueChange={(value) => {
              setHasInteracted(true);
              setTag(value);
              setCursor(null);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {query ? `Results for “${query}”` : "Latest stories"}
          </p>
        )}
        {showSearch ? (
          <SearchBar
            className="w-full sm:max-w-sm"
            value={search}
            onValueChange={setSearch}
            onSearch={(value) => {
              setHasInteracted(true);
              setQuery(value);
              setCursor(null);
            }}
          />
        ) : null}
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-8 flex flex-wrap items-center gap-4 rounded-xl bg-muted p-5"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {loading && !posts.length ? (
        <div
          role="status"
          aria-label="Loading posts"
          className="grid gap-8 sm:grid-cols-2"
        >
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
          <span className="sr-only">Loading posts…</span>
        </div>
      ) : null}
      {!loading && !error && !posts.length ? (
        <EmptyState
          title={
            query || tag ? "No matching stories" : "Your next story starts here"
          }
          description={
            query || tag
              ? "Try another search or explore all stories."
              : "Published posts will appear here."
          }
          action={
            query || tag ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setHasInteracted(true);
                  setSearch("");
                  setQuery("");
                  setTag(null);
                  setCursor(null);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {featured ? (
        <div className="mb-16 grid gap-6 rounded-[2rem] bg-muted/40 p-2 sm:mb-24 sm:p-4">
          <div className="rounded-[1.5rem] bg-background p-5 sm:p-10">
            <p className="mb-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Featured story
            </p>
            {card(featured, true)}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "grid gap-x-12 gap-y-10",
          layout === "list" ? "max-w-3xl" : "sm:grid-cols-2",
        )}
      >
        {rest.map((post) => (
          <React.Fragment key={post.id}>{card(post)}</React.Fragment>
        ))}
      </div>
      {nextCursor && !error ? (
        <div className="mt-14 flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="rounded-full px-8"
            disabled={loading}
            onClick={() => {
              setHasInteracted(true);
              setCursor(nextCursor);
            }}
          >
            {loading ? "Loading…" : "More stories"}
          </Button>
        </div>
      ) : null}
      <BlogAttribution show={attribution} />
    </section>
  );
}
