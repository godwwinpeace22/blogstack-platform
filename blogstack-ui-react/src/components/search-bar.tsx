"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";
import { Input } from "./input.js";
import { Button } from "./button.js";

export interface SearchBarProps extends Omit<React.ComponentPropsWithoutRef<"form">, "onSubmit" | "onChange"> { value: string; onValueChange: (value: string) => void; onSearch?: (value: string) => void; placeholder?: string; label?: string; disabled?: boolean }
export function SearchBar({ value, onValueChange, onSearch, placeholder = "Search posts…", label = "Search posts", disabled, className, ...props }: SearchBarProps) {
  const id = React.useId();
  return <form role="search" className={cn("flex items-center gap-2", className)} {...props} onSubmit={event => { event.preventDefault(); onSearch?.(value.trim()); }}><label htmlFor={id} className="sr-only">{label}</label><Input id={id} name="q" type="search" value={value} placeholder={placeholder} disabled={disabled} onChange={event => onValueChange(event.target.value)} /><Button type="submit" disabled={disabled}>Search</Button></form>;
}
