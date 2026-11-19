const base = "http://localhost:8787",
  origin = "http://localhost:3001";
const response = await fetch(base + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "qa-launch@example.com",
    password: "BlogStack-local-test-2026!",
  }),
});
if (!response.ok) throw new Error("Local owner login failed");
const cookie = response.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
const headers = { origin, cookie };
const projects = await (await fetch(base + "/projects", { headers })).json();
const project = projects.find((p) => p.slug === "launch-journal");
const invitations = await (
  await fetch(base + "/projects/" + project.id + "/invitations", { headers })
).json();
const invitation = invitations.find(
  (i) => i.email === "qa-client@example.com" && !i.acceptedAt,
);
if (!invitation)
  throw new Error("Create the disposable local client invitation first.");
console.log(origin + "/invite/" + invitation.token);
