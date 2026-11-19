import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, RotateCw, Trash2, UserPlus, Users } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blogstack/ui";
import {
  useAccount,
  useAccountInvitations,
  useAccountMembers,
  useCancelAccountInvitation,
  useInviteAccountMember,
  useRemoveAccountMember,
  useResendAccountInvitation,
  useUpdateAccountMember,
} from "@blogstack/sdk/react";

import { api } from "../../lib/api";
import type {
  AccountMember,
  AccountRole,
  PendingInvitation,
} from "@blogstack/sdk";

export const Route = createFileRoute("/_authed/settings/team")({
  component: SettingsTeamPage,
});

const ACCOUNT_ROLE_LABELS: Record<AccountRole, string> = {
  account_admin: "Admin",
  account_editor: "Editor",
};

function SettingsTeamPage() {
  const { data: account } = useAccount(api);
  const { data: members = [], isLoading: membersLoading } =
    useAccountMembers(api);
  const { data: invitations = [], isLoading: invitationsLoading } =
    useAccountInvitations(api);
  const inviteMutation = useInviteAccountMember(api);
  const updateMemberMutation = useUpdateAccountMember(api);
  const removeMemberMutation = useRemoveAccountMember(api, {
    onSuccess: () => setRemoveUserId(null),
  });
  const resendInvitationMutation = useResendAccountInvitation(api);
  const cancelInvitationMutation = useCancelAccountInvitation(api);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] =
    React.useState<AccountRole>("account_editor");
  const [removeUserId, setRemoveUserId] = React.useState<string | null>(null);
  const [inviteSent, setInviteSent] = React.useState(false);

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    inviteMutation.mutate(
      { email: inviteEmail, role: inviteRole },
      {
        onSuccess: () => {
          setInviteSent(true);
          setInviteEmail("");
          setInviteRole("account_editor");
          setTimeout(() => {
            setInviteOpen(false);
            setInviteSent(false);
          }, 1800);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>Account Members</CardTitle>
            <CardDescription>
              Invite teammates and manage access for your entire account.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite member
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {account ? (
            <p className="text-sm text-muted-foreground">
              {members.length} of {account.limits.maxAccountMembers} seats in
              use.
            </p>
          ) : null}

          {membersLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading members…
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 opacity-30" />
              <p>No account members yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="divide-y">
                {members.map((member) => (
                  <AccountMemberRow
                    key={member.userId}
                    member={member}
                    isOwner={member.userId === account?.ownerId}
                    onRoleChange={(role) =>
                      updateMemberMutation.mutate({
                        memberId: member.userId,
                        role,
                      })
                    }
                    onRemove={() => setRemoveUserId(member.userId)}
                  />
                ))}
              </div>
            </div>
          )}

          {updateMemberMutation.error ? (
            <p className="text-sm text-destructive">
              {updateMemberMutation.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>
            Resend or cancel invitations that have not been accepted yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitationsLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading invitations…
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No pending invitations.
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="divide-y">
                {invitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    onResend={() =>
                      resendInvitationMutation.mutate(invitation.id)
                    }
                    onCancel={() =>
                      cancelInvitationMutation.mutate(invitation.id)
                    }
                    isResending={resendInvitationMutation.isPending}
                    isCancelling={cancelInvitationMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {resendInvitationMutation.error ? (
            <p className="mt-4 text-sm text-destructive">
              {resendInvitationMutation.error.message}
            </p>
          ) : null}
          {cancelInvitationMutation.error ? (
            <p className="mt-4 text-sm text-destructive">
              {cancelInvitationMutation.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteEmail("");
            setInviteRole("account_editor");
            setInviteSent(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite account member</DialogTitle>
          </DialogHeader>
          {inviteSent ? (
            <p className="py-4 text-center text-sm text-green-600 dark:text-green-400">
              Invitation sent! ✓
            </p>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="account-invite-email">Email address</Label>
                <Input
                  id="account-invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-invite-role">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as AccountRole)}
                >
                  <SelectTrigger id="account-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="account_admin">
                      Admin — full account access
                    </SelectItem>
                    <SelectItem value="account_editor">
                      Editor — can manage content
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {inviteMutation.error ? (
                <p className="text-sm text-destructive">
                  {inviteMutation.error.message}
                </p>
              ) : null}

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

      <Dialog
        open={!!removeUserId}
        onOpenChange={(open) => !open && setRemoveUserId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove account member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This person will lose access to all projects in the account
            immediately.
          </p>
          {removeMemberMutation.error ? (
            <p className="text-sm text-destructive">
              {removeMemberMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveUserId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMemberMutation.isPending}
              onClick={() =>
                removeUserId && removeMemberMutation.mutate(removeUserId)
              }
            >
              {removeMemberMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountMemberRow({
  member,
  isOwner,
  onRoleChange,
  onRemove,
}: {
  member: AccountMember;
  isOwner: boolean;
  onRoleChange: (role: AccountRole) => void;
  onRemove: () => void;
}) {
  const name = member.user?.name ?? member.user?.email ?? "Unknown";
  const email = member.user?.email ?? "";
  const fallback = name[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar
        src={member.user?.avatarUrl ?? null}
        alt={name}
        fallback={fallback}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name}
          {isOwner ? (
            <span className="ml-2 text-xs text-muted-foreground">Owner</span>
          ) : null}
        </p>
        {email ? (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        ) : null}
      </div>
      <Select
        value={member.role}
        onValueChange={(value) => onRoleChange(value as AccountRole)}
        disabled={isOwner}
      >
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue>{ACCOUNT_ROLE_LABELS[member.role]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="account_admin">Admin</SelectItem>
          <SelectItem value="account_editor">Editor</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        onClick={onRemove}
        title="Remove member"
        disabled={isOwner}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function InvitationRow({
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
            {ACCOUNT_ROLE_LABELS[invitation.role as AccountRole]} · expires{" "}
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
