"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import * as Primitive from "@radix-ui/react-progress";


export const Progress = React.forwardRef<React.ElementRef<typeof Primitive.Root>, React.ComponentPropsWithoutRef<typeof Primitive.Root>>(({ className, value = null, max = 100, ...props }, ref) => {
  const upper = Number.isFinite(max) && max > 0 ? max : 100;
  const current = value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(upper, value));
  return <Primitive.Root ref={ref} value={current} max={upper} className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} {...props}><Primitive.Indicator className={cn("h-full bg-primary transition-all", current === null && "w-1/3 animate-pulse motion-reduce:animate-none")} style={current === null ? undefined : { width: `${current / upper * 100}%` }} /></Primitive.Root>;
});
Progress.displayName = "Progress";
