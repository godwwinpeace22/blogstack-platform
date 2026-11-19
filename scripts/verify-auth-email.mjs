import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// This fixture is confined to the isolated sandbox and the operator's own mailbox.
const path = ".launch/auth-email-fixture.json";
const base = "https://blogstack-sandbox-app.hidden-silence-2d18.workers.dev";
const setup = parseEnv(readFileSync("blogstack-api/.dev.vars", "utf8"));
const fixture = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      email: "hello@boldlaunchstudio.com",
      password: randomBytes(24).toString("base64url"),
      startedAt: new Date().toISOString(),
      checks: {},
    };
const save = () =>
  writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n", { mode: 0o600 });
save();
async function api(route, body, cookie = fixture.cookie, method = "POST") {
  const response = await fetch(base + route, {
    method,
    redirect: "manual",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      "Sandbox " + route.split("?")[0] + " returned HTTP " + response.status,
    );
  return {
    data: await response.json(),
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
  };
}
async function emailRequest(route) {
  const response = await fetch("https://api.resend.com" + route, {
    headers: { Authorization: "Bearer " + setup.RESEND_API_KEY },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error("Email evidence returned HTTP " + response.status);
  return response.json();
}
async function findEmail(subject) {
  const list = await emailRequest("/emails?limit=100");
  const candidates = list.data.filter(
    (e) =>
      e.subject === subject &&
      e.from.includes("noreply@mail.boldlaunchstudio.com") &&
      e.to.includes(fixture.email) &&
      Date.parse(e.created_at) >= Date.parse(fixture.startedAt) - 1000,
  );
  candidates.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  if (!candidates.length)
    throw new Error(
      "The requested test email has not appeared yet; rerun this step after delivery",
    );
  return emailRequest("/emails/" + candidates[0].id);
}
function linkFrom(email, prefix) {
  const match = email.html.match(/href="([^"]+)"/);
  assert(match, "Expected the application email link");
  const link = new URL(match[1].replaceAll("&amp;", "&"));
  assert.equal(link.origin, base);
  assert(link.pathname.startsWith(prefix), "Unexpected email action");
  return link;
}
async function login() {
  const result = await api(
    "/api/auth/sign-in/email",
    { email: fixture.email, password: fixture.password },
    "",
  );
  assert(result.cookie);
  fixture.cookie = result.cookie;
  save();
}
if (process.argv.includes("--signup") && !fixture.registered) {
  const result = await api(
    "/api/auth/sign-up/email",
    {
      name: "BlogStack Launch Test",
      email: fixture.email,
      password: fixture.password,
      callbackURL: base + "/projects",
    },
    "",
  );
  fixture.userId = result.data.user.id;
  fixture.registered = true;
  save();
  console.log("PASS isolated signup request; verification email requested");
}
if (process.argv.includes("--resend") && !fixture.resent) {
  await api(
    "/api/resend-verification",
    { email: fixture.email, callbackURL: base + "/projects" },
    "",
  );
  fixture.resent = true;
  save();
  console.log("PASS verification resend request");
}
if (process.argv.includes("--verify") && !fixture.verified) {
  const email = await findEmail("Verify your BlogStack email");
  const response = await fetch(linkFrom(email, "/api/auth/verify-email"), {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  assert([200, 302, 303].includes(response.status));
  await login();
  const account = (await api("/accounts/me", undefined, fixture.cookie, "GET"))
    .data;
  assert.equal(account.ownerId, fixture.userId);
  fixture.accountId = account.id;
  fixture.verified = true;
  fixture.checks.verification = {
    emailId: email.id,
    lastEvent: email.last_event,
    authenticated: true,
  };
  save();
  console.log("PASS real email verification and authenticated owner account");
}
if (process.argv.includes("--request-reset") && !fixture.resetRequested) {
  await api(
    "/api/auth/request-password-reset",
    { email: fixture.email, redirectTo: base + "/reset-password" },
    "",
  );
  fixture.resetRequested = true;
  save();
  console.log("PASS password reset request");
}
if (process.argv.includes("--reset") && !fixture.reset) {
  const email = await findEmail("Reset your BlogStack password");
  const response = await fetch(linkFrom(email, "/api/auth/reset-password/"), {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  assert([302, 303].includes(response.status));
  const destination = new URL(response.headers.get("location"));
  assert.equal(destination.origin, base);
  const token = destination.searchParams.get("token");
  assert(token);
  const oldCookie = fixture.cookie,
    nextPassword = randomBytes(24).toString("base64url");
  await api(
    "/api/auth/reset-password",
    { token, newPassword: nextPassword },
    "",
  );
  fixture.password = nextPassword;
  save();
  const rejected = await fetch(base + "/accounts/me", {
    headers: { Cookie: oldCookie },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(rejected.status, 401, "Reset must revoke the previous session");
  await login();
  fixture.reset = true;
  fixture.checks.reset = {
    emailId: email.id,
    lastEvent: email.last_event,
    previousSessionRevoked: true,
    newLoginWorks: true,
  };
  save();
  console.log("PASS password reset, old-session revocation and new login");
}
if (process.argv.includes("--invite") && !fixture.invitation) {
  const owners = JSON.parse(
    readFileSync(".launch/billing-sandbox-fixture.json", "utf8"),
  );
  const owner = owners.users.find(
    (u) => u.plan === "studio" && u.interval === "month",
  );
  const result = await api(
    "/accounts/members",
    { email: fixture.email, role: "account_editor" },
    owner.cookie,
  );
  fixture.invitation = result.data;
  save();
  console.log("PASS queued invitation to the operator's test account");
}
if (process.argv.includes("--accept") && !fixture.accepted) {
  const email = await findEmail("You've been invited to BlogStack");
  const link = linkFrom(email, "/invite/");
  assert.equal(link.pathname.split("/").pop(), fixture.invitation.token);
  await api("/invitations/" + fixture.invitation.token + "/accept", {});
  fixture.accepted = true;
  fixture.checks.invitation = {
    emailId: email.id,
    lastEvent: email.last_event,
    accepted: true,
  };
  save();
  console.log(
    "PASS delivered invitation accepted by the matching verified account",
  );
}
if (process.argv.includes("--lifecycle") && !fixture.checks.lifecycle) {
  const email = await findEmail("Your BlogStack trial ends soon");
  fixture.checks.lifecycle = {
    emailId: email.id,
    lastEvent: email.last_event,
    scheduled: true,
  };
  save();
  console.log(
    "PASS real scheduled lifecycle notice reached the email provider",
  );
}
if (process.argv.includes("--report")) {
  for (const check of Object.values(fixture.checks))
    check.lastEvent = (
      await emailRequest("/emails/" + check.emailId)
    ).last_event;
  const list = await emailRequest("/emails?limit=100");
  const verificationEmails = [];
  for (const item of list.data.filter(
    (e) =>
      e.subject === "Verify your BlogStack email" &&
      e.from.includes("noreply@mail.boldlaunchstudio.com") &&
      e.to.includes(fixture.email) &&
      Date.parse(e.created_at) >= Date.parse(fixture.startedAt) - 1000,
  )) {
    const email = await emailRequest("/emails/" + item.id);
    verificationEmails.push({ emailId: email.id, lastEvent: email.last_event });
  }
  const evidence = {
    checkedAt: new Date().toISOString(),
    environment: "isolated Cloudflare sandbox",
    recipient: fixture.email,
    registered: !!fixture.registered,
    resent: !!fixture.resent,
    verificationEmails,
    ...fixture.checks,
  };
  writeFileSync(
    "artifacts/verification/auth-email.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
  save();
  if (process.argv.includes("--record")) {
    assert(
      fixture.registered && fixture.resent && fixture.reset && fixture.accepted,
    );
    assert(
      verificationEmails.length >= 2 &&
        verificationEmails.every((e) => e.lastEvent === "delivered"),
    );
    for (const key of ["verification", "reset", "invitation", "lifecycle"])
      assert.equal(
        fixture.checks[key]?.lastEvent,
        "delivered",
        key + " must be delivered",
      );
    for (const file of ["launch.env", ".launch/production.env"]) {
      const text = readFileSync(file, "utf8").replace(
        /^EMAIL_VERIFIED=.*$/m,
        "EMAIL_VERIFIED=true",
      );
      writeFileSync(file, text, { mode: 0o600 });
    }
    console.log(
      "Recorded real Cloudflare/Resend email acceptance; signup and checkout settings remain unchanged.",
    );
  }
}
