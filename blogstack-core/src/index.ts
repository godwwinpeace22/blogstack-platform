import xss from "xss";
const { FilterXSS, getDefaultWhiteList } =
  xss as unknown as typeof import("xss");

export type Plan = "solo" | "studio" | "growth";
export type BillingInterval = "month" | "year";
export interface PlanLimits {
  name: string;
  monthly: number;
  annual: number;
  maxProjects: number | null;
  maxAccountMembers: number;
  maxPostsPerProject: number;
  storageBytes: number;
  analyticsDays: number;
  linkChecks: number;
  auditDays: number | null;
  aiCredits: number;
  customBranding: boolean;
}
export const PLANS: Record<Plan, Readonly<PlanLimits>> = {
  solo: {
    name: "Solo",
    monthly: 3,
    annual: 30,
    maxProjects: 1,
    maxAccountMembers: 2,
    maxPostsPerProject: 1000,
    storageBytes: 1_000_000_000,
    analyticsDays: 30,
    linkChecks: 100,
    auditDays: null,
    aiCredits: 10,
    customBranding: false,
  },
  studio: {
    name: "Studio",
    monthly: 9,
    annual: 90,
    maxProjects: null,
    maxAccountMembers: 10,
    maxPostsPerProject: 1000,
    storageBytes: 5_000_000_000,
    analyticsDays: 180,
    linkChecks: 2500,
    auditDays: 7,
    aiCredits: 100,
    customBranding: true,
  },
  growth: {
    name: "Growth",
    monthly: 19,
    annual: 190,
    maxProjects: null,
    maxAccountMembers: 20,
    maxPostsPerProject: 1000,
    storageBytes: 100_000_000_000,
    analyticsDays: 365,
    linkChecks: 25000,
    auditDays: 1,
    aiCredits: 500,
    customBranding: true,
  },
};
export const TRIAL_DAYS = 14;
export const DELIVERY_GRACE_DAYS = 30;
export const RETENTION_DAYS = 90;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && Object.hasOwn(PLANS, value);
}
export function aiCredits(input: number, output: number): number {
  return Math.max(1, Math.ceil(input / 4000), Math.ceil(output / 1000));
}

const whiteList = getDefaultWhiteList();
for (const tag of Object.keys(whiteList))
  whiteList[tag] = [...whiteList[tag]!, "class"];
