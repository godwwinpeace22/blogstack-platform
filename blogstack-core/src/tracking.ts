export interface TrackingOptions {
  projectSlug: string;
  postId: string;
  apiUrl?: string;
  enabled?: boolean;
  preview?: boolean;
  root?: Document | HTMLElement;
  trackView?: boolean;
}
export function analyticsOptOut(value: boolean): void {
  if (typeof window !== "undefined")
    try {
      window.localStorage.setItem(
        "blogstack.analytics.optout",
        value ? "1" : "0",
      );
    } catch {
      /* storage may be disabled */
    }
}
/** Cookieless, non-blocking tracking. Original hrefs and navigation are untouched. */
export function startBlogAnalytics(options: TrackingOptions): () => void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    options.enabled === false ||
    options.preview
  )
    return () => {};
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const optedOut = () => {
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return true;
    try {
      return window.localStorage.getItem("blogstack.analytics.optout") === "1";
    } catch {
      return false;
    }
  };
  const current = new URL(window.location.href);
  if (
    optedOut() ||
    current.searchParams.has("preview") ||
    /(^|\/)preview(\/|$)/.test(current.pathname)
  )
    return () => {};
  const endpoint =
    (options.apiUrl ?? "https://blogstack-app.hidden-silence-2d18.workers.dev").replace(/\/$/, "") +
    "/public/" +
    encodeURIComponent(options.projectSlug) +
    "/events";
  const send = (type: "view" | "click", destination?: string) => {
    if (optedOut()) return;
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({
        postId: options.postId,
        type,
        ...(destination ? { destination } : {}),
        referrer: document.referrer,
      }),
    }).catch(() => {});
  };
  if (options.trackView !== false) send("view");
  const root = options.root ?? document;
  const click = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || !/^https?:$/.test(anchor.protocol)) return;
    if (root === document && !anchor.closest("[data-blogstack-article]"))
      return;
    send("click", anchor.href);
  };
  root.addEventListener("click", click, { capture: true, passive: true });
  root.addEventListener("auxclick", click, { capture: true, passive: true });
  return () => {
    root.removeEventListener("click", click, true);
    root.removeEventListener("auxclick", click, true);
  };
}
