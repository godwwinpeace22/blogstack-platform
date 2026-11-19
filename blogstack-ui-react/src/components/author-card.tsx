import * as React from "react";
import { cn } from "../lib/cn.js";
import { safeHref, type BlogAuthor } from "../lib/blog-types.js";

export interface AuthorCardProps extends React.ComponentPropsWithoutRef<"aside"> { author: BlogAuthor }
export function AuthorCard({ author, className, children, ...props }: AuthorCardProps) {
  return <aside aria-label="About the author" className={cn("flex items-start gap-4 rounded-lg border p-5", className)} {...props}>
    {author.avatarUrl ? <img src={safeHref(author.avatarUrl)} alt="" width={48} height={48} loading="lazy" className="size-12 rounded-full object-cover" /> : null}
    <div className="space-y-2"><h3 className="font-semibold">{author.name ?? "Anonymous"}</h3>{author.bio ? <p className="text-sm text-muted-foreground">{author.bio}</p> : null}{children}</div>
  </aside>;
}
