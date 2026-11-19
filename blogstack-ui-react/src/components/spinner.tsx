"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

export function Spinner({ className, "aria-label": label = "Loading", ...props }: React.ComponentProps<"span">) {
  return <span role="status" aria-label={label} className={cn("inline-flex", className)} {...props}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin motion-reduce:animate-none"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" /></svg></span>;
}
