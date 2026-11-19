import type { ArticleMetadata, PlanLimits } from "@blogstack/core";
export type { Plan } from "@blogstack/core";
import type { Plan } from "@blogstack/core";
// ─── Enums ────────────────────────────────────────────────────────────────────

export type PostStatus = "draft" | "published" | "scheduled";
export type AccountRole = "account_admin" | "account_editor";
export type ProjectRole = "project_admin" | "editor" | "writer";
export type WebhookEvent =
  | "post.published"
  | "post.scheduled"
  | "post.deleted"
  | "post.updated"
  | "media.uploaded"
  | "member.invited"
  | "member.joined";

// ─── Account ──────────────────────────────────────────────────────────────────

export interface AccountOwner {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AccountLimits extends PlanLimits {}

export interface Account {
  id: string;
  ownerId: string;
  plan: Plan;
  createdAt: number;
  owner: AccountOwner | null;
  limits: AccountLimits;
  role: "owner" | AccountRole | null;
  canWrite: boolean;
  trialEndsAt: number | null;
  paidThrough: number | null;
  usage: {
    people: number;
    blogs: number;
    storageBytes: number;
    ai: number;
    links: number;
  };
}

export interface AccountMember {
  accountId: string;
  userId: string;
  role: AccountRole;
  invitedBy: string;
  invitedAt: number;
  joinedAt: number | null;
  user?: AccountOwner;
}

export type MemberList = AccountMember[];

export interface InviteMemberRequest {
  email: string;
  role: AccountRole;
}

export interface UpdateAccountRequest {
  name?: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  accountId: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: number;
  settings: ProjectSettings | null;
  role: ProjectRole;
  canWrite: boolean;
  canCustomizeBranding: boolean;
  branding: {
    showAttribution: boolean;
    workspaceName: string;
    logoUrl: string | null;
  };
  postCount?: number;
  memberCount?: number;
  viewCount?: number;
}

export type ProjectList = Project[];

export interface CreateProjectRequest {
  settings?: ProjectSettings;
  name: string;
  slug?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  settings?: ProjectSettings;
}

export interface ProjectStats {
  postCount: number;
  publishedCount: number;
  draftCount: number;
  scheduledCount: number;
  mediaCount: number;
  totalViews: number;
  viewsThisMonth: number;
}

// ─── Post ─────────────────────────────────────────────────────────────────────

export interface PostTag {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  ogImage: string | null;
}

export interface PostAuthor {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Post extends ArticleMetadata {
  revision: number;
  publishedRevision: number;
  everPublished: boolean;
  hasUnpublishedChanges: boolean;
  tagIds: string[];
  id: string;
  projectId: string;
  authorId: string;
  title: string;
  slug: string;
  content: string;
  renderedHtml: string | null;
  status: PostStatus;
  publishedAt: number | null;
  scheduledAt: number | null;
  createdAt: number;
  updatedAt: number;
  tags?: PostTag[];
  author?: PostAuthor | null;
}

export interface PostList {
  data: Post[];
  total: number;
  nextCursor: string | null;
}

export interface CreatePostRequest extends Partial<ArticleMetadata> {
  title: string;
  slug?: string;
  content?: string;
  tagIds?: string[];
}

export interface UpdatePostRequest extends Partial<ArticleMetadata> {
  revision: number;
  title?: string;
  slug?: string;
  content?: string;
  tagIds?: string[];
}

export interface SchedulePostRequest {
  scheduledAt: number;
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface Media {
  id: string;
  projectId: string;
  key: string;
  uploadedBy: string | null;
  filename: string;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  url: string;
  createdAt: number;
}

export interface MediaList {
  data: Media[];
  total: number;
  nextCursor: string | null;
}

export interface PresignMediaRequest {
  size?: number;
  filename: string;
  mimeType:
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp"
    | "image/avif";
}

export interface PresignMediaResponse {
  mediaId: string;
  presignedUrl: string;
  key: string;
  expiresAt: number;
  maxSize: number;
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  ogImage: string | null;
  postCount?: number;
}

export type TagList = Tag[];

export interface CreateTagRequest {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateTagRequest {
  name?: string;
  slug?: string;
  description?: string | null;
  ogImage?: string | null;
}

export interface MergeTagsRequest {
  sourceId: string;
  targetId: string;
}

// ─── API Key ─────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
  scopes: ApiKeyScope[];
  expiresAt: number | null;
  revokedAt: number | null;
}

export type ApiKeyList = ApiKey[];

export interface CreateApiKeyRequest {
  name: string;
  scopes?: ApiKeyScope[];
  expiresAt?: number;
}

export type CreateApiKeyResponse = ApiKey & { plaintext: string };

// ─── Webhook ─────────────────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  projectId: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type WebhookList = Webhook[];

export interface CreateWebhookRequest {
  url: string;
  events: WebhookEvent[];
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: WebhookEvent[];
  enabled?: boolean;
}

// ─── Project Members ─────────────────────────────────────────────────────────

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
  invitedBy: string;
  invitedAt: number;
  joinedAt: number | null;
  user?: AccountOwner;
}

export type ProjectMemberList = ProjectMember[];

export interface InviteProjectMemberRequest {
  email: string;
  role: ProjectRole;
}

export interface Invitation {
  id: string;
  token: string;
  email: string;
  projectId: string | null;
  accountId: string | null;
  role: AccountRole | ProjectRole;
  invitedBy: string;
  expiresAt: number;
  acceptedAt: number | null;
  projectName?: string | null;
  inviterName?: string | null;
}

export type PendingInvitation = Invitation;

export type PendingInvitationList = PendingInvitation[];

export interface AcceptInvitationResponse {
  success: boolean;
  projectId: string | null;
  accountId: string | null;
}

// ─── Public ──────────────────────────────────────────────────────────────────

export interface PublicPost extends Partial<ArticleMetadata> {
  url?: string | null;
  updatedAt?: number;
  excerpt: string;
  coverImage: string | null;
  readingMinutes: number;
  id: string;
  title: string;
  slug: string;
  renderedHtml: string | null;
  publishedAt: number | null;
  tags?: PublicTag[];
  author: { id: string; name: string | null; avatarUrl: string | null } | null;
}

export interface PublicPostList {
  data: PublicPost[];
  total: number;
  nextCursor: string | null;
}

export type PublicTagList = PublicTag[];

// ─── Error ───────────────────────────────────────────────────────────────────

export interface BlogStackError {
  error: string;
  code: string;
  requestId?: string;
}

export class BlogStackApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, body: BlogStackError) {
    super(body.error);
    this.name = "BlogStackApiError";
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
  }
}

export interface ProjectSettings {
  ogImage?: string | null;
  robotsTxt?: string | null;
  sitemapEnabled?: boolean;
  rssEnabled?: boolean;
  blogUrl?: string;
  hideAttribution?: boolean;
  workspaceName?: string;
  logoUrl?: string | null;
  analyticsEnabled?: boolean;
}

export type ApiKeyScope =
  | "projects:read"
  | "posts:read"
  | "posts:write"
  | "media:read"
  | "media:write"
  | "tags:read"
  | "tags:write"
  | "seo:read"
  | "links:read"
  | "links:write"
  | "analytics:read"
  | "agent-runs:read"
  | "agent-runs:write";

export interface PublicTag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  projectId?: string;
  postCount?: number;
}
