import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePost, useProject } from "@blogstack/sdk/react";
import {
  documentText,
  documentLinks,
  type AgentProfile,
  type AgentProposal,
  type Post,
} from "@blogstack/sdk";
import { Button } from "@blogstack/ui";
import { api } from "../lib/api";
import { ErrorMessage, Panel, fieldClass } from "./feedback";
export function AgentPanel({
  projectId,
  postId,
  beforeRequest,
  onApplied,
}: {
  projectId: string;
  postId: string;
  beforeRequest?: () => Promise<unknown>;
  onApplied?: () => Promise<void>;
}) {
  const qc = useQueryClient(),
    [profile, setProfile] = React.useState<AgentProfile>("writing"),
    [prompt, setPrompt] = React.useState(""),
    [runId, setRunId] = React.useState<string | null>(null);
  const estimate = useQuery({
    queryKey: api.queryKey(["agent-estimate", projectId]),
    queryFn: () => api.agents.estimate(projectId),
  });
  const create = useMutation({
    mutationFn: async () => {
      await beforeRequest?.();
      return api.agents.create(projectId, { postId, profile, prompt });
    },
    onSuccess: (run) => {
      setRunId(run.id);
      void qc.invalidateQueries({
        queryKey: api.queryKey(["agent-estimate", projectId]),
      });
    },
  });
  return (
    <Panel title="AI assistant">
      <p className="text-sm text-muted-foreground">
        Prepare suggestions for review. The assistant cannot apply changes or
        publish.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="block text-sm">
          Assistant
          <select
            className={fieldClass + " mt-1"}
            value={profile}
            onChange={(e) => setProfile(e.target.value as AgentProfile)}
          >
            <option value="writing">Writing</option>
            <option value="seo">SEO</option>
            <option value="linking">Internal links</option>
          </select>
        </label>
        <label className="block text-sm">
          Your request
          <textarea
            className={fieldClass + " mt-1 min-h-24"}
            required
            maxLength={4000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Suggest a stronger opening and a concise search description."
          />
        </label>
        {estimate.data ? (
          <p className="text-xs text-muted-foreground">
            {estimate.data.availableCredits} credits available · This request
            reserves up to {estimate.data.maxCredits} credits. Unused credits
            are returned.
          </p>
        ) : null}
        {estimate.data && !estimate.data.canRun ? (
          <p role="status" className="text-sm text-muted-foreground">
            AI assistance is currently unavailable for this workspace.
          </p>
        ) : null}
        <ErrorMessage error={create.error || estimate.error} />
        <Button
          type="submit"
          disabled={
            create.isPending ||
            !estimate.data?.canRun ||
            !estimate.data.availableCredits
          }
        >
          {create.isPending ? "Preparing…" : "Prepare suggestions"}
        </Button>
      </form>
      {runId ? (
        <AgentReview
          projectId={projectId}
          runId={runId}
          {...(onApplied ? { onApplied } : {})}
        />
      ) : null}
    </Panel>
  );
}
export function AgentReview({
  projectId,
  runId,
  onApplied,
}: {
  projectId: string;
  runId: string;
  onApplied?: () => Promise<void>;
}) {
  const qc = useQueryClient(),
    run = useQuery({
      queryKey: api.queryKey(["agent-run", projectId, runId]),
      queryFn: () => api.agents.get(projectId, runId),
      refetchInterval: (q) =>
        ["queued", "running"].includes(q.state.data?.status ?? "queued")
          ? 1500
          : false,
    });
  const post = usePost(api, projectId, run.data?.postId ?? "", {
      enabled: !!run.data?.postId,
    }),
    project = useProject(api, projectId);
  React.useEffect(() => {
    if (run.data && ["complete", "failed"].includes(run.data.status))
      void qc.invalidateQueries({
        queryKey: api.queryKey(["agent-estimate", projectId]),
      });
  }, [run.data?.status, qc, projectId]);
  return (
    <div className="space-y-4 border-t pt-4">
      <ErrorMessage error={run.error} />
      {run.data ? (
        <>
          <p role="status" className="text-sm">
            {run.data.status === "queued"
              ? "Waiting for the assistant…"
              : run.data.status === "running"
                ? "Reading and preparing suggestions…"
                : run.data.status === "failed"
                  ? run.data.error
                  : run.data.result}
          </p>
          {run.data.status === "complete" ? (
            <p className="text-xs text-muted-foreground">
              {run.data.credits} credits used. Changes apply to a saved draft;
              publishing is a separate action.
            </p>
          ) : null}
          {run.data.proposals?.map((proposal) =>
            post.data ? (
              <Proposal
                key={proposal.id}
                proposal={proposal}
                post={post.data}
                projectId={projectId}
                runId={runId}
                blogUrl={
                  project.data?.settings?.blogUrl ??
                  "https://example.invalid/blog"
                }
                enabled={!!project.data?.canWrite}
                {...(onApplied ? { onApplied } : {})}
              />
            ) : null,
          )}
        </>
      ) : null}
    </div>
  );
}
const labels: Record<string, string> = {
  title: "Title",
  content: "Article content",
  excerpt: "Excerpt",
  coverImage: "Cover image",
  seoTitle: "Search title",
  seoDescription: "Search description",
  canonicalUrl: "Canonical URL",
  noIndex: "Exclude from search",
  primaryKeyword: "Target phrase",
};
function readable(value: unknown, field: string, blogUrl: string) {
  if (value === null || value === undefined || value === "") return "(not set)";
  if (field === "content" && typeof value === "string")
    try {
      const links = documentLinks(value, blogUrl)
        .map((l) => l.anchor + " → " + l.href)
        .join("\n");
      const images: string[] = [];
      const collect = (
        blocks: {
          type: string;
          props?: { caption?: string; url?: string };
          children?: unknown[];
        }[],
      ) => {
        for (const block of blocks) {
          if (block.type === "image")
            images.push(
              "Image: " +
                (block.props?.caption ?? "") +
                " " +
                (block.props?.url ?? ""),
            );
          if (block.children)
            collect(block.children as Parameters<typeof collect>[0]);
        }
      };
      collect(JSON.parse(value));
      return (
        documentText(value) +
        (images.length ? "\n\n" + images.join("\n") : "") +
        (links ? "\n\nLinks:\n" + links : "")
      );
    } catch {
      return "The content cannot be previewed.";
    }
  return String(value);
}
function Proposal({
  proposal,
  post,
  projectId,
  runId,
  blogUrl,
  enabled,
  onApplied,
}: {
  proposal: AgentProposal;
  post: Post;
  projectId: string;
  runId: string;
  blogUrl: string;
  enabled: boolean;
  onApplied?: () => Promise<void>;
}) {
  const qc = useQueryClient(),
    fields = Object.keys(
      proposal.changes,
    ) as (keyof AgentProposal["changes"])[];
  const [selected, setSelected] = React.useState(fields);
  const review = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      api.agents.review(projectId, runId, proposal.id, action, selected),
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: api.queryKey(["agent-run", projectId, runId]),
        }),
        qc.invalidateQueries({
          queryKey: api.queryKey(["posts", projectId, post.id]),
        }),
      ]);
      if (result.state === "accepted") await onApplied?.();
    },
  });
  const stale = post.revision !== proposal.baseRevision;
  if (proposal.state !== "pending")
    return <p className="text-sm">Proposal {proposal.state}.</p>;
  return (
    <div className="space-y-4">
      {stale ? (
        <p role="alert" className="text-sm text-amber-800">
          The saved draft changed after these suggestions were prepared. Start a
          new request.
        </p>
      ) : null}
      {fields.map((field) => (
        <div className="space-y-2 rounded-lg border p-3" key={field}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={selected.includes(field)}
              disabled={stale || !enabled}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, field]
                    : old.filter((f) => f !== field),
                )
              }
            />
            {labels[field] ?? field}
          </label>
          <div className="grid gap-3 text-sm lg:grid-cols-2">
            <div className="rounded bg-red-50 p-3 text-red-950">
              <p className="mb-2 text-xs font-semibold">Before</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">
                {readable(post[field], field, blogUrl)}
              </pre>
            </div>
            <div className="rounded bg-green-50 p-3 text-green-950">
              <p className="mb-2 text-xs font-semibold">Proposed</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">
                {readable(proposal.changes[field], field, blogUrl)}
              </pre>
            </div>
          </div>
        </div>
      ))}
      {!fields.length ? (
        <p className="text-sm">
          The assistant provided advice without proposing edits.
        </p>
      ) : null}
      <ErrorMessage error={review.error} />
      <div className="flex gap-2">
        <Button
          disabled={!enabled || stale || review.isPending || !selected.length}
          onClick={() => review.mutate("accept")}
        >
          Apply selected to draft
        </Button>
        <Button
          variant="outline"
          disabled={!enabled || review.isPending}
          onClick={() => review.mutate("reject")}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
