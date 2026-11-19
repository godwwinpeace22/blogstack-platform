import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Eye, CheckCircle } from "lucide-react";
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@blogstack/ui";
import {
  usePosts,
  useCreatePost,
  useDeletePost,
  usePublishPost,
  useUnpublishPost,
} from "@blogstack/sdk/react";

import { api } from "../../lib/api";
import type { Post, PostStatus } from "@blogstack/sdk";

export const Route = createFileRoute("/_authed/projects/$projectId/")({
  component: ProjectPostsPage,
});

const STATUS_COLOR: Record<
  PostStatus,
  "default" | "success" | "outline" | "warning"
> = {
  published: "success",
  draft: "outline",
  scheduled: "warning",
  archived: "secondary" as any,
};

function ProjectPostsPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const { data: postsData, isLoading } = usePosts(api, projectId, {
    limit: 50,
  });

  const createMutation = useCreatePost(api, projectId, {
    onSuccess: (post) => {
      void navigate({
        to: "/projects/$projectId/posts/$postId",
        params: { projectId, postId: post.id },
      });
    },
  });

  const deleteMutation = useDeletePost(api, projectId, {
    onSuccess: () => setDeleteId(null),
  });

  const publishMutation = usePublishPost(api, projectId);
  const unpublishMutation = useUnpublishPost(api, projectId);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Posts</h2>
        <Button
          size="sm"
          onClick={() => createMutation.mutate({})}
          disabled={createMutation.isPending}
        >
          <Plus className="mr-2 h-4 w-4" />
          New post
        </Button>
      </div>

      {isLoading && (
        <div className="py-8 text-center text-muted-foreground">Loading…</div>
      )}

      {!isLoading && (!postsData || postsData.posts.length === 0) && (
        <div className="py-12 text-center text-muted-foreground">
          No posts yet. Click "New post" to get started.
        </div>
      )}

      {postsData && postsData.posts.length > 0 && (
        <div className="divide-y">
          {postsData.posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              projectId={projectId}
              onDelete={() => setDeleteId(post.id)}
              onPublish={() => publishMutation.mutate(post.id)}
              onUnpublish={() => unpublishMutation.mutate(post.id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete post?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The post and all its data will be
            permanently deleted.
          </p>
          {deleteMutation.error && (
            <p className="text-sm text-destructive">
              {deleteMutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostRow({
  post,
  projectId,
  onDelete,
  onPublish,
  onUnpublish,
}: {
  post: Post;
  projectId: string;
  onDelete: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <Link
          to="/projects/$projectId/posts/$postId"
          params={{ projectId, postId: post.id }}
          className="font-medium hover:underline"
        >
          {post.title ?? (
            <span className="italic text-muted-foreground">Untitled</span>
          )}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {post.publishedAt
            ? `Published ${new Date(post.publishedAt * 1000).toLocaleDateString()}`
            : `Updated ${new Date(post.updatedAt * 1000).toLocaleDateString()}`}
        </p>
      </div>

      <Badge variant={STATUS_COLOR[post.status] ?? "outline"}>
        {post.status}
      </Badge>

      <div className="flex items-center gap-1">
        {post.status === "draft" ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={onPublish}
            title="Publish"
          >
            <CheckCircle className="h-4 w-4" />
          </Button>
        ) : post.status === "published" ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={onUnpublish}
            title="Unpublish"
          >
            <Eye className="h-4 w-4" />
          </Button>
        ) : null}
        <Button size="icon" variant="ghost" asChild>
          <Link
            to="/projects/$projectId/posts/$postId"
            params={{ projectId, postId: post.id }}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
