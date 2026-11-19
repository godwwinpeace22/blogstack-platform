"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

export interface EmptyStateProps extends React.ComponentPropsWithoutRef<"div"> { title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode }
export function EmptyState({ title, description, icon, action, className, children, ...props }: EmptyStateProps) {
  return <div className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center", className)} {...props}>
    {icon ? <div aria-hidden="true" className="text-muted-foreground">{icon}</div> : null}
    <h3 className="text-lg font-semibold">{title}</h3>
    {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
    {children}{action}
  </div>;
}
