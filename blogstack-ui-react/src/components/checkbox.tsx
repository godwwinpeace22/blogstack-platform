"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import * as Primitive from "@radix-ui/react-checkbox";


export const Checkbox = React.forwardRef<React.ElementRef<typeof Primitive.Root>, React.ComponentPropsWithoutRef<typeof Primitive.Root>>(({ className, ...props }, ref) => <Primitive.Root ref={ref} className={cn("peer size-4 shrink-0 rounded-sm border border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground", className)} {...props}><Primitive.Indicator className="flex items-center justify-center text-xs">{props.checked === "indeterminate" || props.defaultChecked === "indeterminate" ? "−" : "✓"}</Primitive.Indicator></Primitive.Root>);
Checkbox.displayName = "Checkbox";
