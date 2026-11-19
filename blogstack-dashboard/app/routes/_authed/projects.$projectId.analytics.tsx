import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Panel, ErrorMessage } from "../../components/feedback";
export const Route = createFileRoute("/_authed/projects/$projectId/analytics")({
  component: Analytics,
});
function Analytics() {
  const { projectId } = Route.useParams(),
    [days, setDays] = React.useState(30);
  const report = useQuery({
    queryKey: api.queryKey(["analytics", projectId, days]),
    queryFn: () => api.analytics.get(projectId, days),
    staleTime: 60000,
  });
  const data = report.data;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Reader activity</h2>
        <select
          aria-label="Analytics date range"
          className="rounded border bg-background p-2"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[7, 30, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage error={report.error} />
      {report.isLoading ? <p role="status">Loading activity…</p> : null}
      {data ? (
        <>
          <p className="text-sm text-muted-foreground">
            Showing {data.days} days of your {data.historyDays}-day reporting
            history. {data.sampled ? "Sampled totals are estimates." : ""}{" "}
            {!data.liveAvailable
              ? "Recent activity is temporarily unavailable; saved history is shown."
              : ""}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Page views", data.views],
              ["Article link clicks", data.clicks],
              [
                "Clicks per 100 views",
                Math.round(data.clicksPer100Views * 10) / 10,
              ],
            ].map(([label, value]) => (
              <Panel key={label} title={String(label)}>
                <p className="text-3xl font-semibold tabular-nums">
                  {Number(value).toLocaleString()}
                </p>
              </Panel>
            ))}
          </div>
          <Panel title="Daily activity">
            {data.daily.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="p-2">Date</th>
                      <th>Views</th>
                      <th>Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((day) => (
                      <tr className="border-t" key={day.day}>
                        <td className="p-2">{day.day}</td>
                        <td>{Math.round(day.views).toLocaleString()}</td>
                        <td>{Math.round(day.clicks).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Activity appears after readers visit an article with tracking
                enabled.
              </p>
            )}
          </Panel>
          <Panel title="Popular articles">
            {data.posts.length ? (
              <ul className="divide-y">
                {data.posts.map((post) => (
                  <li
                    className="flex justify-between gap-4 py-2 text-sm"
                    key={post.postId}
                  >
                    <span>{post.title}</span>
                    <span>
                      {Math.round(post.views).toLocaleString()} views ·{" "}
                      {Math.round(post.clicks).toLocaleString()} clicks
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No article activity yet.
              </p>
            )}
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Referrers">
              <ActivityList rows={data.referrers} />
            </Panel>
            <Panel title="Clicked destinations">
              <ActivityList rows={data.destinations} />
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
function ActivityList({ rows }: { rows: { name: string; total: number }[] }) {
  return rows.length ? (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.name} className="flex justify-between gap-4 py-2 text-sm">
          <span className="break-all">{row.name}</span>
          <span className="tabular-nums">
            {Math.round(row.total).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">No activity yet.</p>
  );
}
