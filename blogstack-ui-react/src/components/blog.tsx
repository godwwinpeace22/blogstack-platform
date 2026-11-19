"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import { BlogIndex, type BlogIndexProps } from "./blog-index.js";
import { BlogPost } from "./blog-post.js";

export interface BlogProps
  extends Omit<BlogIndexProps, "onOpenPost" | "postHref"> {
  commentsSlot?: React.ReactNode;
  newsletterSlot?: React.ReactNode;
  analytics?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  renderContent?: (html: string) => React.ReactNode;
}

/** Drop-in blog. Uses ?post=slug for shareable stories without router setup. */
export function Blog({
  header,
  footer,
  renderContent,
  className,
  commentsSlot,
  newsletterSlot,
  analytics = false,
  ...props
}: BlogProps) {
  const [route, setRoute] = React.useState<{
    ready: boolean;
    slug: string | null;
  }>({ ready: false, slug: null });
  const [pathname, setPathname] = React.useState("");
  const scope = `${props.apiUrl ?? "https://blogstack-app.hidden-silence-2d18.workers.dev"}/${props.projectSlug}`;
  React.useEffect(() => {
    const sync = () => {
      setRoute({
        ready: true,
        slug: new URLSearchParams(window.location.search).get("post"),
      });
      setPathname(window.location.pathname);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function navigate(slug: string | null) {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("post", slug);
    else url.searchParams.delete("post");
    window.history.pushState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setRoute({ ready: true, slug });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function href(slug: string | null) {
    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    if (slug) params.set("post", slug);
    else params.delete("post");
    return `${pathname}${params.size ? `?${params}` : ""}` || "./";
  }
  return (
    <div
      className={cn("min-h-[60dvh] bg-background text-foreground", className)}
    >
      {header}
      {!route.ready ? (
        <p
          role="status"
          className="px-4 py-20 text-center text-muted-foreground"
        >
          Loading blog…
        </p>
      ) : route.slug ? (
        <BlogPost
          key={`${scope}/${route.slug}`}
          projectSlug={props.projectSlug}
          slug={route.slug}
          commentsSlot={commentsSlot}
          newsletterSlot={newsletterSlot}
          analytics={analytics}
          {...(props.showAttribution !== undefined
            ? { showAttribution: props.showAttribution }
            : {})}
          {...(props.apiUrl ? { apiUrl: props.apiUrl } : {})}
          backHref={href(null)}
          onBack={() => navigate(null)}
          {...(renderContent ? { renderContent } : {})}
        />
      ) : (
        <BlogIndex
          key={scope}
          {...props}
          postHref={(post) => href(post.slug)}
          onOpenPost={(slug) => navigate(slug)}
        />
      )}
      {footer}
    </div>
  );
}
