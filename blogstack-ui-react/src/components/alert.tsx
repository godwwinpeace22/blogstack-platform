"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

export interface AlertProps extends React.ComponentPropsWithoutRef<"div"> { variant?: "default" | "destructive" }
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ className, variant = "default", ...props }, ref) => (
  <div ref={ref} role="alert" className={cn("relative w-full rounded-lg border p-4", variant === "destructive" ? "border-destructive/50 text-destructive" : "bg-background text-foreground", className)} {...props} />
));
Alert.displayName = "Alert";
export function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) { return <h5 className={cn("mb-1 font-medium leading-none", className)} {...props} />; }
export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("text-sm leading-relaxed", className)} {...props} />; }
