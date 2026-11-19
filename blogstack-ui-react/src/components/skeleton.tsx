"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

export const Skeleton = React.forwardRef<React.ElementRef<"div">, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("animate-pulse motion-reduce:animate-none rounded-md bg-muted", className)} {...props} />
);
Skeleton.displayName = "Skeleton";

