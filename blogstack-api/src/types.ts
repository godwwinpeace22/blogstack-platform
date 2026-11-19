import type {
  D1Database,
  KVNamespace,
  R2Bucket,
  DurableObjectNamespace,
  Queue,
} from "@cloudflare/workers-types";

// ─── Cloudflare bindings ──────────────────────────────────────────────────────

export interface Bindings {
  DASHBOARD_ASSETS?: Fetcher;
  // D1
  MAIN_DB: D1Database;
  // KV
  CACHE: KVNamespace;
  CDN_CACHE: KVNamespace;
  // R2
  MEDIA: R2Bucket;
  // Durable Objects
  EDITOR_DRAFT: DurableObjectNamespace;
  // Queues (producers)
  EVENT_RATE_LIMIT?: RateLimit;
  AUTH_RATE_LIMIT?: RateLimit;
  JOB_QUEUE?: Queue<{ jobId: string }>;
  LINK_SCANNER?: Fetcher;
  OPERATIONS?: Fetcher;
  OPERATOR_EMAIL?: string;
  MEDIA_DELETE_GRACE_SECONDS?: string;
  ANALYTICS?: AnalyticsEngineDataset;
  AI?: Ai;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  ANALYTICS_DATASET?: string;
  DEPLOYMENT_MODE?: "hosted" | "self_hosted";
  LIFECYCLE_ON_MINUTE_CRON?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_SERVER?: "sandbox" | "production";
  POLAR_PRODUCT_SOLO_MONTH?: string;
  POLAR_PRODUCT_SOLO_YEAR?: string;
  POLAR_PRODUCT_STUDIO_MONTH?: string;
  POLAR_PRODUCT_STUDIO_YEAR?: string;
  POLAR_PRODUCT_GROWTH_MONTH?: string;
  POLAR_PRODUCT_GROWTH_YEAR?: string;
  COOKIE_DOMAIN?: string;
  CHECKOUT_ENABLED?: string;
  SIGNUP_MODE?: "open" | "pilot" | "closed";
  PILOT_EMAILS?: string;
  // Secrets & vars
  BETTER_AUTH_SECRET: string;
  CDN_SECRET: string;
  RESEND_API_KEY: string;
  CDN_URL: string;
  API_URL: string;
  FRONTEND_URL: string;
  EMAIL_FROM: string;
}

// ─── Hono env ────────────────────────────────────────────────────────────────

export interface HonoEnv {
  Bindings: Bindings;
  Variables: {
    requestId: string;
    apiKey?: { id: string; projectId: string; scopes: string[] };
    /** Authenticated user ID (set by requireAuth middleware) */
    userId: string;
    /** Account the user belongs to (set by requireAuth middleware) */
    accountId: string;
  };
}

// ─── Domain types ────────────────────────────────────────────────────────────

export type LegacyPlan = "hobby" | "pro" | "team"; // retained database labels, never entitlements
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

export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  email_verified: number;
  created_at: number;
  updated_at: number;
}

export interface DbAccount {
  id: string;
  owner_id: string;
  plan: LegacyPlan;
  stripe_id: string | null;
  created_at: number;
}

export interface DbProject {
  id: string;
  account_id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: number;
  settings: string | null; // JSON
}

export interface DbPost {
  id: string;
  project_id: string;
  title: string;
  slug: string;
  content: string; // BlockNote JSON
  rendered_html: string | null;
  status: PostStatus;
  author_id: string;
  published_at: number | null;
  scheduled_at: number | null;
  created_at: number;
  updated_at: number;
  excerpt: string | null;
  cover_image: string | null;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  no_index: number;
  primary_keyword: string | null;
  published_revision: number;
  ever_published: number;
}

export interface DbMedia {
  id: string;
  project_id: string;
  key: string;
  url: string;
  filename: string;
  size: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  reserved_size: number;
  reservation_expires_at: number | null;
  confirmed: number; // 0 | 1
  created_at: number;
}

export interface DbTag {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string | null;
  og_image: string | null;
}

export interface DbApiKey {
  scopes: string;
  expires_at: number | null;
  revoked_at: number | null;
  id: string;
  project_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  created_by: string;
  last_used_at: number | null;
  created_at: number;
}

export interface DbWebhook {
  id: string;
  project_id: string;
  url: string;
  events: string; // JSON array
  secret: string;
  enabled: number; // 0 | 1
  created_at: number;
  updated_at: number;
}

export interface DbAccountMember {
  account_id: string;
  user_id: string;
  role: AccountRole;
  invited_by: string;
  joined_at: number | null;
  invited_at: number;
}

export interface DbProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  invited_by: string;
  joined_at: number | null;
  invited_at: number;
}

export interface DbInvitation {
  id: string;
  project_id: string | null;
  account_id: string | null;
  email: string;
  role: string;
  invited_by: string;
  token: string;
  expires_at: number;
  accepted_at: number | null;
}

// ─── Queue message shapes ─────────────────────────────────────────────────────

export interface ImageJobMessage {
  mediaId: string;
  key: string;
  projectId: string;
}

export interface WebhookJobMessage {
  projectId: string;
  webhookId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  attempt: number;
}
