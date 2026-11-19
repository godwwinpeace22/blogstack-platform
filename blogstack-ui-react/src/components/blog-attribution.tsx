import * as React from "react";
export function BlogAttribution({ show = true }: { show?: boolean }) {
  return show ? (
    <p className="mt-12 text-center text-xs text-muted-foreground">
      <a
        href="https://blogstack-site.hidden-silence-2d18.workers.dev"
        rel="nofollow noopener noreferrer"
        target="_blank"
      >
        Powered by BlogStack
      </a>
    </p>
  ) : null;
}
export function CommentsSlot({ children }: { children?: React.ReactNode }) {
  return children ? (
    <section aria-label="Comments" className="mx-auto mt-12 max-w-3xl">
      {children}
    </section>
  ) : null;
}
export function NewsletterSlot({ children }: { children?: React.ReactNode }) {
  return children ? (
    <section aria-label="Newsletter" className="mx-auto mt-12 max-w-3xl">
      {children}
    </section>
  ) : null;
}

export function useBlogBranding(
  projectSlug: string,
  apiUrl: string,
  override: boolean | undefined,
): boolean {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    if (override !== undefined) return;
    const controller = new AbortController();
    void fetch(
      apiUrl.replace(/\/$/, "") + "/public/" + encodeURIComponent(projectSlug),
      { signal: controller.signal, credentials: "omit" },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((info) => {
        if (info && !controller.signal.aborted)
          setShow(!!info.branding?.showAttribution);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [projectSlug, apiUrl, override]);
  return override ?? show;
}
