import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Input, Label } from "@blogstack/ui";
import { authClient } from "../lib/auth-client";
import { ErrorMessage, Panel } from "../components/feedback";
export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});
function ForgotPassword() {
  const [email, setEmail] = React.useState(""),
    [sent, setSent] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState<unknown>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: window.location.origin + "/reset-password",
      });
      if (result.error)
        throw new Error(result.error.message || "Reset could not be requested");
      setSent(true);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <Panel title="Reset your password">
        {sent ? (
          <p role="status" className="text-sm">
            If this address has a BlogStack account, a password reset link is on
            its way.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <ErrorMessage error={error} />
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <Link className="text-sm underline" to="/login">
          Back to sign in
        </Link>
      </Panel>
    </main>
  );
}
