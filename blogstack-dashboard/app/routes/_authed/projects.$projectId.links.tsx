import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@blogstack/sdk/react";
import { Button, Badge } from "@blogstack/ui";
import { api } from "../../lib/api";
import { ErrorMessage, Panel, fieldClass } from "../../components/feedback";
export const Route = createFileRoute("/_authed/projects/$projectId/links")({
  component: Links,
});
function Links() {
  const { projectId } = Route.useParams();
  return <LinkInventory key={projectId} projectId={projectId} />;
}
type LinkStatus =
  | "unchecked"
  | "healthy"
  | "broken"
  | "redirected"
  | "inconclusive"
  | "unsafe";
function LinkInventory({ projectId }: { projectId: string }) {
  const qc = useQueryClient(),
    project = useProject(api, projectId);
  const [status, setStatus] = React.useState<LinkStatus | "">(""),
    [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const report = useQuery({
    queryKey: api.queryKey(["links", projectId, status, cursor]),
    queryFn: () =>
      api.links.get(projectId, {
        ...(cursor ? { cursor } : {}),
        ...(status ? { status } : {}),
      }),
    refetchInterval: (query) =>
      query.state.data?.scans.some((s) =>
        ["queued", "running"].includes(s.status),
      )
        ? 2000
        : false,
  });
  const scan = useMutation({
    mutationFn: () => api.links.scan(projectId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: api.queryKey(["links", projectId]) }),
  });
  const ignore = useMutation({
    mutationFn: ({ id, ignored }: { id: string; ignored: boolean }) =>
      api.links.ignore(projectId, id, ignored),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: api.queryKey(["links", projectId]) }),
  });
  const canEdit = project.data?.canWrite && project.data.role !== "writer";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Link health</h2>
          <p className="text-sm text-muted-foreground">
            Checks run in the background. Cached results are reused for 24
            hours.
          </p>
        </div>
        <Button
          disabled={!canEdit || scan.isPending}
          onClick={() => scan.mutate()}
        >
          {scan.isPending ? "Starting…" : "Check links"}
        </Button>
      </div>
      <ErrorMessage error={report.error || scan.error || ignore.error} />
      {report.data?.scans[0] ? (
        <p role="status" className="text-sm">
          Latest scan: {report.data.scans[0].status} ·{" "}
          {report.data.scans[0].checked} external checks
          {report.data.scans[0].error ? " · " + report.data.scans[0].error : ""}
        </p>
      ) : null}
      <Panel title="Article links">
        <label className="block max-w-xs text-sm">
          Result
          <select
            className={fieldClass + " mt-1"}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as LinkStatus | "");
              setCursors([undefined]);
            }}
          >
            <option value="">All results</option>
            {(
              [
                "unchecked",
                "healthy",
                "broken",
                "redirected",
                "inconclusive",
                "unsafe",
              ] as const
            ).map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {report.isLoading ? <p role="status">Loading links…</p> : null}
        {report.data && !report.data.links.length ? (
          <p className="text-sm text-muted-foreground">
            {status
              ? "No links match this result."
              : "Links appear after articles are published and indexed."}
          </p>
        ) : null}
        <ul className="divide-y">
          {report.data?.links.map((link) => (
            <li
              className="flex flex-wrap items-start justify-between gap-3 py-4"
              key={link.id}
            >
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">
                  {link.anchor || link.url}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {link.url}
                </p>
                {link.finalUrl && link.finalUrl !== link.url ? (
                  <p className="break-all text-xs text-muted-foreground">
                    Destination: {link.finalUrl}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.kind}
                  {link.insecure ? " · Insecure HTTP" : ""}
                  {link.checkedAt
                    ? " · Checked " +
                      new Date(link.checkedAt * 1000).toLocaleString()
                    : ""}
                </p>
                <Link
                  className="text-xs underline"
                  to="/projects/$projectId/posts/$postId"
                  params={{ projectId, postId: link.postId }}
                >
                  Open source article
                </Link>
              </div>
              <Badge
                variant={
                  link.status === "broken" || link.status === "unsafe"
                    ? "destructive"
                    : "secondary"
                }
              >
                {link.ignored ? "Ignored" : link.status}
                {link.httpStatus ? " · " + link.httpStatus : ""}
              </Badge>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ignore.isPending}
                  onClick={() =>
                    ignore.mutate({ id: link.id, ignored: !link.ignored })
                  }
                >
                  {link.ignored ? "Include" : "Ignore"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {cursors.length > 1 || report.data?.nextCursor ? (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={cursors.length === 1 || report.isFetching}
              onClick={() => setCursors((old) => old.slice(0, -1))}
            >
              Previous
            </Button>
            <span className="text-sm">Page {cursors.length}</span>
            <Button
              variant="outline"
              disabled={!report.data?.nextCursor || report.isFetching}
              onClick={() => {
                const next = report.data?.nextCursor;
                if (next) setCursors((old) => [...old, next]);
              }}
            >
              Next
            </Button>
          </div>
        ) : null}
      </Panel>
      <Panel title="Articles needing internal links">
        <p className="text-sm text-muted-foreground">
          These published articles have no incoming links from other indexed
          articles. The linking assistant can suggest relevant places to
          reference them.
        </p>
        <ul className="list-inside list-disc text-sm">
          {report.data?.orphaned.map((post) => (
            <li key={post.id}>
              <Link
                className="underline"
                to="/projects/$projectId/posts/$postId"
                params={{ projectId, postId: post.id }}
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
