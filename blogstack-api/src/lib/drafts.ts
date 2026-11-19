import { z } from "zod/v4";
import { parseDocument, safeUrl, type ArticleMetadata } from "@blogstack/core";
import { HTTPException } from "hono/http-exception";
import type { Bindings, DbPost } from "../types.js";

const documentSchema = z.string().refine((value) => {
  try {
    parseDocument(value);
    return true;
  } catch {
    return false;
  }
}, "Unsupported or oversized document");
const optionalUrl = z
  .string()
  .refine((value) => !!safeUrl(value), "Use an absolute HTTP(S) URL")
  .nullable()
  .optional();
export const articleFields = z.object({
  title: z.string().trim().min(1).max(500),
  slug: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9-]+$/),
  content: documentSchema,
  excerpt: z.string().max(2000).nullable().optional(),
  coverImage: optionalUrl,
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  canonicalUrl: optionalUrl,
  noIndex: z.boolean().optional(),
  primaryKeyword: z.string().max(150).nullable().optional(),
  tagIds: z.array(z.string()).max(50).optional(),
});
export interface DraftRow {
  post_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  no_index: number;
  primary_keyword: string | null;
  tag_ids: string;
  revision: number;
  updated_at: number;
  mutation_id: string | null;
}
export interface DraftData extends ArticleMetadata {
  title: string;
  slug: string;
  content: string;
  tagIds: string[];
  revision: number;
}
export function draftData(d: DraftRow): DraftData {
  return {
    title: d.title,
    slug: d.slug,
    content: d.content,
    excerpt: d.excerpt,
    coverImage: d.cover_image,
    seoTitle: d.seo_title,
    seoDescription: d.seo_description,
    canonicalUrl: d.canonical_url,
    noIndex: !!d.no_index,
    primaryKeyword: d.primary_keyword,
    tagIds: JSON.parse(d.tag_ids),
    revision: d.revision,
  };
}
export async function getDraft(
  env: Pick<Bindings, "MAIN_DB">,
  postId: string,
  projectId: string,
) {
  return env.MAIN_DB.prepare(
    "SELECT d.* FROM post_drafts d JOIN posts p ON p.id=d.post_id WHERE p.id=? AND p.project_id=?",
  )
    .bind(postId, projectId)
    .first<DraftRow>();
}
export async function validateTags(
  env: Pick<Bindings, "MAIN_DB">,
  projectId: string,
  ids: string[],
) {
  if (!ids.length) return;
  const result = await env.MAIN_DB.prepare(
    "SELECT id FROM tags WHERE project_id=? AND id IN (" +
      ids.map(() => "?").join(",") +
      ")",
  )
    .bind(projectId, ...ids)
    .all();
  if (result.results.length !== new Set(ids).size)
    throw new HTTPException(400, {
      message: "Tags must belong to this project",
    });
}
export async function saveDraft(
  env: Pick<Bindings, "MAIN_DB">,
  post: DbPost,
  changes: { [K in keyof DraftData]?: DraftData[K] | undefined },
  expected: number,
  mutationId: string = crypto.randomUUID(),
  after: ReturnType<Bindings["MAIN_DB"]["prepare"]>[] = [],
  guardProposalId: string | null = null,
) {
  const previous = await getDraft(env, post.id, post.project_id);
  if (!previous) throw new HTTPException(404, { message: "Post not found" });
  if (previous.revision !== expected)
    throw new HTTPException(409, {
      message: "The draft changed. Reload it before saving.",
    });
  const next = articleFields.parse({
    ...draftData(previous),
    ...Object.fromEntries(
      Object.entries(changes).filter(([, v]) => v !== undefined),
    ),
  });
  if (post.ever_published && next.slug !== post.slug)
    throw new HTTPException(409, {
      message: "Published article slugs cannot be changed",
    });
  await validateTags(env, post.project_id, next.tagIds ?? []);
  const conflict = await env.MAIN_DB.prepare(
    "SELECT p.id FROM posts p JOIN post_drafts d ON d.post_id=p.id WHERE p.project_id=? AND p.id!=? AND (p.slug=? OR d.slug=?)",
  )
    .bind(post.project_id, post.id, next.slug, next.slug)
    .first();
  if (conflict)
    throw new HTTPException(409, { message: "Slug already in use" });
  const statement = env.MAIN_DB.prepare(
    "UPDATE post_drafts SET title=?,slug=?,content=?,excerpt=?,cover_image=?,seo_title=?,seo_description=?,canonical_url=?,no_index=?,primary_keyword=?,tag_ids=?,revision=revision+1,mutation_id=?,updated_at=unixepoch() WHERE post_id=? AND revision=? AND (? IS NULL OR EXISTS(SELECT 1 FROM agent_proposals WHERE id=? AND state=\'pending\'))",
  ).bind(
    next.title,
    next.slug,
    next.content,
    next.excerpt ?? null,
    next.coverImage ?? null,
    next.seoTitle ?? null,
    next.seoDescription ?? null,
    next.canonicalUrl ?? null,
    next.noIndex ? 1 : 0,
    next.primaryKeyword ?? null,
    JSON.stringify(next.tagIds ?? []),
    mutationId,
    post.id,
    expected,
    guardProposalId,
    guardProposalId,
  );
  const result = (await env.MAIN_DB.batch([statement, ...after]))[0]!;
  if (!result.meta.changes)
    throw new HTTPException(409, {
      message: "The draft changed. Reload it before saving.",
    });
  return (await getDraft(env, post.id, post.project_id))!;
}
export function serializeDraft(post: DbPost, draft: DraftRow) {
  return {
    id: post.id,
    projectId: post.project_id,
    authorId: post.author_id,
    ...draftData(draft),
    renderedHtml: post.rendered_html,
    status: post.status,
    publishedAt: post.published_at,
    scheduledAt: post.scheduled_at,
    publishedRevision: post.published_revision,
    everPublished: !!post.ever_published,
    hasUnpublishedChanges: post.published_revision !== draft.revision,
    createdAt: post.created_at,
    updatedAt: draft.updated_at,
  };
}
