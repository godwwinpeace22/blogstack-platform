import * as React from "react";
import { cn } from "../lib/cn.js";

export function Breadcrumb(props: React.ComponentProps<"nav">) { return <nav aria-label="Breadcrumb" {...props} />; }
export function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) { return <ol className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)} {...props} />; }
export function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) { return <li className={cn("inline-flex items-center gap-2", className)} {...props} />; }
export function BreadcrumbLink({ className, ...props }: React.ComponentProps<"a">) { return <a className={cn("transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />; }
export function BreadcrumbPage(props: React.ComponentProps<"span">) { return <span aria-current="page" {...props} />; }
export function BreadcrumbSeparator({ children, ...props }: React.ComponentProps<"li">) { return <li role="presentation" aria-hidden="true" {...props}>{children ?? "/"}</li>; }
