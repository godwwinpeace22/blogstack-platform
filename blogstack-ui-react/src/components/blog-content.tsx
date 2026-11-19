"use client";
import * as React from "react";
import { sanitizeArticle } from "@blogstack/core";
import { cn } from "../lib/cn.js";
export interface BlogContentProps {
  html: string;
  className?: string;
}
export function BlogContent({ html, className }: BlogContentProps) {
  const sanitized = React.useMemo(() => sanitizeArticle(html), [html]);
  return (
    <div
      data-blogstack-article=""
      className={cn(
        "space-y-6 text-lg leading-relaxed [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:ps-6 [&_blockquote]:italic [&_h2]:pt-8 [&_h2]:text-3xl [&_h2]:font-semibold [&_h3]:pt-6 [&_h3]:text-2xl [&_h3]:font-semibold [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:ps-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-6 [&_ul]:list-disc [&_ul]:ps-6",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
