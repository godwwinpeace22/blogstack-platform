"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import * as Primitive from "@radix-ui/react-slider";


export const Slider = React.forwardRef<React.ElementRef<typeof Primitive.Root>, React.ComponentPropsWithoutRef<typeof Primitive.Root>>(({ className, value, defaultValue = [0], "aria-label": label = "Value", ...props }, ref) => <Primitive.Root ref={ref} {...(value ? { value } : {})} defaultValue={defaultValue} className={cn("relative flex w-full touch-none select-none items-center data-[orientation=vertical]:h-40 data-[orientation=vertical]:w-2 data-[orientation=vertical]:flex-col", className)} {...props}><Primitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted data-[orientation=vertical]:h-full"><Primitive.Range className="absolute h-full bg-primary data-[orientation=vertical]:w-full" /></Primitive.Track>{(value ?? defaultValue).map((_, index) => <Primitive.Thumb key={index} aria-label={(value ?? defaultValue).length > 1 ? `${label} ${index + 1}` : label} className="block size-5 rounded-full border-2 border-primary bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />)}</Primitive.Root>);
Slider.displayName = "Slider";
