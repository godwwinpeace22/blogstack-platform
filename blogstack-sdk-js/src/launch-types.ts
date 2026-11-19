import type {
  Plan,
  BillingInterval,
  PlanLimits,
  ArticleMetadata,
} from "@blogstack/core";
export type { BillingInterval } from "@blogstack/core";
export interface AccessibleAccount {
  id: string;
  ownerId: string;
  name: string | null;
  email: string;
  role: "owner" | "account_admin" | "account_editor" | null;
}
export interface PublicBlog {
  name: string;
  slug: string;
  blogUrl: string | null;
  analyticsEnabled: boolean;
  branding: {
    showAttribution: boolean;
    workspaceName: string;
    logoUrl: string | null;
  };
}
export interface BillingStatus {
  accountId: string;
  hasBillingCustomer: boolean;
  hasSubscription: boolean;
  providerStatus: string | null;
  plan: Plan;
  interval: BillingInterval | null;
  status: "active" | "trialing" | "expired" | "not_started";
  canWrite: boolean;
  trialEndsAt: number | null;
  paidThrough: number | null;
  deliveryEndsAt: number | null;
  deletesAt: number | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: Plan | null;
  pendingInterval: BillingInterval | null;
  limits: PlanLimits;
  usage: {
    people: number;
    blogs: number;
    storageBytes: number;
    ai: number;
    links: number;
  };
  catalog: Record<Plan, PlanLimits>;
  configured: boolean;
}
export interface LinkEntry {
  id: string;
  postId: string;
  url: string;
  anchor: string;
  kind: string;
  status: string;
  httpStatus: number | null;
  finalUrl: string | null;
  checkedAt: number | null;
  ignored: number;
  insecure: boolean;
}
export interface LinkReport {
  links: LinkEntry[];
  scans: {
    id: string;
    status: string;
    checked: number;
    error: string | null;
    createdAt: number;
    completedAt: number | null;
  }[];
  orphaned: { id: string; title: string; slug: string }[];
  nextCursor: string | null;
  limited: boolean;
}
export interface AnalyticsReport {
  from: string;
  to: string;
  days: number;
  historyDays: number;
  views: number;
  clicks: number;
  clicksPer100Views: number;
  sampled: boolean;
  liveAvailable: boolean;
  updatedAt: number;
  daily: { day: string; views: number; clicks: number }[];
  posts: { postId: string; title: string; views: number; clicks: number }[];
  referrers: { name: string; total: number }[];
  destinations: { name: string; total: number }[];
}
export type AgentProfile = "writing" | "seo" | "linking";
export interface AgentEstimate {
  availableCredits: number;
  maxCredits: number;
  monthlyCredits: number;
  canRun: boolean;
}
export interface AgentProposal {
  id: string;
  changes: Partial<ArticleMetadata & { title: string; content: string }>;
  state: "pending" | "accepted" | "rejected";
  baseRevision: number;
  appliedRevision: number | null;
}
export interface AgentRun {
  id: string;
  postId: string;
  profile: AgentProfile;
  status: "queued" | "running" | "complete" | "failed";
  credits: number;
  result: string | null;
  error: string | null;
  baseRevision: number;
  createdAt: number;
  proposals?: AgentProposal[];
}
export interface ProjectExport {
  version: number;
  exportedAt: string;
  project: unknown;
  posts: unknown[];
  drafts: unknown[];
  tags: unknown[];
  postTags: { postId: string; tagId: string }[];
  media: { id: string; downloadPath: string; [key: string]: unknown }[];
}
