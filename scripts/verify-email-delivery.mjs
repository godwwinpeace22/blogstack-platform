import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

const evidencePath = "artifacts/verification/email-delivery.json";
const sending = JSON.parse(readFileSync(".launch/email-key.json", "utf8"));
const setup = parseEnv(readFileSync("blogstack-api/.dev.vars", "utf8"));
async function request(path, token, method = "GET", body) {
  const response = await fetch("https://api.resend.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(method === "POST"
        ? { "Idempotency-Key": "blogstack-launch-sender-verification-v1" }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      "Resend verification returned HTTP " +
        response.status +
        ": " +
        (result.message || "request failed"),
    );
  return result;
}
let evidence = existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, "utf8"))
  : null;
if (!evidence) {
  const result = await request("/emails", sending.token, "POST", {
    from: "BlogStack <noreply@mail.boldlaunchstudio.com>",
    to: ["hello@boldlaunchstudio.com"],
    subject: "BlogStack email setup verification",
    text: "BlogStack's transactional sender is configured. This single test verifies delivery from noreply@mail.boldlaunchstudio.com to the operator's support mailbox. Signup and checkout remain disabled while launch acceptance is completed. No action is required.",
  });
  evidence = {
    emailId: result.id,
    from: "noreply@mail.boldlaunchstudio.com",
    to: "hello@boldlaunchstudio.com",
    sentAt: new Date().toISOString(),
    deliveryVerified: false,
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
}
const delivered = await request(
  "/emails/" + evidence.emailId,
  setup.RESEND_API_KEY,
);
evidence.lastEvent = delivered.last_event;
evidence.checkedAt = new Date().toISOString();
evidence.deliveryVerified = delivered.last_event === "delivered";
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence));
console.log(
  "Signup, reset, invitation and lifecycle delivery remain separate acceptance checks.",
);
