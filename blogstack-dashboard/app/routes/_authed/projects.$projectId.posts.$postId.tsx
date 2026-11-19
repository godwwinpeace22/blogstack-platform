import * as React from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePost, useProject, useTags } from "@blogstack/sdk/react";
import type { Post, UpdatePostRequest } from "@blogstack/sdk";
import { Button, Input, Label, BlogContent, Badge } from "@blogstack/ui";
import { toast } from "sonner";
import { useSession } from "../../lib/auth-client";
import { api } from "../../lib/api";
import { AgentPanel } from "../../components/agent-panel";
import {
  ErrorMessage,
  Panel,
  fieldClass,
  downloadJson,
} from "../../components/feedback";
const Editor = React.lazy(() =>
  import("@blogstack/editor").then((module) => ({
    default: module.BlogStackEditor,
  })),
);
export const Route = createFileRoute(
  "/_authed/projects/$projectId/posts/$postId",
)({ component: PostEditor });
function PostEditor() {
  const { data: session } = useSession();
  const { projectId, postId } = Route.useParams(),
    post = usePost(api, projectId, postId),
    project = useProject(api, projectId),
    qc = useQueryClient(),
    [reload, setReload] = React.useState(0);
  async function refresh() {
    const latest = await api.posts.get(projectId, postId);
    qc.setQueryData(api.queryKey(["posts", projectId, postId]), latest);
    setReload((v) => v + 1);
  }
  if (post.error) return <ErrorMessage error={post.error} />;
  if (!post.data || !project.data) return <p role="status">Loading article…</p>;
  const canEdit =
    project.data.canWrite &&
    (project.data.role !== "writer" || post.data.authorId === session?.user.id);
  return (
    <EditorSession
      key={postId + ":" + reload}
      post={post.data}
      canEdit={canEdit}
      canPublish={project.data.role !== "writer" && project.data.canWrite}
      blogUrl={project.data.settings?.blogUrl ?? ""}
      onReload={refresh}
    />
  );
}
type Editable = Omit<UpdatePostRequest, "revision">;
function editable(post: Post): Editable {
  return {
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    coverImage: post.coverImage,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    canonicalUrl: post.canonicalUrl,
    noIndex: post.noIndex,
    primaryKeyword: post.primaryKeyword,
    tagIds: post.tagIds,
  };
}
function EditorSession({
  post,
  canEdit,
  canPublish,
  blogUrl,
  onReload,
}: {
  post: Post;
  canEdit: boolean;
  canPublish: boolean;
  blogUrl: string;
  onReload: () => Promise<void>;
}) {
  const qc = useQueryClient(),
    [data, setData] = React.useState<Editable>(() => editable(post)),
    [revision, setRevision] = React.useState(post.revision),
    [status, setStatus] = React.useState(post.status);
  const [saving, setSaving] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [uploading, setUploading] = React.useState(0),
    [error, setError] = React.useState<unknown>(null),
    [preview, setPreview] = React.useState<string | null>(null),
    [tagName, setTagName] = React.useState("");
  const latest = React.useRef(data),
    saved = React.useRef(JSON.stringify(data)),
    version = React.useRef(post.revision),
    flight = React.useRef<Promise<Post> | null>(null);
  latest.current = data;
  const dirty = JSON.stringify(data) !== saved.current;
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  const conflicted = React.useRef(false);
  const flush = React.useCallback(
    async function save(): Promise<void> {
      if (!canEdit || conflicted.current) {
        if (dirtyRef.current)
          throw new Error("Reload this draft before saving.");
        return;
      }
      if (flight.current) {
        await flight.current;
        return save();
      }
      const snapshot = latest.current,
        serialized = JSON.stringify(snapshot);
      if (serialized === saved.current) return;
      setSaving(true);
      setError(null);
      const pending = api.posts.update(post.projectId, post.id, {
        ...snapshot,
        revision: version.current,
      });
      flight.current = pending;
      try {
        const updated = await pending;
        version.current = updated.revision;
        saved.current = serialized;
        setRevision(updated.revision);
        setStatus(updated.status);
        qc.setQueryData(
          api.queryKey(["posts", post.projectId, post.id]),
          updated,
        );
      } catch (cause) {
        if (cause instanceof Error && "status" in cause && cause.status === 409)
          conflicted.current = true;
        setError(cause);
        throw cause;
      } finally {
        flight.current = null;
        setSaving(false);
      }
      if (JSON.stringify(latest.current) !== saved.current) return save();
    },
    [post.projectId, post.id, canEdit, qc],
  );
  React.useEffect(() => {
    if (!dirty || !canEdit || conflicted.current) return;
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [data, dirty, canEdit, flush]);
  useBlocker({
    shouldBlockFn: async () => {
      if (!dirtyRef.current && !flight.current) return false;
      try {
        await flush();
        return false;
      } catch {
        return !window.confirm(
          "Your changes could not be saved. Leave without saving them?",
        );
      }
    },
    enableBeforeUnload: () => dirtyRef.current || !!flight.current,
  });
  const seo = useQuery({
    queryKey: api.queryKey(["seo", post.projectId, post.id, revision]),
    queryFn: () => api.seo.analyze(post.projectId, post.id),
  });
  const tags = useTags(api, post.projectId);
  function patch(change: Partial<Editable>) {
    setData((previous) => ({ ...previous, ...change }));
    setPreview(null);
  }
  async function action(type: "publish" | "unpublish" | "preview") {
    setBusy(true);
    setError(null);
    try {
      await flush();
      if (type === "preview") {
        const result = await api.posts.preview(post.projectId, post.id);
        setPreview(result.renderedHtml);
        return;
      }
      const updated =
        type === "publish"
          ? await api.posts.publish(post.projectId, post.id, version.current)
          : await api.posts.unpublish(post.projectId, post.id);
      qc.setQueryData(
        api.queryKey(["posts", post.projectId, post.id]),
        updated,
      );
      setStatus(updated.status);
      toast.success(
        type === "publish" ? "Article published" : "Article unpublished",
      );
      void qc.invalidateQueries({
        queryKey: api.queryKey(["posts", post.projectId]),
      });
      void qc.invalidateQueries({
        queryKey: api.queryKey(["projects", post.projectId, "stats"]),
      });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setUploading((n) => n + 1);
    try {
      const media = await api.media.upload(post.projectId, file);
      if (!latest.current.coverImage) patch({ coverImage: media.url });
      return media.url;
    } catch (cause) {
      setError(cause);
      throw cause;
    } finally {
      setUploading((n) => n - 1);
    }
  }
  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    try {
      const tag = await api.tags.create(post.projectId, { name: tagName });
      patch({ tagIds: [...(latest.current.tagIds ?? []), tag.id] });
      setTagName("");
      await qc.invalidateQueries({
        queryKey: api.queryKey(["tags", post.projectId]),
      });
    } catch (cause) {
      setError(cause);
    }
  }
  return (
    <div className="space-y-5">
      <Link
        to="/projects/$projectId"
        params={{ projectId: post.projectId }}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← All articles
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge>{status}</Badge>
          <span role="status" className="text-xs text-muted-foreground">
            {saving
              ? "Saving…"
              : error
                ? "Not saved"
                : dirty
                  ? "Unsaved changes"
                  : "Saved"}
            {uploading ? " · Uploading image…" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !!uploading}
            onClick={() => void action("preview")}
          >
            Preview
          </Button>
          <Button
            variant="outline"
            disabled={!canEdit || busy || !!uploading}
            onClick={() => void flush().catch(() => {})}
          >
            Save draft
          </Button>
          {status === "published" ? (
            <Button
              variant="outline"
              disabled={!canPublish || busy}
              onClick={() => void action("unpublish")}
            >
              Unpublish
            </Button>
          ) : null}
          <Button
            disabled={!canPublish || busy || !!uploading || !blogUrl}
            onClick={() => void action("publish")}
          >
            {busy
              ? "Working…"
              : status === "published"
                ? "Publish changes"
                : "Publish"}
          </Button>
        </div>
      </header>
      <ErrorMessage error={error} />
      {conflicted.current ? (
        <div className="flex flex-wrap gap-3 rounded border p-3">
          <Button
            variant="outline"
            onClick={() => downloadJson("unsaved-draft.json", data)}
          >
            Download local changes
          </Button>
          <Button onClick={() => void onReload()}>Reload latest draft</Button>
        </div>
      ) : null}
      {!blogUrl ? (
        <p className="text-sm text-amber-800">
          Set your website blog URL in project settings before publishing.
        </p>
      ) : null}
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          This article is read-only for your current access.
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <fieldset className="space-y-4" disabled={!canEdit || busy}>
            <div>
              <Label htmlFor="article-title">Title</Label>
              <Input
                id="article-title"
                className="mt-1 text-xl"
                value={data.title ?? ""}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="article-slug">Slug</Label>
              <Input
                id="article-slug"
                className="mt-1"
                value={data.slug ?? ""}
                pattern="[a-z0-9-]+"
                disabled={post.everPublished}
                onChange={(e) => patch({ slug: e.target.value })}
              />
              {post.everPublished ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  The published URL stays fixed to preserve existing links.
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border bg-background p-3">
              <React.Suspense
                fallback={
                  <p role="status" className="p-6">
                    Loading editor…
                  </p>
                }
              >
                <Editor
                  postId={post.id}
                  projectId={post.projectId}
                  initialContent={JSON.parse(post.content)}
                  readOnly={!canEdit || busy}
                  uploadFile={upload}
                  onChange={(event) =>
                    patch({ content: JSON.stringify(event.blocks) })
                  }
                />
              </React.Suspense>
            </div>
          </fieldset>
          <Panel title="Article details">
            <fieldset className="space-y-4" disabled={!canEdit || busy}>
              <label className="block text-sm">
                Excerpt
                <textarea
                  className={fieldClass + " mt-1"}
                  maxLength={2000}
                  value={data.excerpt ?? ""}
                  onChange={(e) => patch({ excerpt: e.target.value || null })}
                />
              </label>
              <label className="block text-sm">
                Cover image URL
                <Input
                  className="mt-1"
                  type="url"
                  value={data.coverImage ?? ""}
                  onChange={(e) =>
                    patch({ coverImage: e.target.value || null })
                  }
                />
              </label>
              <label className="block text-sm">
                Upload an image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="mt-2 block text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void upload(file)
                        .then((url) => patch({ coverImage: url }))
                        .catch(() => {});
                    e.target.value = "";
                  }}
                />
              </label>
              {data.coverImage ? (
                <img
                  src={data.coverImage}
                  alt="Selected article cover"
                  className="max-h-52 rounded object-contain"
                />
              ) : null}
              <div className="space-y-2">
                <p className="text-sm">Tags</p>
                {tags.data?.map((tag) => (
                  <label
                    className="mr-3 inline-flex items-center gap-1 text-sm"
                    key={tag.id}
                  >
                    <input
                      type="checkbox"
                      checked={data.tagIds?.includes(tag.id) ?? false}
                      onChange={(e) =>
                        patch({
                          tagIds: e.target.checked
                            ? [...(data.tagIds ?? []), tag.id]
                            : (data.tagIds ?? []).filter((id) => id !== tag.id),
                        })
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {canEdit ? (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => void addTag(e)}
              >
                <Input
                  aria-label="New tag name"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="New tag"
                  required
                />
                <Button variant="outline" type="submit">
                  Add tag
                </Button>
              </form>
            ) : null}
          </Panel>
          {preview !== null ? (
            <Panel title="Private preview">
              <p className="text-xs text-muted-foreground">
                This preview is not published or indexed.
              </p>
              <h1 className="text-3xl font-semibold">{data.title}</h1>
              <BlogContent html={preview} />
            </Panel>
          ) : null}
          <AgentPanel
            projectId={post.projectId}
            postId={post.id}
            beforeRequest={flush}
            onApplied={onReload}
          />
        </div>
        <aside className="space-y-5">
          <Panel title="Search appearance">
            <fieldset className="space-y-3" disabled={!canEdit || busy}>
              <label className="block text-sm">
                Search title
                <Input
                  className="mt-1"
                  value={data.seoTitle ?? ""}
                  maxLength={200}
                  onChange={(e) => patch({ seoTitle: e.target.value || null })}
                />
              </label>
              <label className="block text-sm">
                Search description
                <textarea
                  className={fieldClass + " mt-1"}
                  value={data.seoDescription ?? ""}
                  maxLength={500}
                  onChange={(e) =>
                    patch({ seoDescription: e.target.value || null })
                  }
                />
              </label>
              <label className="block text-sm">
                Optional target phrase
                <Input
                  className="mt-1"
                  value={data.primaryKeyword ?? ""}
                  onChange={(e) =>
                    patch({ primaryKeyword: e.target.value || null })
                  }
                />
              </label>
              <label className="block text-sm">
                Canonical URL override
                <Input
                  className="mt-1"
                  type="url"
                  placeholder="Use the article URL"
                  value={data.canonicalUrl ?? ""}
                  onChange={(e) =>
                    patch({ canonicalUrl: e.target.value || null })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data.noIndex ?? false}
                  onChange={(e) => patch({ noIndex: e.target.checked })}
                />
                Exclude from search indexing
              </label>
            </fieldset>
            <div className="rounded-lg border p-3">
              <p className="break-all text-xs text-green-800">
                {data.canonicalUrl || blogUrl + "/" + data.slug}
              </p>
              <p className="mt-1 text-lg text-blue-800">
                {data.seoTitle || data.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.seoDescription ||
                  data.excerpt ||
                  "Add a search description."}
              </p>
            </div>
          </Panel>
          <Panel title="SEO checks">
            <ErrorMessage error={seo.error} />
            {dirty ? (
              <p className="text-xs text-muted-foreground">
                Checks update after the draft is saved.
              </p>
            ) : null}
            <ul className="space-y-3">
              {seo.data?.issues.map((issue) => (
                <li key={issue.code} className="text-sm">
                  <span
                    className={
                      issue.severity === "warning"
                        ? "text-amber-800"
                        : "text-muted-foreground"
                    }
                  >
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
            {seo.data && !seo.data.issues.length ? (
              <p className="text-sm">No issues found in these checks.</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {seo.data?.words ?? 0} words · Checks help find common issues and
              do not guarantee rankings. No AI credits are used.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
