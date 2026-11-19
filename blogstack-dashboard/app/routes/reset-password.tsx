import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod/v4";
import { Button, Input, Label } from "@blogstack/ui";
import { authClient } from "../lib/auth-client";
import { ErrorMessage, Panel } from "../components/feedback";
export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.string().optional(),
  }),
  component: ResetPassword,
});
function ResetPassword() {
  const { token, error: linkError } = Route.useSearch(),
    [password, setPassword] = React.useState(""),
    [done, setDone] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState<unknown>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error)
        throw new Error(result.error.message || "Password could not be reset");
      setDone(true);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <Panel title="Choose a new password">
        {done ? (
          <>
            <p role="status">Your password has been reset.</p>
            <Link to="/login" className="underline">
              Sign in
            </Link>
          </>
        ) : !token || linkError ? (
          <>
            <p>This reset link is invalid or expired.</p>
            <Link to="/forgot-password" className="underline">
              Request another link
            </Link>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <ErrorMessage error={error} />
            <Button type="submit" disabled={busy}>
              {busy ? "Resetting…" : "Reset password"}
            </Button>
          </form>
        )}
      </Panel>
    </main>
  );
}
