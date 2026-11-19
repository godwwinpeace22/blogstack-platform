import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@blogstack/ui";
import { apiBase } from "../../lib/api";
import { useSession } from "../../lib/auth-client";
import { Panel, ErrorMessage } from "../../components/feedback";

export const Route = createFileRoute("/_authed/operations")({
  component: OperationsPage,
});
type Status = {
  enabled: boolean;
  schedule: { at: number } | null;
  health: { at: number; issues: { code: string; message: string }[] } | null;
  deliveryTests: {
    incident: { emailId: string; at: number } | null;
    recovery: { emailId: string; at: number } | null;
  };
  runs: {
    id: string;
    kind: string;
    status: string;
    created_at: number;
    completed_at: number | null;
    error_code: string | null;
  }[];
};
async function request<T = unknown>(
  action: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(apiBase + "/internal/operations/" + action, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Operations request failed");
  return data;
}
const format = (time: number | null | undefined) =>
  time
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Lagos",
      }).format(time * 1000) + " WAT"
    : "Not yet";
function OperationsPage() {
  const session = useSession();
  const qc = useQueryClient();
  const key = ["operations", session.data?.user.id];
  const status = useQuery({
    queryKey: key,
    queryFn: () => request<Status>("status"),
    refetchInterval: 15000,
  });
  const testId = React.useRef(crypto.randomUUID());
  const action = useMutation({
    mutationFn: ({ name, body }: { name: string; body: unknown }) =>
      request(name, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
    },
  });
  const enabled = status.data?.enabled && !action.isPending;
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-10">
      <header>
        <h1 className="text-2xl font-semibold">Operations</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Private owner controls for backups and service health. Times are shown
          for Lagos.
        </p>
      </header>
      <ErrorMessage error={status.error || action.error} />
      {status.isPending ? <p role="status">Loading operations…</p> : null}
      {status.data && !status.data.enabled ? (
        <p role="status">Operations are not enabled yet.</p>
      ) : null}
      <Panel title="Service health">
        <p className="text-sm">
          Last scheduled heartbeat: {format(status.data?.schedule?.at)}
        </p>
        <p className="text-sm">Last check: {format(status.data?.health?.at)}</p>
        {status.data?.health?.issues.length ? (
          <ul className="space-y-2 text-sm">
            {status.data.health.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        ) : status.data?.health ? (
          <p role="status" className="text-sm">
            All monitored services are healthy.
          </p>
        ) : null}
        <Button
          disabled={!enabled}
          onClick={() => action.mutate({ name: "monitor", body: {} })}
        >
          Check services now
        </Button>
      </Panel>
      <Panel title="Automated backups">
        <p className="text-sm">
          Daily at 03:00 WAT. Daily snapshots are kept for 30 days; Sunday
          snapshots for 90 days. Media versions are copied incrementally to a
          separate private bucket.
        </p>
        <Button
          disabled={!enabled}
          onClick={() => action.mutate({ name: "backup", body: {} })}
        >
          Run backup now
        </Button>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-2">Backup</th>
                <th>Type</th>
                <th>Status</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {status.data?.runs.map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="py-3 font-mono">{run.id.slice(0, 8)}</td>
                  <td>{run.kind}</td>
                  <td>
                    {run.status}
                    {run.error_code ? " · " + run.error_code : ""}
                  </td>
                  <td>{format(run.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Alert delivery">
        <p className="text-sm">
          Checks run every five minutes. Alerts are sent when problems change or
          clear; unchanged problems do not send repeated emails.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!enabled}
            onClick={() =>
              action.mutate({
                name: "test-alert",
                body: { phase: "incident", testId: testId.current },
              })
            }
          >
            Send alert test
          </Button>
          <Button
            variant="outline"
            disabled={!enabled}
            onClick={() =>
              action.mutate({
                name: "test-alert",
                body: { phase: "recovery", testId: testId.current },
              })
            }
          >
            Send recovery test
          </Button>
        </div>
        <p className="text-sm">
          Incident delivery test:{" "}
          {format(status.data?.deliveryTests.incident?.at)}
        </p>
        <p className="text-sm">
          Recovery delivery test:{" "}
          {format(status.data?.deliveryTests.recovery?.at)}
        </p>
      </Panel>
    </div>
  );
}
