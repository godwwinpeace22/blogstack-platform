import { safeDestination } from "../lib/destination";
import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod/v4";
import { toast } from "sonner";
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

import { authClient } from "../lib/auth-client";

const searchSchema = z.object({
  redirect: z.string().optional(),
  plan: z.enum(["solo", "studio", "growth"]).optional(),
  interval: z.enum(["month", "year"]).optional(),
});

export const Route = createFileRoute("/register")({
  validateSearch: searchSchema,
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL:
          window.location.origin +
          safeDestination(
            search.redirect,
            search.plan
              ? "/settings?plan=" +
                  search.plan +
                  "&interval=" +
                  (search.interval ?? "month")
              : "/projects",
          ),
      });
      if (res.error) {
        toast.error(res.error.message ?? "Registration failed");
      } else {
        // Email verification is required — direct to verify-email page
        await navigate({
          to: "/verify-email",
          search: {
            email,
            redirect: safeDestination(
              search.redirect,
              search.plan
                ? "/settings?plan=" +
                    search.plan +
                    "&interval=" +
                    (search.interval ?? "month")
                : "/projects",
            ),
          },
        });
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Create account</CardTitle>
          <CardDescription>
            {safeDestination(search.redirect).startsWith("/invite/")
              ? "Create an account to join the invited workspace."
              : import.meta.env.VITE_DEPLOYMENT_MODE === "self_hosted"
                ? "Create your self-hosted workspace. No BlogStack subscription required."
                : "Try Studio free for 14 days. No card required."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              {...(search.redirect
                ? { search: { redirect: search.redirect } }
                : {})}
              className="text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
