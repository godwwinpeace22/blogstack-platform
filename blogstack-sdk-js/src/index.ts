import {
  SeoResource,
  LinksResource,
  AnalyticsResource,
  AgentsResource,
  BillingResource,
} from "./resources/features.js";
import { HttpClient } from "./client.js";
import { AccountsResource } from "./resources/accounts.js";
import { ProjectsResource } from "./resources/projects.js";
import { PostsResource } from "./resources/posts.js";
import { MediaResource } from "./resources/media.js";
import { TagsResource } from "./resources/tags.js";
import { ApiKeysResource } from "./resources/api-keys.js";
import { WebhooksResource } from "./resources/webhooks.js";
import { MembersResource } from "./resources/members.js";
import { PublicResource } from "./resources/public.js";

export type { BlogStackClientOptions } from "./client.js";

export * from "./types.js";
export * from "./launch-types.js";
export {
  PLANS,
  publicationMetadata,
  articleJsonLd,
  sanitizeArticle,
  startBlogAnalytics,
  analyticsOptOut,
  documentText,
  documentLinks,
} from "@blogstack/core";
export type { SeoReport } from "@blogstack/core";

export class BlogStackClient {
  /** @internal */
  readonly _http: HttpClient;

  readonly seo: SeoResource;
  readonly links: LinksResource;
  readonly analytics: AnalyticsResource;
  readonly agents: AgentsResource;
  readonly billing: BillingResource;
  queryKey(key: readonly unknown[]) {
    return [
      "blogstack",
      this._http.sessionKey,
      this._http.accountId ?? "owned",
      ...key,
    ] as const;
  }
  setAccount(accountId: string | undefined) {
    this._http.accountId = accountId;
  }
  setSession(sessionKey: string) {
    this._http.sessionKey = sessionKey;
  }
  readonly accounts: AccountsResource;
  readonly projects: ProjectsResource;
  readonly posts: PostsResource;
  readonly media: MediaResource;
  readonly tags: TagsResource;
  readonly apiKeys: ApiKeysResource;
  readonly webhooks: WebhooksResource;
  readonly members: MembersResource;
  readonly public: PublicResource;

  constructor(options?: import("./client.js").BlogStackClientOptions) {
    this._http = new HttpClient(options);
    this.seo = new SeoResource(this._http);
    this.links = new LinksResource(this._http);
    this.analytics = new AnalyticsResource(this._http);
    this.agents = new AgentsResource(this._http);
    this.billing = new BillingResource(this._http);
    this.accounts = new AccountsResource(this._http);
    this.projects = new ProjectsResource(this._http);
    this.posts = new PostsResource(this._http);
    this.media = new MediaResource(this._http);
    this.tags = new TagsResource(this._http);
    this.apiKeys = new ApiKeysResource(this._http);
    this.webhooks = new WebhooksResource(this._http);
    this.members = new MembersResource(this._http);
    this.public = new PublicResource(this._http);
  }
}
