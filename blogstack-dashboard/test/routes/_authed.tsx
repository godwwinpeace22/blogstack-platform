import * as React from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
} from "@tanstack/react-router";
import {
  BookText,
  FolderKanban,
  Settings,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { Button, Avatar, Separator } from "@blogstack/ui";

import { authClient, useSession } from "../lib/auth-client";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    // Check session server-side on initial load
    // If no session, redirect to login with return path
    void context;
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    void router.navigate({ to: "/login" });
    return null;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-card px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <BookText className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">BlogStack</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <SidebarLink
            to="/projects"
            icon={<FolderKanban className="h-4 w-4" />}
          >
            Projects
          </SidebarLink>
          <SidebarLink to="/settings" icon={<Settings className="h-4 w-4" />}>
            Settings
          </SidebarLink>
        </nav>

        <Separator className="my-3" />

        <div className="flex items-center gap-2 px-2">
          <Avatar
            src={session.user.image ?? null}
            alt={session.user.name}
            fallback={session.user.name?.[0]?.toUpperCase() ?? undefined}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{session.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {session.user.email}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void authClient.signOut()}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  children,
}: {
  to: "/projects" | "/settings";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"
    >
      {icon}
      {children}
    </Link>
  );
}
