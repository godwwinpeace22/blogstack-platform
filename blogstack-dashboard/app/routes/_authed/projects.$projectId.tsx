import * as React from "react";
import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@blogstack/ui";
import { useProject, useProjectStats } from "@blogstack/sdk/react";

import { api } from "../../lib/api";

export const Route = createFileRoute("/_authed/projects/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { data: project } = useProject(api, projectId);
  const { data: stats } = useProjectStats(api, projectId);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/projects"
          className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Projects
        </Link>
        <h1 className="text-2xl font-bold">{project?.name ?? "…"}</h1>
        <p className="text-sm text-muted-foreground">
          {project?.settings?.blogUrl ?? "Set your website URL in settings"}
        </p>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-3">
          <StatCard label="Total posts" value={stats.postCount} />
          <StatCard label="Published" value={stats.publishedCount} />
          <StatCard label="Drafts" value={stats.draftCount} />
          <StatCard label="Views (30d)" value={stats.viewsThisMonth} />
        </div>
      )}

      {/* Tab navigation */}
      <div className="mb-6 flex overflow-x-auto border-b">
        <TabLink
          to="/projects/$projectId"
          params={{ projectId }}
          activeOptions={{ exact: true }}
        >
          Posts
        </TabLink>
        {project?.role === "project_admin" ? (
          <TabLink to="/projects/$projectId/api-keys" params={{ projectId }}>
            API keys
          </TabLink>
        ) : null}
        {project?.role === "project_admin" ? (
          <TabLink to="/projects/$projectId/members" params={{ projectId }}>
            Members
          </TabLink>
        ) : null}
        <TabLink to="/projects/$projectId/analytics" params={{ projectId }}>
          Analytics
        </TabLink>
        <TabLink to="/projects/$projectId/links" params={{ projectId }}>
          Links
        </TabLink>
        <TabLink to="/projects/$projectId/agents" params={{ projectId }}>
          AI assistants
        </TabLink>
        {project?.role === "project_admin" ? (
          <TabLink to="/projects/$projectId/settings" params={{ projectId }}>
            Settings
          </TabLink>
        ) : null}
      </div>

      <Outlet />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function TabLink({
  to,
  params,
  activeOptions,
  children,
}: {
  to:
    | "/projects/$projectId"
    | "/projects/$projectId/api-keys"
    | "/projects/$projectId/members"
    | "/projects/$projectId/analytics"
    | "/projects/$projectId/links"
    | "/projects/$projectId/agents"
    | "/projects/$projectId/settings";
  params: { projectId: string };
  activeOptions?: { exact?: boolean };
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params}
      {...(activeOptions ? { activeOptions } : {})}
      className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:border-primary [&.active]:text-foreground"
    >
      {children}
    </Link>
  );
}
