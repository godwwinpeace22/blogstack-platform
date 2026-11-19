import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { HTTPException } from "hono/http-exception";
import { analyzeSeo } from "@blogstack/core";
import { requireAuth } from "../middleware/auth.js";
import {
  getEffectiveProjectRole,
  assertProjectRole,
} from "../lib/permissions.js";
import { getDraft, draftData, saveDraft } from "../lib/drafts.js";
import { projectBlogUrl, linkReport, startLinkScan } from "../lib/links.js";
import { analyticsReport } from "../lib/analytics.js";
import { runInput, estimateAgent, createAgentRun } from "../lib/agents.js";
import { notifyJob } from "../lib/jobs.js";
import type { HonoEnv, DbPost } from "../types.js";
const app = new Hono<HonoEnv>();
app.use("/:projectId/*", requireAuth, async (c, next) => {
  assertProjectRole(
    await getEffectiveProjectRole(
      c.env.MAIN_DB,
      c.var.userId,
      c.req.param("projectId")!,
    ),
    "writer",
  );
  await next();
});
app.get("/:projectId/seo", async (c) => {
  const projectId = c.req.param("projectId"),
    postId = c.req.query("postId");
  if (!postId) throw new HTTPException(400, { message: "Select an article" });
  const [draft, project] = await Promise.all([
    getDraft(c.env, postId, projectId),
    c.env.MAIN_DB.prepare("SELECT settings FROM projects WHERE id=?")
      .bind(projectId)
      .first<{ settings: string }>(),
  ]);
  if (!draft) throw new HTTPException(404, { message: "Post not found" });
  const base = projectBlogUrl(project?.settings ?? null);
  const report = analyzeSeo(
    draftData(draft),
    base || "https://example.invalid/blog",
  );
  if (!base)
    report.issues.unshift({
      code: "missing_blog_url",
      severity: "warning",
      message: "Set the website blog URL before publishing.",
    });
  return c.json(report);
});
app.get("/:projectId/links", async (c) => {
  const options = z
    .object({
      cursor: z.string().min(1).max(100).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      status: z
        .enum([
          "unchecked",
          "healthy",
          "broken",
          "redirected",
          "inconclusive",
          "unsafe",
        ])
        .optional(),
    })
    .parse(c.req.query());
  return c.json(await linkReport(c.env, c.req.param("projectId"), options));
});
app.post("/:projectId/links/scans", async (c) => {
  assertProjectRole(
    await getEffectiveProjectRole(
      c.env.MAIN_DB,
      c.var.userId,
      c.req.param("projectId"),
    ),
    "editor",
  );
  const id = await startLinkScan(c.env, c.req.param("projectId"));
  c.executionCtx.waitUntil(notifyJob(c.env, "links:" + id));
  return c.json({ id }, 202);
});
app.patch(
  "/:projectId/links/:linkId",
  zValidator("json", z.object({ ignored: z.boolean() })),
  async (c) => {
    assertProjectRole(
      await getEffectiveProjectRole(
        c.env.MAIN_DB,
        c.var.userId,
        c.req.param("projectId"),
      ),
      "editor",
    );
    const result = await c.env.MAIN_DB.prepare(
      "UPDATE post_links SET ignored=? WHERE id=? AND project_id=?",
    )
      .bind(
        c.req.valid("json").ignored ? 1 : 0,
        c.req.param("linkId"),
        c.req.param("projectId"),
      )
      .run();
    if (!result.meta.changes)
      throw new HTTPException(404, { message: "Link not found" });
    return c.json({ updated: true });
  },
);
app.get("/:projectId/analytics", async (c) => {
  const days = z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .parse(c.req.query("days") ?? 30);
  return c.json(await analyticsReport(c.env, c.req.param("projectId"), days));
});
app.get("/:projectId/agent-runs/estimate", async (c) =>
  c.json(await estimateAgent(c.env, c.req.param("projectId"))),
);
app.post("/:projectId/agent-runs", zValidator("json", runInput), async (c) => {
  const id = await createAgentRun(
    c.env,
    c.req.param("projectId"),
    c.var.userId,
    c.req.valid("json"),
  );
  c.executionCtx.waitUntil(notifyJob(c.env, "agent:" + id));
  return c.json({ id }, 202);
});
app.get("/:projectId/agent-runs", async (c) => {
  const rows = await c.env.MAIN_DB.prepare(
    "SELECT id,post_id AS postId,profile,status,credits,result,error,created_at AS createdAt FROM agent_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 30",
  )
    .bind(c.req.param("projectId"))
    .all();
  return c.json(rows.results);
});
app.get("/:projectId/agent-runs/:runId", async (c) => {
  const run = await c.env.MAIN_DB.prepare(
    "SELECT id,post_id AS postId,profile,status,credits,result,error,base_revision AS baseRevision,created_at AS createdAt FROM agent_runs WHERE id=? AND project_id=?",
  )
    .bind(c.req.param("runId"), c.req.param("projectId"))
    .first();
  if (!run) throw new HTTPException(404, { message: "Request not found" });
  const proposals = await c.env.MAIN_DB.prepare(
    "SELECT id,changes,state,base_revision AS baseRevision,applied_revision AS appliedRevision FROM agent_proposals WHERE run_id=?",
  )
    .bind(c.req.param("runId"))
    .all<{ changes: string }>();
  return c.json({
    ...run,
    proposals: proposals.results.map((p) => ({
      ...p,
      changes: JSON.parse(p.changes),
    })),
  });
});
app.post(
  "/:projectId/agent-runs/:runId/proposals/:proposalId/review",
  zValidator(
    "json",
    z.object({
      action: z.enum(["accept", "reject"]),
      fields: z
        .array(
          z.enum([
            "title",
            "content",
            "excerpt",
            "coverImage",
            "seoTitle",
            "seoDescription",
            "canonicalUrl",
            "noIndex",
            "primaryKeyword",
          ]),
        )
        .optional(),
    }),
  ),
  async (c) => {
    if (c.var.apiKey)
      throw new HTTPException(403, {
        message: "A person must review changes in an authenticated session",
      });
    const { projectId, runId, proposalId } = c.req.param();
    const proposal = await c.env.MAIN_DB.prepare(
      "SELECT a.* FROM agent_proposals a JOIN agent_runs r ON r.id=a.run_id WHERE a.id=? AND a.run_id=? AND r.project_id=?",
    )
      .bind(proposalId, runId, projectId)
      .first<{
        post_id: string;
        changes: string;
        base_revision: number;
        state: string;
      }>();
    if (!proposal)
      throw new HTTPException(404, { message: "Proposal not found" });
    if (proposal.state !== "pending")
      throw new HTTPException(409, {
        message: "This proposal has already been reviewed",
      });
    const input = c.req.valid("json");
    const post = await c.env.MAIN_DB.prepare(
      "SELECT * FROM posts WHERE id=? AND project_id=?",
    )
      .bind(proposal.post_id, projectId)
      .first<DbPost>();
    const role = await getEffectiveProjectRole(
      c.env.MAIN_DB,
      c.var.userId,
      projectId,
    );
    if (!post || (role === "writer" && post.author_id !== c.var.userId))
      throw new HTTPException(403, {
        message: "You cannot review changes to this article",
      });
    if (input.action === "reject") {
      await c.env.MAIN_DB.prepare(
        "UPDATE agent_proposals SET state='rejected',reviewed_by=?,reviewed_at=unixepoch() WHERE id=? AND state='pending'",
      )
        .bind(c.var.userId, proposalId)
        .run();
      return c.json({ state: "rejected" });
    }
    const changes = JSON.parse(proposal.changes),
      selected = input.fields
        ? Object.fromEntries(
            input.fields
              .filter((k) => k in changes)
              .map((k) => [k, changes[k]]),
          )
        : changes;
    if (!Object.keys(selected).length)
      throw new HTTPException(400, { message: "Select at least one change" });
    const draft = await saveDraft(
      c.env,
      post,
      selected,
      proposal.base_revision,
      proposalId,
      [
        c.env.MAIN_DB.prepare(
          "UPDATE agent_proposals SET state='accepted',reviewed_by=?,reviewed_at=unixepoch(),applied_revision=? WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM post_drafts WHERE post_id=? AND mutation_id=?)",
        ).bind(
          c.var.userId,
          proposal.base_revision + 1,
          proposalId,
          post.id,
          proposalId,
        ),
      ],
      proposalId,
    );
    return c.json({ state: "accepted", revision: draft.revision });
  },
);
export default app;
