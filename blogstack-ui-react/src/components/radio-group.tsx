"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import * as Primitive from "@radix-ui/react-radio-group";


export const RadioGroup = React.forwardRef<React.ElementRef<typeof Primitive.Root>, React.ComponentPropsWithoutRef<typeof Primitive.Root>>(
  ({ className, ...props }, ref) => <Primitive.Root ref={ref} className={cn("grid gap-2", className)} {...props} />
);
RadioGroup.displayName = "RadioGroup";
export const RadioGroupItem = React.forwardRef<React.ElementRef<typeof Primitive.Item>, React.ComponentPropsWithoutRef<typeof Primitive.Item>>(({ className, ...props }, ref) => <Primitive.Item ref={ref} className={cn("size-4 rounded-full border border-primary text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)} {...props}><Primitive.Indicator className="flex items-center justify-center"><span className="size-2 rounded-full bg-current" /></Primitive.Indicator></Primitive.Item>);
RadioGroupItem.displayName = "RadioGroupItem";
