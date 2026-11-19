"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

export const Table = React.forwardRef<React.ElementRef<"table">, React.ComponentPropsWithoutRef<"table">>(
  ({ className, ...props }, ref) => <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
);
Table.displayName = "Table";
export const TableHeader = React.forwardRef<React.ElementRef<"thead">, React.ComponentPropsWithoutRef<"thead">>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
);
TableHeader.displayName = "TableHeader";
export const TableBody = React.forwardRef<React.ElementRef<"tbody">, React.ComponentPropsWithoutRef<"tbody">>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
);
TableBody.displayName = "TableBody";
export const TableFooter = React.forwardRef<React.ElementRef<"tfoot">, React.ComponentPropsWithoutRef<"tfoot">>(
  ({ className, ...props }, ref) => <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium", className)} {...props} />
);
TableFooter.displayName = "TableFooter";
export const TableRow = React.forwardRef<React.ElementRef<"tr">, React.ComponentPropsWithoutRef<"tr">>(
  ({ className, ...props }, ref) => <tr ref={ref} className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
);
TableRow.displayName = "TableRow";
export const TableHead = React.forwardRef<React.ElementRef<"th">, React.ComponentPropsWithoutRef<"th">>(
  ({ className, ...props }, ref) => <th ref={ref} className={cn("h-12 px-4 text-start align-middle font-medium text-muted-foreground", className)} {...props} />
);
TableHead.displayName = "TableHead";
export const TableCell = React.forwardRef<React.ElementRef<"td">, React.ComponentPropsWithoutRef<"td">>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn("p-4 align-middle", className)} {...props} />
);
TableCell.displayName = "TableCell";
export const TableCaption = React.forwardRef<React.ElementRef<"caption">, React.ComponentPropsWithoutRef<"caption">>(
  ({ className, ...props }, ref) => <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
);
TableCaption.displayName = "TableCaption";

