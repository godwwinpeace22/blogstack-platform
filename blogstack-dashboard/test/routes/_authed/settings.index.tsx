import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@blogstack/ui";
import { useAccount, useUpdateAccount } from "@blogstack/sdk/react";

import { api } from "../../lib/api";

export const Route = createFileRoute("/_authed/settings/")({
  component: SettingsProfilePage,
});

function SettingsProfilePage() {
  const { data: account, isLoading } = useAccount(api);
  const updateMutation = useUpdateAccount(api);
  const [name, setName] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (account?.owner?.name) {
      setName(account.owner.name);
    }
  }, [account]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      { name },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      {account && (
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>Your current billing plan</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-medium capitalize">{account.plan}</p>
              <p className="text-sm text-muted-foreground">
                Up to {account.limits.maxProjects} projects ·{" "}
                {account.limits.maxAccountMembers} team members
              </p>
            </div>
            <Button variant="outline" size="sm">
              Upgrade
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your account details</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-email">Email</Label>
                <Input
                  id="settings-email"
                  type="email"
                  value={account?.owner?.email ?? ""}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed after registration.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-name">Display name</Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              {updateMutation.error && (
                <p className="text-sm text-destructive">
                  {updateMutation.error.message}
                </p>
              )}

              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending
                  ? "Saving…"
                  : saved
                    ? "Saved!"
                    : "Save changes"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
