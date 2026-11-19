"use client";

/**
 * @blogstack/sdk/react
 *
 * React Query hooks wrapping every BlogStackClient resource.
 * Peer deps: @tanstack/react-query ≥5, react ≥18
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { BlogStackClient } from "../index.js";
import type {
  Account,
  AccountMember,
  MemberList,
  InviteMemberRequest,
  UpdateAccountRequest,
  Project,
  ProjectList,
  ProjectStats,
  CreateProjectRequest,
  UpdateProjectRequest,
  Post,
  PostList,
  CreatePostRequest,
  UpdatePostRequest,
  SchedulePostRequest,
  Media,
  MediaList,
  PresignMediaRequest,
  PresignMediaResponse,
  Tag,
  TagList,
  CreateTagRequest,
  UpdateTagRequest,
  MergeTagsRequest,
  ApiKeyList,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  WebhookList,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  Webhook,
  ProjectMemberList,
  ProjectMember,
  ProjectRole,
  InviteProjectMemberRequest,
  Invitation,
  PendingInvitation,
  AcceptInvitationResponse,
  PublicPost,
  PublicPostList,
  PublicTagList,
} from "../types.js";
import type { ListPostsParams } from "../resources/posts.js";
import type { ListPublicPostsParams } from "../resources/public.js";

// ─── Query key factory ────────────────────────────────────────────────────────

export const keys = {
  account: () => ["account"] as const,
  accountMembers: () => ["account", "members"] as const,
  accountInvitations: () => ["account", "invitations"] as const,

  projects: (params?: object) => ["projects", params] as const,
  project: (id: string) => ["projects", id] as const,
  projectStats: (id: string) => ["projects", id, "stats"] as const,

  posts: (projectId: string, params?: object) =>
    ["posts", projectId, params] as const,
  post: (projectId: string, postId: string) =>
    ["posts", projectId, postId] as const,

  media: (projectId: string, params?: object) =>
    ["media", projectId, params] as const,

  tags: (projectId: string) => ["tags", projectId] as const,

  apiKeys: (projectId: string) => ["api-keys", projectId] as const,

  webhooks: (projectId: string) => ["webhooks", projectId] as const,

  projectMembers: (projectId: string) =>
    ["project-members", projectId] as const,
  projectInvitations: (projectId: string) =>
    ["project-invitations", projectId] as const,
  invitation: (token: string) => ["invitation", token] as const,

  publicPosts: (slug: string, params?: object) =>
    ["public", slug, "posts", params] as const,
  publicPost: (slug: string, postSlug: string) =>
    ["public", slug, "posts", postSlug] as const,
  publicTags: (slug: string) => ["public", slug, "tags"] as const,
};

// ─── Account hooks ────────────────────────────────────────────────────────────

export function useAccount(
  client: BlogStackClient,
  opts?: Omit<UseQueryOptions<Account>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.account()),
    queryFn: () => client.accounts.get(),
    ...opts,
  });
}

export function useUpdateAccount(
  client: BlogStackClient,
  opts?: UseMutationOptions<Account, Error, UpdateAccountRequest>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.accounts.update(data),
    onSuccess: (updated, vars, ctx, fnCtx) => {
      qc.setQueryData(client.queryKey(keys.account()), updated);
      onSuccess?.(updated, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useAccountMembers(
  client: BlogStackClient,
  opts?: Omit<UseQueryOptions<MemberList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.accountMembers()),
    queryFn: () => client.accounts.listMembers(),
    ...opts,
  });
}

export function useInviteAccountMember(
  client: BlogStackClient,
  opts?: UseMutationOptions<
    {
      id: string;
      accountId: string;
      email: string;
      role: AccountMember["role"];
      invitedBy: string;
      token: string;
      expiresAt: number;
      acceptedAt: null;
    },
    Error,
    InviteMemberRequest
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.accounts.inviteMember(data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.accountMembers()),
      });
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.accountInvitations()),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useAccountInvitations(
  client: BlogStackClient,
  opts?: Omit<UseQueryOptions<PendingInvitation[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.accountInvitations()),
    queryFn: () => client.accounts.listInvitations(),
    ...opts,
  });
}

export function useResendAccountInvitation(
  client: BlogStackClient,
  opts?: UseMutationOptions<PendingInvitation, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (invitationId) =>
      client.accounts.resendInvitation(invitationId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.accountInvitations()),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useCancelAccountInvitation(
  client: BlogStackClient,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (invitationId) =>
      client.accounts.cancelInvitation(invitationId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.accountInvitations()),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useRemoveAccountMember(
  client: BlogStackClient,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (memberId) => client.accounts.removeMember(memberId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.accountMembers()),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useUpdateAccountMember(
  client: BlogStackClient,
  opts?: UseMutationOptions<
    AccountMember,
    Error,
    { memberId: string; role: AccountMember["role"] }
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: ({ memberId, role }) =>
      client.accounts.updateMember(memberId, { role }),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.accountMembers()),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

// ─── Project hooks ────────────────────────────────────────────────────────────

export function useProjects(
  client: BlogStackClient,
  params?: { page?: number; limit?: number },
  opts?: Omit<UseQueryOptions<ProjectList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.projects(params)),
    queryFn: () => client.projects.list(params),
    ...opts,
  });
}

export function useProject(
  client: BlogStackClient,
  projectId: string,
  opts?: Omit<UseQueryOptions<Project>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.project(projectId)),
    queryFn: () => client.projects.get(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

export function useProjectStats(
  client: BlogStackClient,
  projectId: string,
  opts?: Omit<UseQueryOptions<ProjectStats>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.projectStats(projectId)),
    queryFn: () => client.projects.stats(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

export function useCreateProject(
  client: BlogStackClient,
  opts?: UseMutationOptions<Project, Error, CreateProjectRequest>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.projects.create(data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({ queryKey: client.queryKey(keys.account()) });
      void qc.invalidateQueries({ queryKey: client.queryKey(["projects"]) });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useUpdateProject(
  client: BlogStackClient,
  opts?: UseMutationOptions<
    Project,
    Error,
    { projectId: string; data: UpdateProjectRequest }
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: ({ projectId, data }) =>
      client.projects.update(projectId, data),
    onSuccess: (updated, vars, ctx, fnCtx) => {
      qc.setQueryData(client.queryKey(keys.project(updated.id)), updated);
      void qc.invalidateQueries({ queryKey: client.queryKey(["projects"]) });
      onSuccess?.(updated, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useDeleteProject(
  client: BlogStackClient,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (projectId) => client.projects.delete(projectId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({ queryKey: client.queryKey(["projects"]) });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

// ─── Post hooks ───────────────────────────────────────────────────────────────

export function usePosts(
  client: BlogStackClient,
  projectId: string,
  params?: ListPostsParams,
  opts?: Omit<UseQueryOptions<PostList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.posts(projectId, params)),
    queryFn: () => client.posts.list(projectId, params),
    enabled: !!projectId,
    ...opts,
  });
}

export function usePost(
  client: BlogStackClient,
  projectId: string,
  postId: string,
  opts?: Omit<UseQueryOptions<Post>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.post(projectId, postId)),
    queryFn: () => client.posts.get(projectId, postId),
    enabled: !!projectId && !!postId,
    ...opts,
  });
}

export function useCreatePost(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<Post, Error, CreatePostRequest>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.posts.create(projectId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectStats(projectId)),
      });
      void qc.invalidateQueries({
        queryKey: client.queryKey(["posts", projectId]),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useUpdatePost(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<
    Post,
    Error,
    { postId: string; data: UpdatePostRequest }
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: ({ postId, data }) =>
      client.posts.update(projectId, postId, data),
    onSuccess: (updated, vars, ctx, fnCtx) => {
      qc.setQueryData(
        client.queryKey(keys.post(projectId, updated.id)),
        updated,
      );
      onSuccess?.(updated, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useDeletePost(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (postId) => client.posts.delete(projectId, postId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectStats(projectId)),
      });
      void qc.invalidateQueries({
        queryKey: client.queryKey(["posts", projectId]),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function usePublishPost(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<Post, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (postId) => client.posts.publish(projectId, postId),
    onSuccess: (updated, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectStats(projectId)),
      });
      qc.setQueryData(
        client.queryKey(keys.post(projectId, updated.id)),
        updated,
      );
      void qc.invalidateQueries({
        queryKey: client.queryKey(["posts", projectId]),
      });
      onSuccess?.(updated, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useUnpublishPost(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<Post, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (postId) => client.posts.unpublish(projectId, postId),
    onSuccess: (updated, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectStats(projectId)),
      });
      qc.setQueryData(
        client.queryKey(keys.post(projectId, updated.id)),
        updated,
      );
      void qc.invalidateQueries({
        queryKey: client.queryKey(["posts", projectId]),
      });
      onSuccess?.(updated, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useSchedulePost(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<
    Post,
    Error,
    { postId: string; scheduledAt: number }
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: ({ postId, scheduledAt }) =>
      client.posts.schedule(projectId, postId, { scheduledAt }),
    onSuccess: (updated, vars, ctx, fnCtx) => {
      qc.setQueryData(
        client.queryKey(keys.post(projectId, updated.id)),
        updated,
      );
      onSuccess?.(updated, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

// ─── Media hooks ──────────────────────────────────────────────────────────────

export function useMedia(
  client: BlogStackClient,
  projectId: string,
  params?: { cursor?: string; limit?: number },
  opts?: Omit<UseQueryOptions<MediaList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.media(projectId, params)),
    queryFn: () => client.media.list(projectId, params),
    enabled: !!projectId,
    ...opts,
  });
}

export function usePresignMedia(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<PresignMediaResponse, Error, PresignMediaRequest>,
) {
  return useMutation({
    mutationFn: (data) => client.media.presign(projectId, data),
    ...opts,
  });
}

export function useConfirmMedia(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<Media, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (mediaId) => client.media.confirm(projectId, mediaId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectStats(projectId)),
      });
      void qc.invalidateQueries({
        queryKey: client.queryKey(["media", projectId]),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useDeleteMedia(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (mediaId) => client.media.delete(projectId, mediaId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectStats(projectId)),
      });
      void qc.invalidateQueries({
        queryKey: client.queryKey(["media", projectId]),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

// ─── Tag hooks ────────────────────────────────────────────────────────────────

export function useTags(
  client: BlogStackClient,
  projectId: string,
  opts?: Omit<UseQueryOptions<TagList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.tags(projectId)),
    queryFn: () => client.tags.list(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

export function useCreateTag(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<Tag, Error, CreateTagRequest>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.tags.create(projectId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.tags(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useUpdateTag(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<
    Tag,
    Error,
    { tagId: string; data: UpdateTagRequest }
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: ({ tagId, data }) => client.tags.update(projectId, tagId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.tags(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useDeleteTag(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (tagId) => client.tags.delete(projectId, tagId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.tags(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useMergeTags(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<Tag, Error, MergeTagsRequest>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.tags.merge(projectId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.tags(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

// ─── API Key hooks ────────────────────────────────────────────────────────────

export function useApiKeys(
  client: BlogStackClient,
  projectId: string,
  opts?: Omit<UseQueryOptions<ApiKeyList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.apiKeys(projectId)),
    queryFn: () => client.apiKeys.list(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

export function useCreateApiKey(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<CreateApiKeyResponse, Error, CreateApiKeyRequest>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.apiKeys.create(projectId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.apiKeys(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useRevokeApiKey(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (keyId) => client.apiKeys.revoke(projectId, keyId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.apiKeys(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

// ─── Webhook hooks ────────────────────────────────────────────────────────────

export function useWebhooks(
  client: BlogStackClient,
  projectId: string,
  opts?: Omit<UseQueryOptions<WebhookList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.webhooks(projectId)),
    queryFn: () => client.webhooks.list(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

export function useCreateWebhook(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<
    Webhook & { secret: string },
    Error,
    CreateWebhookRequest
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.webhooks.create(projectId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.webhooks(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useUpdateWebhook(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<
    Webhook,
    Error,
    { webhookId: string; data: UpdateWebhookRequest }
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: ({ webhookId, data }) =>
      client.webhooks.update(projectId, webhookId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.webhooks(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useDeleteWebhook(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (webhookId) => client.webhooks.delete(projectId, webhookId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.webhooks(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

// ─── Project Members hooks ────────────────────────────────────────────────────

export function useProjectMembers(
  client: BlogStackClient,
  projectId: string,
  opts?: Omit<UseQueryOptions<ProjectMemberList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.projectMembers(projectId)),
    queryFn: () => client.members.list(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

export function useUpdateProjectMember(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<
    ProjectMember,
    Error,
    { memberId: string; role: ProjectRole }
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: ({ memberId, role }) =>
      client.members.update(projectId, memberId, { role }),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectMembers(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useRemoveProjectMember(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (memberId) => client.members.remove(projectId, memberId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectMembers(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useInviteProjectMember(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<
    { id: string; email: string; role: ProjectRole; token: string },
    Error,
    InviteProjectMemberRequest
  >,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (data) => client.members.invite(projectId, data),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectMembers(projectId)),
      });
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectInvitations(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useProjectInvitations(
  client: BlogStackClient,
  projectId: string,
  opts?: Omit<UseQueryOptions<PendingInvitation[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.projectInvitations(projectId)),
    queryFn: () => client.members.listInvitations(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

export function useResendProjectInvitation(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<PendingInvitation, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (invitationId) =>
      client.members.resendInvitation(projectId, invitationId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectInvitations(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useCancelProjectInvitation(
  client: BlogStackClient,
  projectId: string,
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...restOpts } = opts ?? {};
  return useMutation({
    mutationFn: (invitationId) =>
      client.members.cancelInvitation(projectId, invitationId),
    onSuccess: (data, vars, ctx, fnCtx) => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.projectInvitations(projectId)),
      });
      onSuccess?.(data, vars, ctx, fnCtx);
    },
    ...restOpts,
  });
}

export function useInvitation(
  client: BlogStackClient,
  token: string,
  opts?: Omit<UseQueryOptions<Invitation>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.invitation(token)),
    queryFn: () => client.members.getInvitation(token),
    enabled: !!token,
    retry: false,
    ...opts,
  });
}

export function useAcceptInvitation(
  client: BlogStackClient,
  token: string,
  opts?: UseMutationOptions<AcceptInvitationResponse, Error, void>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.members.acceptInvitation(token),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.accountMembers()),
      });
      void qc.invalidateQueries({
        queryKey: client.queryKey(keys.invitation(token)),
      });
    },
    ...opts,
  });
}

// ─── Public hooks (no auth required) ─────────────────────────────────────────

export function usePublicPosts(
  client: BlogStackClient,
  projectSlug: string,
  params?: ListPublicPostsParams,
  opts?: Omit<UseQueryOptions<PublicPostList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.publicPosts(projectSlug, params)),
    queryFn: () => client.public.listPosts(projectSlug, params),
    enabled: !!projectSlug,
    ...opts,
  });
}

export function usePublicPost(
  client: BlogStackClient,
  projectSlug: string,
  postSlug: string,
  opts?: Omit<UseQueryOptions<PublicPost>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.publicPost(projectSlug, postSlug)),
    queryFn: () => client.public.getPost(projectSlug, postSlug),
    enabled: !!projectSlug && !!postSlug,
    ...opts,
  });
}

export function usePublicTags(
  client: BlogStackClient,
  projectSlug: string,
  opts?: Omit<UseQueryOptions<PublicTagList>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: client.queryKey(keys.publicTags(projectSlug)),
    queryFn: () => client.public.listTags(projectSlug),
    enabled: !!projectSlug,
    ...opts,
  });
}
