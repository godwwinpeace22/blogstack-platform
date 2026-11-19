import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useProject, useUpdateProject, useMedia } from "@blogstack/sdk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@blogstack/sdk";
import { Button, Input, Label } from "@blogstack/ui";
import { api } from "../../lib/api";
import {
  ErrorMessage,
  Panel,
  fieldClass,
  downloadJson,
} from "../../components/feedback";
export const Route = createFileRoute("/_authed/projects/$projectId/settings")({
  component: Settings,
});
function Settings() {
  const { projectId } = Route.useParams(),
    project = useProject(api, projectId);
  return (
    <div className="space-y-5">
      <ErrorMessage error={project.error} />
      {project.data ? (
        <SettingsForm key={project.data.id} project={project.data} />
      ) : (
        <p role="status">Loading settings…</p>
      )}
    </div>
  );
}
function SettingsForm({ project }: { project: Project }) {
  const qc = useQueryClient(),
    [name, setName] = React.useState(project.name),
    [url, setUrl] = React.useState(project.settings?.blogUrl ?? "");
  const [workspaceName, setWorkspaceName] = React.useState(
      project.settings?.workspaceName ?? project.name,
    ),
    [logoUrl, setLogoUrl] = React.useState(project.settings?.logoUrl ?? "");
  const [hide, setHide] = React.useState(
      project.settings?.hideAttribution ?? false,
    ),
    [tracking, setTracking] = React.useState(
      project.settings?.analyticsEnabled !== false,
    );
  const [message, setMessage] = React.useState("");
  const update = useUpdateProject(api, {
    onSuccess: () => setMessage("Settings saved."),
  });
  const exportData = useMutation({
    mutationFn: () => api.projects.export(project.id),
    onSuccess: (data) =>
      downloadJson("blogstack-" + project.slug + ".json", data),
  });
  const canEdit = project.role === "project_admin" && project.canWrite;
  function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    update.mutate({
      projectId: project.id,
      data: {
        name,
        settings: {
          blogUrl: url,
          analyticsEnabled: tracking,
          ...(project.canCustomizeBranding
            ? { workspaceName, logoUrl: logoUrl || null, hideAttribution: hide }
            : {}),
        },
      },
    });
  }
  return (
    <>
      <Panel title="Website and publishing">
        <form className="space-y-4" onSubmit={save}>
          <div className="space-y-1">
            <Label htmlFor="blog-name">Blog name</Label>
            <Input
              id="blog-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="blog-url">Website blog URL</Label>
            <Input
              id="blog-url"
              type="url"
              placeholder="https://yourwebsite.com/blog"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground">
              The blog section on your own website. Used for article links,
              feeds and SEO.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tracking}
              onChange={(e) => setTracking(e.target.checked)}
              disabled={!canEdit}
            />
            Enable reader and link-click analytics
          </label>
          <fieldset
            className="space-y-4 rounded-lg border p-4"
            disabled={!canEdit || !project.canCustomizeBranding}
          >
            <legend className="px-1 text-sm font-medium">
              Agency branding
            </legend>
            <Label htmlFor="workspace-name">Client workspace name</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
            />
            <Label htmlFor="workspace-logo">Logo URL</Label>
            <Input
              id="workspace-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hide}
                onChange={(e) => setHide(e.target.checked)}
              />
              Remove default blog attribution
            </label>
          </fieldset>
          {!project.canCustomizeBranding ? (
            <p className="text-sm text-muted-foreground">
              Studio and Growth include agency workspace branding. Editable
              frontend source remains customizable on every plan.
            </p>
          ) : null}
          <ErrorMessage error={update.error} />
          {message ? (
            <p role="status" className="text-sm">
              {message}
            </p>
          ) : null}
          <Button type="submit" disabled={!canEdit || update.isPending}>
            {update.isPending ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </Panel>
      <Panel title="Install your blog">
        <p className="text-sm">
          Project slug: <code>{project.slug}</code>
        </p>
        <p className="text-sm text-muted-foreground">
          Use the Next.js reference integration for server-rendered articles,
          metadata, sitemap and RSS. Public reads do not require a private API
          key.
        </p>
        <a
          className="text-sm underline"
          href="https://blogstack-docs.hidden-silence-2d18.workers.dev/docs/quickstart"
          target="_blank"
          rel="noopener noreferrer"
        >
          Installation guide
        </a>
      </Panel>
      <Panel title="Export your content">
        <p className="text-sm text-muted-foreground">
          Download posts, saved drafts, tags and a media manifest. Media files
          can be downloaded below, including during the export retention period.
        </p>
        <ErrorMessage error={exportData.error} />
        <Button
          variant="outline"
          disabled={exportData.isPending || project.role !== "project_admin"}
          onClick={() => exportData.mutate()}
        >
          Download content export
        </Button>
      </Panel>
      <MediaLibrary project={project} />
    </>
  );
}
function MediaLibrary({ project }: { project: Project }) {
  const qc = useQueryClient(),
    [cursor, setCursor] = React.useState<string | undefined>(),
    media = useMedia(api, project.id, {
      limit: 30,
      ...(cursor ? { cursor } : {}),
    });
  const remove = useMutation({
    mutationFn: (id: string) => api.media.delete(project.id, id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: api.queryKey(["media", project.id]) }),
  });
  return (
    <Panel title="Media library">
      <ErrorMessage error={media.error || remove.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {media.data?.data.map((file) => (
          <div key={file.id} className="space-y-2 rounded-lg border p-3">
            <img
              src={file.url}
              alt={file.filename}
              className="h-32 w-full rounded object-contain"
            />
            <p className="truncate text-xs">{file.filename}</p>
            <div className="flex gap-3">
              <a
                className="text-sm underline"
                href={api.media.downloadUrl(project.id, file.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
              {project.role === "project_admin" ? (
                <button
                  className="text-sm text-destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this image? Articles using it will lose the image.",
                      )
                    )
                      remove.mutate(file.id);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {!media.isLoading && !media.data?.data.length ? (
        <p className="text-sm text-muted-foreground">
          Uploaded article images appear here.
        </p>
      ) : null}
      <div className="flex gap-2">
        {cursor ? (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            First page
          </Button>
        ) : null}
        {media.data?.nextCursor ? (
          <Button
            variant="outline"
            onClick={() => setCursor(media.data!.nextCursor!)}
          >
            Next images
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
