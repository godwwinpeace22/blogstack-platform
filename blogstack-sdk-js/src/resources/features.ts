import type { HttpClient } from "../client.js";
import type { SeoReport, Plan, BillingInterval } from "@blogstack/core";
import type {
  BillingStatus,
  LinkReport,
  AnalyticsReport,
  AgentEstimate,
  AgentRun,
  AgentProfile,
  AgentProposal,
} from "../launch-types.js";
const base = (id: string) => "/projects/" + encodeURIComponent(id);
export class SeoResource {
  constructor(private http: HttpClient) {}
  analyze(projectId: string, postId: string): Promise<SeoReport> {
    return this.http.get(base(projectId) + "/seo", { postId });
  }
}
export class LinksResource {
  constructor(private http: HttpClient) {}
  get(
    projectId: string,
    options: {
      cursor?: string;
      limit?: number;
      status?:
        | "unchecked"
        | "healthy"
        | "broken"
        | "redirected"
        | "inconclusive"
        | "unsafe";
    } = {},
  ): Promise<LinkReport> {
    return this.http.get(base(projectId) + "/links", options);
  }
  scan(projectId: string): Promise<{ id: string }> {
    return this.http.post(base(projectId) + "/links/scans");
  }
  ignore(projectId: string, id: string, ignored: boolean) {
    return this.http.patch(
      base(projectId) + "/links/" + encodeURIComponent(id),
      { ignored },
    );
  }
}
export class AnalyticsResource {
  constructor(private http: HttpClient) {}
  get(projectId: string, days = 30): Promise<AnalyticsReport> {
    return this.http.get(base(projectId) + "/analytics", { days });
  }
}
export class AgentsResource {
  constructor(private http: HttpClient) {}
  estimate(projectId: string): Promise<AgentEstimate> {
    return this.http.get(base(projectId) + "/agent-runs/estimate");
  }
  list(projectId: string): Promise<AgentRun[]> {
    return this.http.get(base(projectId) + "/agent-runs");
  }
  get(projectId: string, id: string): Promise<AgentRun> {
    return this.http.get(
      base(projectId) + "/agent-runs/" + encodeURIComponent(id),
    );
  }
  create(
    projectId: string,
    input: { postId: string; profile: AgentProfile; prompt: string },
  ): Promise<{ id: string }> {
    return this.http.post(base(projectId) + "/agent-runs", input);
  }
  review(
    projectId: string,
    runId: string,
    proposalId: string,
    action: "accept" | "reject",
    fields?: (keyof AgentProposal["changes"])[],
  ): Promise<{ state: string; revision?: number }> {
    return this.http.post(
      base(projectId) +
        "/agent-runs/" +
        encodeURIComponent(runId) +
        "/proposals/" +
        encodeURIComponent(proposalId) +
        "/review",
      { action, ...(fields ? { fields } : {}) },
    );
  }
}
export class BillingResource {
  constructor(private http: HttpClient) {}
  private base(id: string) {
    return "/accounts/" + encodeURIComponent(id) + "/billing";
  }
  get(id: string): Promise<BillingStatus> {
    return this.http.get(this.base(id));
  }
  checkout(
    id: string,
    plan: Plan,
    interval: BillingInterval,
  ): Promise<{ url: string }> {
    return this.http.post(this.base(id) + "/checkout", { plan, interval });
  }
  change(
    id: string,
    plan: Plan,
    interval: BillingInterval,
  ): Promise<{ pending: boolean; effective: string }> {
    return this.http.post(this.base(id) + "/change", { plan, interval });
  }
  portal(id: string): Promise<{ url: string }> {
    return this.http.post(this.base(id) + "/portal");
  }
  sync(id: string): Promise<{ synced: boolean }> {
    return this.http.post(this.base(id) + "/sync");
  }
}
