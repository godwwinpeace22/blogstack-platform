"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import * as Primitive from "@radix-ui/react-accordion";

export const Accordion = Primitive.Root;
export const AccordionItem = React.forwardRef<React.ElementRef<typeof Primitive.Item>, React.ComponentPropsWithoutRef<typeof Primitive.Item>>(
  ({ className, ...props }, ref) => <Primitive.Item ref={ref} className={cn("border-b", className)} {...props} />
);
AccordionItem.displayName = "AccordionItem";

export const AccordionTrigger = React.forwardRef<React.ElementRef<typeof Primitive.Trigger>, React.ComponentPropsWithoutRef<typeof Primitive.Trigger>>(({ className, children, ...props }, ref) => <Primitive.Header className="flex"><Primitive.Trigger ref={ref} className={cn("group flex flex-1 items-center justify-between py-4 text-start font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)} {...props}>{children}<span aria-hidden="true" className="ms-4 transition-transform group-data-[state=open]:rotate-180">⌄</span></Primitive.Trigger></Primitive.Header>);
AccordionTrigger.displayName = "AccordionTrigger";
export const AccordionContent = React.forwardRef<React.ElementRef<typeof Primitive.Content>, React.ComponentPropsWithoutRef<typeof Primitive.Content>>(({ className, ...props }, ref) => <Primitive.Content ref={ref} className={cn("overflow-hidden pb-4 text-sm", className)} {...props} />);
AccordionContent.displayName = "AccordionContent";

