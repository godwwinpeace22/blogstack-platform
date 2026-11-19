"use client";
import * as React from "react";
import { startBlogAnalytics, type TrackingOptions } from "@blogstack/core";
export function BlogAnalytics({
  projectSlug,
  postId,
  apiUrl,
  enabled = true,
  preview = false,
}: Omit<TrackingOptions, "root" | "trackView">) {
  const seen = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = projectSlug + ":" + postId;
    const stop = startBlogAnalytics({
      projectSlug,
      postId,
      enabled,
      preview,
      ...(apiUrl ? { apiUrl } : {}),
      trackView: seen.current !== key,
    });
    seen.current = key;
    return stop;
  }, [projectSlug, postId, apiUrl, enabled, preview]);
  return null;
}