Object.assign(whiteList, {
  figure: ["class"],
  figcaption: ["class"],
  img: ["src", "alt", "width", "height", "loading", "class"],
  a: ["href", "title", "rel", "class"],
  pre: ["class", "style"],
  code: ["class", "style"],
  span: ["class", "style"],
  ul: ["class"],
  ol: ["start", "class"],
  li: ["value", "class"],
  h1: ["id", "class"],
  h2: ["id", "class"],
  h3: ["id", "class"],
  h4: ["id", "class"],
  h5: ["id", "class"],
  h6: ["id", "class"],
});
const sanitizer = new FilterXSS({
  whiteList,
  stripIgnoreTag: true,
  stripIgnoreTagBody: [
    "script",
    "style",
    "iframe",
    "object",
    "template",
    "svg",
    "math",
    "form",
  ],
  css: { whiteList: { color: true, "background-color": true } },
});
/** Same DOM-free sanitizer runs in Workers, SSR and browsers. */
export function sanitizeArticle(html: string): string {
  return sanitizer.process(html);
}
export function safeUrl(value: unknown, relative = false): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (/[\u0000-\u0020\u007f\\]/.test(text)) return "";
  if (relative && /^(\/(?!\/)|#|\.{1,2}\/)/.test(text)) return text;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function articleUrl(blogUrl: string, slug: string): string {
  return blogUrl.replace(/\/+$/, "") + "/" + encodeURIComponent(slug);
}
export interface ArticleMetadata {
  excerpt: string | null;
  coverImage: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
  primaryKeyword: string | null;
}
export const EMPTY_METADATA: ArticleMetadata = {
  excerpt: null,
  coverImage: null,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  noIndex: false,
  primaryKeyword: null,
};

export interface ContentBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: ContentBlock[];
}
const BLOCKS = new Set([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "codeBlock",
  "image",
  "quote",
  "divider",
]);
export function parseDocument(value: string): ContentBlock[] {
  if (new TextEncoder().encode(value).length > 1024 * 1024)
    throw new Error("Document exceeds 1 MiB");
  const parsed: unknown = JSON.parse(value);
  let count = 0;
  function inline(value: unknown, depth: number): boolean {
    if (depth > 20 || ++count > 20000) return false;
    if (value === undefined || typeof value === "string") return true;
    if (!Array.isArray(value)) return false;
    return value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        ["text", "link"].includes(item.type) &&
        (item.text === undefined || typeof item.text === "string") &&
        inline(item.content, depth + 1),
    );
  }
  function visit(items: unknown, depth: number): items is ContentBlock[] {
    if (!Array.isArray(items) || depth > 12) return false;
    return items.every((item) => {
      if (!item || typeof item !== "object" || ++count > 5000) return false;
      const block = item as ContentBlock;
      if (!BLOCKS.has(block.type) || !inline(block.content, 0)) return false;
      if (block.children && !visit(block.children, depth + 1)) return false;
      return true;
    });
  }
  if (!visit(parsed, 0))
    throw new Error("Unsupported or invalid document blocks");
  return parsed;
}
export function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((item) =>
      typeof item?.text === "string" ? item.text : inlineText(item?.content),
    )
    .join("");
}
export function flattenBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.flatMap((block) => [
    block,
    ...flattenBlocks(block.children ?? []),
  ]);
}
export function documentText(content: string): string {
  return flattenBlocks(parseDocument(content))
    .map((b) => inlineText(b.content))
    .join("\n");
}
export interface ArticleLink {
  href: string;
  anchor: string;
  kind: "internal" | "external" | "anchor" | "email" | "telephone" | "unsafe";
}
export function documentLinks(content: string, blogUrl: string): ArticleLink[] {
  const links: ArticleLink[] = [];
  function visit(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (item?.type === "link" && typeof item.href === "string") {
        const href = item.href.trim();
        let kind: ArticleLink["kind"] = "unsafe";
        if (href.startsWith("#")) kind = "anchor";
        else if (/^mailto:/i.test(href)) kind = "email";
        else if (/^tel:/i.test(href)) kind = "telephone";
        else
          try {
            const url = new URL(
              href,
              blogUrl.endsWith("/") ? blogUrl : blogUrl + "/",
            );
            if (safeUrl(url.href))
              kind =
                url.origin === new URL(blogUrl).origin
                  ? "internal"
                  : "external";
            links.push({
              href: kind === "unsafe" ? href : url.href,
              anchor: inlineText(item.content),
              kind,
            });
            visit(item.content);
            continue;
          } catch {
            /* expose invalid links as issues */
          }
        links.push({ href, anchor: inlineText(item.content), kind });
      }
      visit(item?.content);
    }
  }
  for (const block of flattenBlocks(parseDocument(content)))
    visit(block.content);
  return links;
}
export interface SeoIssue {
  code: string;
  severity: "warning" | "info";
  message: string;
}
export interface SeoReport {
  revision: number;
  issues: SeoIssue[];
  words: number;
  preview: { title: string; description: string; url: string };
  checkedAt: number;
}
export function analyzeSeo(
  post: {
    title: string;
    slug: string;
    content: string;
    revision: number;
  } & Partial<ArticleMetadata>,
  blogUrl: string,
): SeoReport {
  const blocks = flattenBlocks(parseDocument(post.content));
  const text = blocks.map((b) => inlineText(b.content)).join(" ");
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || "";
  const issues: SeoIssue[] = [];
  const add = (
    code: string,
    message: string,
    severity: SeoIssue["severity"] = "warning",
  ) => issues.push({ code, message, severity });
  if (!title.trim()) add("missing_title", "Add a descriptive article title.");
  else if (title.length > 60)
    add(
      "long_title",
      "The search title may be truncated; consider a shorter title.",
      "info",
    );
  if (!description)
    add(
      "missing_description",
      "Add a description for search and social previews.",
    );
  else if (description.length > 160)
    add(
      "long_description",
      "The description may be truncated in search previews.",
      "info",
    );
  const headings = blocks.filter((b) => b.type === "heading");
  if (headings.some((b) => b.props?.level === 1))
    add(
      "body_h1",
      "The article title is the main heading. Use level 2 or below inside the article.",
    );
  let level = 1;
  for (const heading of headings) {
    const next = Number(heading.props?.level ?? 2);
    if (next > level + 1) {
      add("heading_order", "Avoid skipping heading levels.");
      break;
    }
    level = next;
  }
  if (
    blocks.some(
      (b) => b.type === "image" && !String(b.props?.caption ?? "").trim(),
    )
  )
    add("image_description", "Add a useful image description or caption.");
  const links = documentLinks(post.content, blogUrl);
  if (
    text.split(/\s+/).length > 300 &&
    !links.some((l) => l.kind === "internal")
  )
    add(
      "internal_links",
      "Consider linking to a relevant article on your website.",
      "info",
    );
  if (links.some((l) => l.kind === "unsafe"))
    add(
      "unsafe_link",
      "Replace links with unsupported or unsafe destinations.",
    );
  if (
    post.primaryKeyword &&
    !text.toLowerCase().includes(post.primaryKeyword.toLowerCase())
  )
    add(
      "target_keyword",
      "The optional target phrase does not appear in the article; check whether it fits naturally.",
      "info",
    );
  if (post.noIndex)
    add("no_index", "This article is excluded from search indexing.", "info");
  return {
    revision: post.revision,
    issues,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    preview: {
      title,
      description,
      url: post.canonicalUrl || articleUrl(blogUrl, post.slug),
    },
    checkedAt: Math.floor(Date.now() / 1000),
  };
}
export function publicationMetadata(
  post: {
    title: string;
    slug: string;
    publishedAt: number | null;
    updatedAt?: number;
    author?: { name: string | null } | null;
  } & Partial<ArticleMetadata>,
  blogUrl: string,
) {
  const url = post.canonicalUrl || articleUrl(blogUrl, post.slug);
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || "";
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: !post.noIndex, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "article" as const,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
  };
}
export function articleJsonLd(
  post: {
    title: string;
    slug: string;
    publishedAt: number | null;
    updatedAt?: number;
    author?: { name: string | null } | null;
  } & Partial<ArticleMetadata>,
  blogUrl: string,
): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    url: post.canonicalUrl || articleUrl(blogUrl, post.slug),
    ...(post.publishedAt
      ? { datePublished: new Date(post.publishedAt * 1000).toISOString() }
      : {}),
    ...(post.updatedAt
      ? { dateModified: new Date(post.updatedAt * 1000).toISOString() }
      : {}),
    ...(post.coverImage ? { image: [post.coverImage] } : {}),
    ...(post.author?.name
      ? { author: { "@type": "Person", name: post.author.name } }
      : {}),
  }).replace(/</g, "\\u003c");
}
export { startBlogAnalytics, analyticsOptOut } from "./tracking.js";
export type { TrackingOptions } from "./tracking.js";
