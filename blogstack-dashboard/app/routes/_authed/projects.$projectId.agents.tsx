import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePosts } from "@blogstack/sdk/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AgentPanel, AgentReview } from "../../components/agent-panel";
import { ErrorMessage, Panel, fieldClass } from "../../components/feedback";
export const Route = createFileRoute("/_authed/projects/$projectId/agents")({
  component: Agents,
});
function Agents() {
  const { projectId } = Route.useParams(),
    posts = usePosts(api, projectId, { limit: 100 }),
    [postId, setPostId] = React.useState(""),
    [history, setHistory] = React.useState<string | null>(null);
  const runs = useQuery({
    queryKey: api.queryKey(["agent-runs", projectId]),
    queryFn: () => api.agents.list(projectId),
    refetchInterval: 5000,
  });
  const selected = postId || posts.data?.data[0]?.id;
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">AI assistants</h2>
      <ErrorMessage error={posts.error || runs.error} />
      <label className="block text-sm">
        Choose a saved article
        <select
          className={fieldClass + " mt-2 max-w-lg"}
          value={selected ?? ""}
          onChange={(e) => setPostId(e.target.value)}
        >
          <option value="" disabled>
            Select an article
          </option>
          {posts.data?.data.map((p) => (
            <option value={p.id} key={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <AgentPanel key={selected} projectId={projectId} postId={selected} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Create an article draft to start using the assistants.
        </p>
      )}
      <Panel title="Recent requests">
        <ul className="divide-y">
          {runs.data?.map((run) => (
            <li key={run.id}>
              <button
                className="flex w-full justify-between gap-3 py-3 text-left text-sm"
                onClick={() => setHistory(run.id)}
              >
                <span>
                  {run.profile} ·{" "}
                  {new Date(run.createdAt * 1000).toLocaleString()}
                </span>
                <span>
                  {run.status} · {run.credits} credits
                </span>
              </button>
            </li>
          ))}
        </ul>
        {history ? <AgentReview projectId={projectId} runId={history} /> : null}
      </Panel>
    </div>
  );
}
