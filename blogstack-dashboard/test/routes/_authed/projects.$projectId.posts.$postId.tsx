import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Save, Eye, Clock } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blogstack/ui";
import {
  usePost,
  useUpdatePost,
  usePublishPost,
  useUnpublishPost,
  useTags,
} from "@blogstack/sdk/react";

import { api } from "../../lib/api";

export const Route = createFileRoute(
  "/_authed/projects/$projectId/posts/$postId",
)({
  component: PostEditorPage,
});

function PostEditorPage() {
  const { projectId, postId } = Route.useParams();

  const { data: post, isLoading } = usePost(api, projectId, postId);
  const { data: tagsData } = useTags(api, projectId);
  const updateMutation = useUpdatePost(api, projectId);
  const publishMutation = usePublishPost(api, projectId);
  const unpublishMutation = useUnpublishPost(api, projectId);

  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [excerpt, setExcerpt] = React.useState("");
  const [dirty, setDirty] = React.useState(false);

  // Sync form with fetched post
  React.useEffect(() => {
    if (post) {
      setTitle(post.title ?? "");
      setSlug(post.slug ?? "");
      setExcerpt(post.excerpt ?? "");
      setDirty(false);
    }
  }, [post]);

  function markDirty() {
    setDirty(true);
  }

  function handleSave() {
    updateMutation.mutate(
      {
        postId,
        data: {
          ...(title ? { title } : {}),
          ...(slug ? { slug } : {}),
          excerpt: excerpt || null,
        },
      },
      { onSuccess: () => setDirty(false) },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Post not found.</p>
      </div>
    );
  }

  const isPublished = post.status === "published";

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Posts
        </Link>

        <div className="flex-1" />

        <Badge variant={isPublished ? "success" : "outline"}>
          {post.status}
        </Badge>

        <Button
          variant="outline"
          size="sm"
          disabled={!dirty || updateMutation.isPending}
          onClick={handleSave}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {updateMutation.isPending ? "Saving…" : "Save"}
        </Button>

        {isPublished ? (
          <Button
            variant="outline"
            size="sm"
            disabled={unpublishMutation.isPending}
            onClick={() => unpublishMutation.mutate(postId)}
          >
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Unpublish
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={publishMutation.isPending}
            onClick={() => publishMutation.mutate(postId)}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Publish
          </Button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor pane */}
        <div className="flex flex-1 flex-col overflow-auto p-6">
          {/* Title */}
          <input
            className="w-full border-none bg-transparent text-4xl font-bold outline-none placeholder:text-muted-foreground/50"
            placeholder="Post title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
          />

          {/* Content area — BlockNote editor will be mounted here via @blogstack/editor */}
          <div
            id="blogstack-editor"
            className="mt-6 flex-1"
            data-post-id={postId}
            data-project-id={projectId}
          >
            {/* The @blogstack/editor package mounts here in production */}
            <p className="text-muted-foreground italic">
              Editor loads via <code>@blogstack/editor</code>…
            </p>
          </div>
        </div>

        {/* Sidebar: meta */}
        <aside className="w-64 shrink-0 overflow-y-auto border-l p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="post-slug">Slug</Label>
            <Input
              id="post-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                markDirty();
              }}
              placeholder="my-post-slug"
              pattern="[a-z0-9-]+"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="post-excerpt">Excerpt</Label>
            <textarea
              id="post-excerpt"
              value={excerpt}
              onChange={(e) => {
                setExcerpt(e.target.value);
                markDirty();
              }}
              placeholder="A short summary…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {tagsData && tagsData.tags.length > 0 && (
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1">
                {(post.tags ?? []).map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {post.publishedAt && (
            <div className="space-y-1">
              <Label>Published</Label>
              <p className="text-sm text-muted-foreground">
                {new Date(post.publishedAt * 1000).toLocaleString()}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
