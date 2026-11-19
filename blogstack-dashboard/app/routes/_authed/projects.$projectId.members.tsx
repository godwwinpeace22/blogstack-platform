import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UserPlus, Trash2, Users, Mail, RotateCw } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Avatar,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blogstack/ui";
import {
  useProjectMembers,
  useInviteProjectMember,
  useUpdateProjectMember,
  useRemoveProjectMember,
  useProjectInvitations,
  useResendProjectInvitation,
  useCancelProjectInvitation,
} from "@blogstack/sdk/react";

import { api } from "../../lib/api";
import type {
  PendingInvitation,
  ProjectMember,
  ProjectRole,
} from "@blogstack/sdk";

export const Route = createFileRoute("/_authed/projects/$projectId/members")({
  component: MembersPage,
});

const ROLE_LABELS: Record<ProjectRole, string> = {
  project_admin: "Admin",
  editor: "Editor",
  writer: "Writer",
};

function MembersPage() {
  const { projectId } = Route.useParams();
  const { data, isLoading } = useProjectMembers(api, projectId);
  const { data: invitations = [], isLoading: invitationsLoading } =
    useProjectInvitations(api, projectId);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<ProjectRole>("editor");
  const [removeId, setRemoveId] = React.useState<string | null>(null);
  const [invited, setInvited] = React.useState(false);

  const inviteMutation = useInviteProjectMember(api, projectId, {
    onSuccess: () => {
      setInvited(true);
      setInviteEmail("");
      setInviteRole("editor");
      setTimeout(() => {
        setInviteOpen(false);
        setInvited(false);
      }, 1800);
    },
  });

  const updateMutation = useUpdateProjectMember(api, projectId);
  const resendInvitationMutation = useResendProjectInvitation(api, projectId);
  const cancelInvitationMutation = useCancelProjectInvitation(api, projectId);

  const removeMutation = useRemoveProjectMember(api, projectId, {
    onSuccess: () => setRemoveId(null),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  }

  const members = data ?? [];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Invite teammates to collaborate on this project.
          </p>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      </div>

      {/* Members table */}
      <div className="rounded-lg border">
        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        )}

        {!isLoading && members.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center text-muted-foreground gap-3">
            <Users className="h-8 w-8 opacity-30" />
            <p>No members yet. Invite someone to get started.</p>
          </div>
        )}

        {members.length > 0 && (
          <div className="divide-y">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                onRoleChange={(role) =>
                  updateMutation.mutate({ memberId: member.userId, role })
                }
                onRemove={() => setRemoveId(member.userId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Pending Invitations</h3>
          <p className="text-sm text-muted-foreground">
            Invitations that have been sent but not yet accepted.
          </p>
        </div>

        {invitationsLoading && (
          <div className="py-8 text-center text-muted-foreground">
            Loading invitations…
          </div>
        )}

        {!invitationsLoading && invitations.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No pending invitations.
          </div>
        )}

        {invitations.length > 0 && (
          <div className="divide-y">
            {invitations.map((invitation) => (
              <ProjectInvitationRow
                key={invitation.id}
                invitation={invitation}
                onResend={() => resendInvitationMutation.mutate(invitation.id)}
                onCancel={() => cancelInvitationMutation.mutate(invitation.id)}
                isResending={resendInvitationMutation.isPending}
                isCancelling={cancelInvitationMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {resendInvitationMutation.error && (
        <p className="text-sm text-destructive">
          {resendInvitationMutation.error.message}
        </p>
      )}

      {cancelInvitationMutation.error && (
        <p className="text-sm text-destructive">
          {cancelInvitationMutation.error.message}
        </p>
      )}

      {/* Invite dialog */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o);
          if (!o) {
            setInviteEmail("");
            setInviteRole("editor");
            setInvited(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
          </DialogHeader>
          {invited ? (
            <p className="py-4 text-center text-sm text-green-600 dark:text-green-400">
              Invitation sent! ✓
            </p>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as ProjectRole)}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project_admin">
                      Admin — full access
                    </SelectItem>
                    <SelectItem value="editor">
                      Editor — can edit all posts
                    </SelectItem>
                    <SelectItem value="writer">
                      Writer — can create drafts
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {inviteMutation.error && (
                <p className="text-sm text-destructive">
                  {inviteMutation.error.message}
                </p>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setInviteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={inviteMutation.isPending || !inviteEmail.trim()}
                >
                  {inviteMutation.isPending ? "Sending…" : "Send invitation"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog */}
      <Dialog open={!!removeId} onOpenChange={(o) => !o && setRemoveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This person will lose access to the project immediately.
          </p>
          {removeMutation.error && (
            <p className="text-sm text-destructive">
              {removeMutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => removeId && removeMutation.mutate(removeId)}
            >
              {removeMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberRow({
  member,
  onRoleChange,
  onRemove,
}: {
  member: ProjectMember;
  onRoleChange: (role: ProjectRole) => void;
  onRemove: () => void;
}) {
  const name = member.user?.name ?? member.user?.email ?? "Unknown";
  const email = member.user?.email ?? "";
  const initial = name[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar
        src={member.user?.avatarUrl ?? null}
        alt={name}
        fallback={initial}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {email && (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        )}
      </div>
      <Select
        value={member.role}
        onValueChange={(v) => onRoleChange(v as ProjectRole)}
      >
        <SelectTrigger className="w-32 h-8 text-xs">
          <SelectValue>{ROLE_LABELS[member.role]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="project_admin">Admin</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="writer">Writer</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        onClick={onRemove}
        title="Remove member"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function ProjectInvitationRow({
  invitation,
  onResend,
  onCancel,
  isResending,
  isCancelling,
}: {
  invitation: PendingInvitation;
  onResend: () => void;
  onCancel: () => void;
  isResending: boolean;
  isCancelling: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{invitation.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ROLE_LABELS[invitation.role as ProjectRole]} · expires{" "}
            {new Date(invitation.expiresAt * 1000).toLocaleDateString()}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onResend}
        disabled={isResending}
      >
        <RotateCw className="mr-2 h-3.5 w-3.5" />
        {isResending ? "Resending…" : "Resend"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onCancel}
        disabled={isCancelling}
      >
        <Trash2 className="mr-2 h-3.5 w-3.5 text-destructive" />
        {isCancelling ? "Cancelling…" : "Cancel"}
      </Button>
    </div>
  );
}
