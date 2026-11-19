/** Structural types: accept API/SDK data or your own data without a runtime SDK dependency. */
export interface BlogAuthor {
  id?: string;
  name: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
}
export interface BlogTag {
  id: string;
  name: string;
  slug: string;
  postCount?: number;
}
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  publishedAt: number | null;
  renderedHtml?: string | null;
  excerpt?: string | null;
  coverImage?: string | null;
  author?: BlogAuthor | null;
  tags?: BlogTag[];
  readingMinutes?: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  noIndex?: boolean;
  updatedAt?: number;
}

/** Prevent unsafe link protocols when rendering caller-provided content. */
export function safeHref(value: string): string {
  const normalized = value.trim();
  if (/^(https?:\/\/|\/(?!\/)|#|\.\.?\/)/i.test(normalized)) return normalized;
  return "#";
}

export function formatPostDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1000));
}
