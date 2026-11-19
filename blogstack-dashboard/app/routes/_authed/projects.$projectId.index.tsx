import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button, SearchBar, Badge } from "@blogstack/ui";
import { usePosts, useCreatePost, useProject } from "@blogstack/sdk/react";
import { api } from "../../lib/api";
import { ErrorMessage } from "../../components/feedback";
export const Route = createFileRoute("/_authed/projects/$projectId/")({
  component: Posts,
});
function Posts() {
  const { projectId } = Route.useParams(),
    navigate = useNavigate();
  const [q, setQ] = React.useState(""),
    [input, setInput] = React.useState(""),
    [status, setStatus] = React.useState<"" | "draft" | "published">(""),
    [cursor, setCursor] = React.useState<string | undefined>();
  const posts = usePosts(api, projectId, {
      q,
      limit: 20,
      ...(status ? { status } : {}),
      ...(cursor ? { cursor } : {}),
    }),
    project = useProject(api, projectId);
  const create = useCreatePost(api, projectId, {
    onSuccess: (post) => {
      void navigate({
        to: "/projects/$projectId/posts/$postId",
        params: { projectId, postId: post.id },
      });
    },
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Articles</h2>
        <Button
          disabled={!project.data?.canWrite || create.isPending}
          onClick={() => create.mutate({ title: "Untitled article" })}
        >
          {create.isPending ? "Creating…" : "New article"}
        </Button>
      </div>
      <ErrorMessage error={posts.error || create.error} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={input}
          onValueChange={setInput}
          onSearch={(value) => {
            setQ(value);
            setCursor(undefined);
          }}
          placeholder="Search articles"
        />
        <select
          aria-label="Article status"
          className="rounded border bg-background p-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setCursor(undefined);
          }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
      {posts.isLoading ? <p role="status">Loading articles…</p> : null}
      {!posts.isLoading && !posts.error && !posts.data?.data.length ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          No articles yet. Create a draft to start writing.
        </p>
      ) : null}
      <div className="divide-y rounded-xl border">
        {posts.data?.data.map((post) => (
          <Link
            className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40"
            key={post.id}
            to="/projects/$projectId/posts/$postId"
            params={{ projectId, postId: post.id }}
          >
            <div>
              <h3 className="font-medium">{post.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(post.updatedAt * 1000).toLocaleDateString()}
                {post.status === "published" && post.hasUnpublishedChanges
                  ? " · Unpublished changes"
                  : ""}
              </p>
            </div>
            <Badge
              variant={post.status === "published" ? "default" : "secondary"}
            >
              {post.status}
            </Badge>
          </Link>
        ))}
      </div>
      <div className="flex gap-3">
        {cursor ? (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            Back to first page
          </Button>
        ) : null}
        {posts.data?.nextCursor ? (
          <Button
            variant="outline"
            onClick={() => setCursor(posts.data!.nextCursor!)}
          >
            Next page
          </Button>
        ) : null}
        <span className="self-center text-sm text-muted-foreground">
          {posts.data?.total ?? 0} articles
        </span>
      </div>
    </div>
  );
}
