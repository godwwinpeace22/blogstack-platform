import * as React from "react";
import { cn } from "../lib/cn.js";

export function Pagination({ className, ...props }: React.ComponentProps<"nav">) { return <nav aria-label="Pagination" className={cn("flex justify-center", className)} {...props} />; }
export function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) { return <ul className={cn("flex items-center gap-1", className)} {...props} />; }
export function PaginationItem(props: React.ComponentProps<"li">) { return <li {...props} />; }
export interface PaginationLinkProps extends React.ComponentPropsWithoutRef<"a"> { isActive?: boolean }
export function PaginationLink({ className, isActive, ...props }: PaginationLinkProps) { return <a aria-current={isActive ? "page" : undefined} className={cn("inline-flex min-h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isActive && "border bg-background", className)} {...props} />; }
export function PaginationPrevious(props: PaginationLinkProps) { return <PaginationLink aria-label="Previous page" {...props}>{props.children ?? "← Previous"}</PaginationLink>; }
export function PaginationNext(props: PaginationLinkProps) { return <PaginationLink aria-label="Next page" {...props}>{props.children ?? "Next →"}</PaginationLink>; }
export function PaginationEllipsis(props: React.ComponentProps<"span">) { return <span {...props}><span aria-hidden="true">…</span><span className="sr-only">More pages</span></span>; }
