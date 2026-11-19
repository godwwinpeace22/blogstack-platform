"use client";

import * as React from "react";
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/cn.js";

export const Sheet = Primitive.Root;
export const SheetTrigger = Primitive.Trigger;
export const SheetClose = Primitive.Close;
export const SheetTitle = Primitive.Title;
export const SheetDescription = Primitive.Description;
export const SheetPortal = Primitive.Portal;
const sides = { left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm", right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm", top: "inset-x-0 top-0 border-b", bottom: "inset-x-0 bottom-0 border-t" };
export interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof Primitive.Content> { side?: keyof typeof sides }
export const SheetContent = React.forwardRef<React.ElementRef<typeof Primitive.Content>, SheetContentProps>(({ side = "right", className, children, ...props }, ref) => <Primitive.Portal><Primitive.Overlay className="fixed inset-0 z-50 bg-black/70" /><Primitive.Content ref={ref} className={cn("fixed z-50 flex max-h-dvh flex-col gap-4 overflow-y-auto bg-background p-6 shadow-lg", sides[side], className)} {...props}>{children}<Primitive.Close className="absolute end-4 top-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /><span className="sr-only">Close</span></Primitive.Close></Primitive.Content></Primitive.Portal>);
SheetContent.displayName = "SheetContent";
export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex flex-col gap-2 pe-6", className)} {...props} />; }
export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end", className)} {...props} />; }
