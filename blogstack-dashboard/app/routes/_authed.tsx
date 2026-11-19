import * as React from "react";
import {
  createFileRoute,
  Outlet,
  Link,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useProject } from "@blogstack/sdk/react";
import { Button } from "@blogstack/ui";
import { authClient, useSession } from "../lib/auth-client";
import { api } from "../lib/api";
import { AccountProvider, useActiveAccount } from "../lib/account-context";
export const Route = createFileRoute("/_authed")({ component: Authenticated });
function Authenticated() {
  const { data: session, isPending } = useSession(),
    router = useRouter();
  React.useEffect(() => {
    if (!isPending && !session) void router.navigate({ to: "/login" });
  }, [session, isPending, router]);
  if (isPending || !session)
    return (
      <p role="status" className="p-8">
        Loading your account…
      </p>
    );
  return (
    <AccountProvider key={session.user.id} userId={session.user.id}>
      <Workspace user={session.user} />
    </AccountProvider>
  );
}
function Workspace({
  user,
}: {
  user: { id: string; name?: string | null; email: string };
}) {
  const { accounts, activeId, select } = useActiveAccount(),
    qc = useQueryClient(),
    router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname }),
    projectId = path.match(/^\/projects\/([^/]+)/)?.[1] ?? "";
  const project = useProject(api, projectId, { enabled: !!projectId }),
    account = useAccount(api),
    branding = project.data?.branding;
  const projectOnly =
    !!project.data && !accounts.some((a) => a.id === project.data!.accountId);
  const paused = project.data
    ? !project.data.canWrite
    : !!account.data?.trialEndsAt && !account.data.canWrite;
  const ownsProjectAccount = project.data
    ? accounts.find((a) => a.id === project.data!.accountId)?.role === "owner"
    : account.data?.role === "owner";
  const [signingOut, setSigningOut] = React.useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      await qc.cancelQueries();
      qc.clear();
      api.setAccount(undefined);
      api.setSession("guest");
      await router.navigate({ to: "/login" });
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex flex-col gap-5 border-b bg-card p-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r">
        <div className="flex items-center gap-3">
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt=""
              className="h-9 w-9 rounded object-contain"
            />
          ) : null}
          <span className="text-xl font-semibold">
            {branding?.workspaceName ?? "BlogStack"}
          </span>
        </div>
        {!projectOnly && accounts.length > 1 ? (
          <label className="text-xs text-muted-foreground">
            Billing account
            <select
              aria-label="Billing account"
              className="mt-1 w-full rounded border bg-background p-2 text-sm"
              value={activeId}
              onChange={(e) => void select(e.target.value)}
            >
              {accounts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name || a.email}
                  {a.ownerId === user.id ? " (yours)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <nav aria-label="Main navigation" className="flex gap-4 lg:flex-col">
          <Link
            to="/projects"
            className="rounded px-3 py-2 [&.active]:bg-accent"
          >
            Blogs
          </Link>
          {!projectOnly ? (
            <Link
              to="/settings"
              className="rounded px-3 py-2 [&.active]:bg-accent"
            >
              Account & billing
            </Link>
          ) : null}
          {user.email.toLowerCase() ===
          (
            import.meta.env.VITE_OPERATOR_EMAIL ?? "hello@boldlaunchstudio.com"
          ).toLowerCase() ? (
            <Link
              to="/operations"
              className="rounded px-3 py-2 [&.active]:bg-accent"
            >
              Operations
            </Link>
          ) : null}
        </nav>
        <div className="mt-auto border-t pt-4">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <Button
            variant="ghost"
            className="mt-3"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {paused ? (
          <div
            role="status"
            className="border-b bg-amber-50 px-6 py-3 text-sm text-amber-950"
          >
            Publishing is paused. Your content remains available for export
            during the retention period.{" "}
            {ownsProjectAccount ? (
              <Link to="/settings" className="underline">
                Choose a plan
              </Link>
            ) : (
              "Contact your workspace owner to restore access."
            )}
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}
