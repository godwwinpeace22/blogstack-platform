import * as React from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="max-w-4xl space-y-6 p-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex border-b">
          <SettingsTab to="/settings" activeOptions={{ exact: true }}>
            Profile
          </SettingsTab>
          <SettingsTab to="/settings/team">Team</SettingsTab>
        </div>
      </div>

      <Outlet />
    </div>
  );
}

function SettingsTab({
  to,
  activeOptions,
  children,
}: {
  to: "/settings" | "/settings/team";
  activeOptions?: { exact?: boolean };
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      {...(activeOptions ? { activeOptions } : {})}
      className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:border-primary [&.active]:text-foreground"
    >
      {children}
    </Link>
  );
}
