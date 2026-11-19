import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock3, Mail, UserPlus } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from "@blogstack/ui";
import { useInvitation, useAcceptInvitation } from "@blogstack/sdk/react";
import { BlogStackApiError } from "@blogstack/sdk";

import { api } from "../lib/api";
import { useSession } from "../lib/auth-client";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

function InvitePage() {
  const navigate = useNavigate();
  const { token } = Route.useParams();
  const redirectPath = `/invite/${token}`;
  const { data: session, isPending: sessionPending } = useSession();
  const invitationQuery = useInvitation(api, token);
  const acceptMutation = useAcceptInvitation(api, token, {
    onSuccess: async (result) => {
      if (result.projectId) {
        await navigate({
          to: "/projects/$projectId",
          params: { projectId: result.projectId },
        });
        return;
      }

      await navigate({ to: "/settings" });
    },
  });

  if (sessionPending || invitationQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const invitation = invitationQuery.data;
  const error = invitationQuery.error;

  if (error || !invitation) {
    return (
      <InviteShell>
        <Card>
          <CardHeader>
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription>
              {getInvitationErrorMessage(error)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </InviteShell>
    );
  }

  const destinationLabel = invitation.projectName ?? "BlogStack account";
  const roleLabel = formatRole(invitation.role);
  const isAccepted = invitation.acceptedAt !== null;

  return (
    <InviteShell>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <UserPlus className="h-5 w-5" />
            <span className="text-sm font-medium">Invitation</span>
          </div>
          <CardTitle className="text-2xl">Join {destinationLabel}</CardTitle>
          <CardDescription>
            {invitation.inviterName
              ? `${invitation.inviterName} invited you to collaborate on ${destinationLabel}.`
              : `You were invited to collaborate on ${destinationLabel}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 rounded-lg border p-4 text-sm">
            <DetailRow
              icon={<Mail className="h-4 w-4" />}
              label="Invited email"
              value={invitation.email}
            />
            <DetailRow
              icon={
                <Badge variant="outline" className="px-2 py-0">
                  {roleLabel}
                </Badge>
              }
              label="Role"
              value={roleLabel}
            />
            <DetailRow
              icon={<Clock3 className="h-4 w-4" />}
              label="Expires"
              value={new Date(invitation.expiresAt * 1000).toLocaleString()}
            />
          </div>

          {!session ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sign in or create an account to accept this invitation.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/login" search={{ redirect: redirectPath }}>
                    Sign in to accept
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/register" search={{ redirect: redirectPath }}>
                    Create account
                  </Link>
                </Button>
              </div>
            </div>
          ) : isAccepted ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                <div>
                  <p className="font-medium text-foreground">
                    This invitation has already been accepted.
                  </p>
                  <p className="text-muted-foreground">
                    Continue to your dashboard.
                  </p>
                </div>
              </div>
              <Button
                onClick={() =>
                  invitation.projectId
                    ? void navigate({
                        to: "/projects/$projectId",
                        params: { projectId: invitation.projectId },
                      })
                    : void navigate({ to: "/settings" })
                }
              >
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {session.user.email !== invitation.email ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                  You are signed in as {session.user.email}. This invite was
                  sent to {invitation.email}.
                </p>
              ) : null}

              {acceptMutation.error ? (
                <p className="text-sm text-destructive">
                  {getInvitationErrorMessage(acceptMutation.error)}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                >
                  {acceptMutation.isPending
                    ? "Accepting…"
                    : "Accept invitation"}
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/projects">Go to dashboard</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function formatRole(role: string) {
  return role
    .replace("project_", "")
    .replace("account_", "")
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getInvitationErrorMessage(error: unknown) {
  if (error instanceof BlogStackApiError) {
    if (error.code === "EXPIRED") return "This invitation has expired.";
    if (error.code === "ALREADY_ACCEPTED")
      return "This invitation was already accepted.";
    if (error.code === "NOT_FOUND")
      return "This invitation could not be found.";
    return error.message;
  }

  if (error instanceof Error) return error.message;
  return "Unable to load this invitation.";
}
