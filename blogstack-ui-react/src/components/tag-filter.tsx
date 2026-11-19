"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import type { BlogTag } from "../lib/blog-types.js";
import { Button } from "./button.js";

export interface TagFilterProps extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange"> { tags: BlogTag[]; value?: string | null; onValueChange: (slug: string | null) => void; allLabel?: string }
export function TagFilter({ tags, value = null, onValueChange, allLabel = "All posts", className, ...props }: TagFilterProps) {
  return <div role="group" aria-label="Filter by tag" className={cn("flex flex-wrap gap-2", className)} {...props}>
    <Button type="button" size="sm" variant={value === null ? "default" : "outline"} aria-pressed={value === null} onClick={() => onValueChange(null)}>{allLabel}</Button>
    {tags.map(tag => <Button key={tag.id} type="button" size="sm" variant={value === tag.slug ? "default" : "outline"} aria-pressed={value === tag.slug} onClick={() => onValueChange(tag.slug)}>{tag.name}{tag.postCount !== undefined ? ` (${tag.postCount})` : ""}</Button>)}
  </div>;
}
