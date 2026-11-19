import { test, expect } from "bun:test";
import { app } from "../src/index.js";
import { fixture } from "./support.js";
test("signup, verification, resend and password reset use real auth handlers and revoke old sessions", async () => {
  const f = fixture(),
    emails: any[] = [];
  f.env.RESEND_API_KEY = "test-email-only";
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    expect(String(input)).toBe("https://api.resend.com/emails");
    emails.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "local-email" });
  }) as typeof fetch;
  const request = (
    path: string,
    body?: unknown,
    method = "POST",
    cookie?: string,
  ) =>
    app.request(
      path,
      {
        method,
        headers: {
          "content-type": "application/json",
          origin: f.env.FRONTEND_URL,
          ...(cookie ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      f.env,
      f.ctx,
    );
  try {
    let response = await request("/api/auth/sign-up/email", {
      name: "Test Client",
      email: "client-local@example.com",
      password: "Test-local-password-123!",
      callbackURL: f.env.FRONTEND_URL + "/invite/local-token",
    });
    expect(response.status).toBe(200);
    expect(emails).toHaveLength(1);
    const link = emails[0].html
      .match(/href="([^"]+)"/)[1]
      .replaceAll("&amp;", "&");
    expect(new URL(link).searchParams.get("callbackURL")).toBe(
      f.env.FRONTEND_URL + "/invite/local-token",
    );
    expect(
      (
        await request("/api/resend-verification", {
          email: "client-local@example.com",
          callbackURL: f.env.FRONTEND_URL + "/invite/local-token",
        })
      ).status,
    ).toBe(200);
    response = await request(link, undefined, "GET");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/invite/local-token");
    response = await request("/api/auth/sign-in/email", {
      email: "client-local@example.com",
      password: "Test-local-password-123!",
    });
    expect(response.status).toBe(200);
    const oldCookie = response.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; ");
    expect(
      (await request("/accounts/me", undefined, "GET", oldCookie)).status,
    ).toBe(200);
    const user = f.sql
      .query("SELECT id FROM users WHERE email='client-local@example.com'")
      .get() as any;
    const own = f.sql
      .query(
        "SELECT b.trial_started_at FROM account_billing b JOIN accounts a ON a.id=b.account_id WHERE a.owner_id=?",
      )
      .get(user.id) as any;
    expect(own.trial_started_at).toBeNull();
    response = await request("/api/auth/request-password-reset", {
      email: "client-local@example.com",
      redirectTo: f.env.FRONTEND_URL + "/reset-password",
    });
    expect(response.status).toBe(200);
    const reset = emails
      .at(-1)
      .html.match(/href="([^"]+)"/)[1]
      .replaceAll("&amp;", "&");
    const resetResponse = await request(reset, undefined, "GET");
    const token = new URL(
      resetResponse.headers.get("location")!,
    ).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(
      (
        await request("/api/auth/reset-password", {
          token,
          newPassword: "New-test-password-456!",
        })
      ).status,
    ).toBe(200);
    expect(
      (await request("/accounts/me", undefined, "GET", oldCookie)).status,
    ).toBe(401);
    expect(
      (
        await request("/api/auth/sign-in/email", {
          email: "client-local@example.com",
          password: "New-test-password-456!",
        })
      ).status,
    ).toBe(200);
  } finally {
    globalThis.fetch = original;
  }
});
