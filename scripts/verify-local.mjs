import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const api = "http://localhost:8787",
  origin = "http://localhost:3001";
const signIn = await fetch(api + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "qa-launch@example.com",
    password: "BlogStack-local-test-2026!",
  }),
});
assert.equal(
  signIn.status,
  200,
  "Create and verify the local qa-launch@example.com browser test account first.",
);
const cookie = signIn.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
async function request(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: { origin, cookie, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(
      path + " returned " + response.status + ": " + (await response.text()),
    );
  return response.json();
}
const projects = await request("/projects"),
  project = projects.find((p) => p.slug === "launch-journal");
assert(project, "Create the local launch-journal blog first.");
const posts = await request("/projects/" + project.id + "/posts"),
  post = posts.data.find((p) => p.slug === "hello-blogstack");
assert(post, "Create and save hello-blogstack in the dashboard first.");
const image = readFileSync(
  process.argv[2] || "/private/tmp/blogstack-cover.png",
);
const pending = await request(
  "/projects/" + project.id + "/media/presign",
  "POST",
  { filename: "launch-cover.png", mimeType: "image/png", size: image.length },
);
assert.equal(
  (
    await fetch(pending.presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: image,
    })
  ).status,
  201,
);
const publicUrl = "http://localhost:8788/" + encodeURIComponent(pending.key);
assert.equal(
  (await fetch(publicUrl)).status,
  404,
  "unconfirmed uploads must stay private",
);
const media = await request(
  "/projects/" + project.id + "/media/confirm/" + pending.mediaId,
  "POST",
  {},
);
assert.equal(media.size, image.length);
assert.equal(
  (await fetch(media.url)).status,
  200,
  "confirmed image must be delivered by the CDN",
);
const blocks = JSON.parse(post.content).filter(
  (block) => block.id !== "launch-code",
);
blocks.push({
  id: "launch-code",
  type: "codeBlock",
  props: { language: "typescript" },
  content: [{ type: "text", text: 'const publication = "reviewed";' }],
});
const updated = await request(
  "/projects/" + project.id + "/posts/" + post.id,
  "PATCH",
  {
    revision: post.revision,
    coverImage: media.url,
    content: JSON.stringify(blocks),
  },
);
const preview = await request(
  "/projects/" + project.id + "/posts/" + post.id + "/preview",
);
assert(preview.renderedHtml.includes("written in the BlogStack dashboard"));
assert(
  preview.renderedHtml.includes("publication") &&
    preview.renderedHtml.includes("color:"),
  "code highlighting must work in the actual Workers runtime",
);
await request(
  "/projects/" + project.id + "/posts/" + post.id + "/publish",
  "POST",
  { revision: updated.revision },
);
const live = await (
  await fetch(api + "/public/launch-journal/posts/hello-blogstack")
).json();
assert.equal(live.coverImage, media.url);
assert(live.renderedHtml.includes("written in the BlogStack dashboard"));
const savedPrivate = await request(
  "/projects/" + project.id + "/posts/" + post.id,
  "PATCH",
  { revision: updated.revision, title: "Private revision awaiting approval" },
);
const stillLive = await (
  await fetch(api + "/public/launch-journal/posts/hello-blogstack")
).json();
assert.equal(stillLive.title, "Hello from BlogStack");
const stale = await fetch(
  api + "/projects/" + project.id + "/posts/" + post.id + "/publish",
  {
    method: "POST",
    headers: { origin, cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ revision: updated.revision }),
  },
);
assert.equal(stale.status, 409);
await request("/projects/" + project.id + "/posts/" + post.id, "PATCH", {
  revision: savedPrivate.revision,
  title: "Hello from BlogStack",
});
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/local-publication.json",
  JSON.stringify(
    {
      projectId: project.id,
      postId: post.id,
      postUrl: "http://localhost:3003/blog/hello-blogstack",
      imageUrl: media.url,
      verified: [
        "signed upload",
        "private pending media",
        "confirmed CDN delivery",
        "rendered preview",
        "publication",
        "private revision isolation",
        "stale publish conflict",
      ],
    },
    null,
    2,
  ),
);
console.log(
  "PASS: signed upload → R2 confirmation → CDN → private preview → publish → isolated private revision → stale publish rejection.",
);
