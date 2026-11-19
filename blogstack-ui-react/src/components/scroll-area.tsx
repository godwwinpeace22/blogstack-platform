"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import * as Primitive from "@radix-ui/react-scroll-area";


export const ScrollBar = React.forwardRef<React.ElementRef<typeof Primitive.ScrollAreaScrollbar>, React.ComponentPropsWithoutRef<typeof Primitive.ScrollAreaScrollbar>>(({ className, orientation = "vertical", ...props }, ref) => <Primitive.ScrollAreaScrollbar ref={ref} orientation={orientation} className={cn("flex touch-none select-none p-0.5", orientation === "vertical" ? "h-full w-2.5" : "h-2.5 flex-col", className)} {...props}><Primitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" /></Primitive.ScrollAreaScrollbar>);
ScrollBar.displayName = "ScrollBar";
export const ScrollArea = React.forwardRef<React.ElementRef<typeof Primitive.Root>, React.ComponentPropsWithoutRef<typeof Primitive.Root>>(({ className, children, ...props }, ref) => <Primitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}><Primitive.Viewport className="size-full rounded-[inherit]">{children}</Primitive.Viewport><ScrollBar /><Primitive.Corner /></Primitive.Root>);
ScrollArea.displayName = "ScrollArea";
