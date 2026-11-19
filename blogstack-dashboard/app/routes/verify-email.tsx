import { apiBase } from "../lib/api";
import { safeDestination } from "../lib/destination";
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod/v4";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@blogstack/ui";
import { MailCheck } from "lucide-react";

const searchSchema = z.object({
  email: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: searchSchema,
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const search = Route.useSearch();
  const [resending, setResending] = React.useState(false);

  async function handleResend() {
    if (!search.email) return;
    setResending(true);
    try {
      const res = await fetch(apiBase + "/api/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: search.email,
          callbackURL:
            window.location.origin + safeDestination(search.redirect),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        toast.error(body.message ?? "Failed to resend verification email");
      } else {
        toast.success("Verification email sent — check your inbox");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to{" "}
            {search.email ? (
              <span className="font-medium text-foreground">
                {search.email}
              </span>
            ) : (
              "your email address"
            )}
            . Click the link to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {search.email && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? "Sending…" : "Resend verification email"}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Already verified?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
