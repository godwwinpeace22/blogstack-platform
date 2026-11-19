import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const base = "http://localhost:8790",
  origin = "http://localhost:3001";
const selected = process.argv.slice(2);
const profiles = selected.length ? selected : ["writing", "seo", "linking"];
assert(profiles.every((p) => ["writing", "seo", "linking"].includes(p)));
const signin = await fetch(base + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "qa-launch@example.com",
    password: "BlogStack-local-test-2026!",
  }),
});
assert.equal(signin.status, 200);
const cookie = signin.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
const { projectId, postId } = JSON.parse(
  readFileSync("artifacts/local-publication.json", "utf8"),
);
async function request(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: { origin, cookie, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok)
    throw new Error(path + " returned " + r.status + ": " + (await r.text()));
  return r.json();
}
const path = "/projects/" + projectId,
  article = await request(path + "/posts/" + postId);
const prompts = {
  writing:
    "Propose a concise excerpt, no more than 120 characters, using only facts in the selected draft. Keep its article body unchanged.",
  seo: "Call seo_report, explain one relevant finding, and propose a search description of at most 150 characters. Keep the article body unchanged.",
  linking:
    "Call list_posts and explain which existing articles could be linked from this draft. Do not recommend linking to the selected article itself and never invent URLs. If no relevant alternatives exist, return changes: {}.",
};
const evidence = [];
for (const profile of profiles) {
  const { id } = await request(path + "/agent-runs", "POST", {
    postId,
    profile,
    prompt: prompts[profile],
  });
  let run;
  for (let attempt = 0; attempt < 400; attempt++) {
    run = await request(path + "/agent-runs/" + id);
    if (["complete", "failed"].includes(run.status)) break;
    if (run.status === "queued")
      await fetch(
        base +
          "/cdn-cgi/local/scheduled?cron=" +
          encodeURIComponent("* * * * *") +
          "&format=json",
        { signal: AbortSignal.timeout(55000) },
      ).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(
    run?.status,
    "complete",
    profile + ": " + (run?.error || "did not finish"),
  );
  assert(run.proposals?.every((p) => p.state === "pending"));
  const after = await request(path + "/posts/" + postId);
  assert.equal(
    after.revision,
    article.revision,
    "model requests must not edit drafts",
  );
  assert.equal(
    after.content,
    article.content,
    "model requests must not edit content",
  );
  evidence.push({
    profile,
    id,
    status: run.status,
    credits: run.credits,
    proposals: run.proposals.length,
    draftUnchanged: true,
  });
  console.log(
    "PASS " +
      profile +
      ": completed with " +
      run.credits +
      " credits; suggestions await review and the draft is unchanged.",
  );
}
mkdirSync("artifacts/verification", { recursive: true });
writeFileSync(
  "artifacts/verification/ai-live.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      provider: "Cloudflare Workers AI via native binding",
      evidence,
    },
    null,
    2,
  ) + "\n",
);
