import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

const prepared = JSON.parse(
  readFileSync("artifacts/email-domain.json", "utf8"),
);
if (prepared.name !== "mail.boldlaunchstudio.com")
  throw new Error("Review the sender domain before continuing");
const setup = parseEnv(readFileSync("blogstack-api/.dev.vars", "utf8"));
if (!setup.RESEND_API_KEY) throw new Error("Email setup credential is missing");
async function request(path, method = "GET", body) {
  const response = await fetch("https://api.resend.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + setup.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      "Email provider returned " +
        response.status +
        ": " +
        (result.message || result.name || "request failed"),
    );
  return result;
}
if (process.argv.includes("--verify"))
  await request("/domains/" + prepared.id + "/verify", "POST");
const domain = await request("/domains/" + prepared.id);
writeFileSync(
  "artifacts/email-domain.json",
  JSON.stringify(domain, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    domain: domain.name,
    status: domain.status,
    records: domain.records?.map((record) => ({
      name: record.name,
      type: record.type,
      status: record.status,
    })),
  }),
);
if (!process.argv.includes("--create-key")) process.exit();
if (domain.status !== "verified")
  throw new Error(
    "Sender verification must complete before installing its sending key",
  );
const keyPath = ".launch/email-key.json";
let credential;
if (existsSync(keyPath)) {
  credential = JSON.parse(readFileSync(keyPath, "utf8"));
  if (
    credential.domainId !== prepared.id ||
    credential.permission !== "sending_access"
  )
    throw new Error("Stored email credential needs review");
} else {
  const result = await request("/api-keys", "POST", {
    name: "BlogStack transactional email",
    permission: "sending_access",
    domain_id: prepared.id,
  });
  if (!result.token || !result.id)
    throw new Error("The provider did not return the newly created credential");
  credential = {
    id: result.id,
    token: result.token,
    domainId: prepared.id,
    permission: "sending_access",
  };
  writeFileSync(keyPath, JSON.stringify(credential, null, 2) + "\n", {
    mode: 0o600,
  });
}
for (const path of [
  ".launch/secrets.json",
  ".launch/production.secrets.json",
]) {
  if (!existsSync(path)) continue;
  const secrets = JSON.parse(readFileSync(path, "utf8"));
  secrets.RESEND_API_KEY = credential.token;
  writeFileSync(path, JSON.stringify(secrets, null, 2) + "\n", { mode: 0o600 });
}
for (const path of ["launch.env", ".launch/production.env"]) {
  if (!existsSync(path)) continue;
  let text = readFileSync(path, "utf8");
  for (const [key, value] of Object.entries({
    RESEND_API_KEY: credential.token,
    EMAIL_FROM: '"BlogStack <noreply@mail.boldlaunchstudio.com>"',
  })) {
    const pattern = new RegExp("^" + key + "=.*$", "m");
    text = pattern.test(text)
      ? text.replace(pattern, key + "=" + value)
      : text + "\n" + key + "=" + value;
  }
  writeFileSync(path, text, { mode: 0o600 });
}
for (const path of [
  ".launch/app.wrangler.json",
  ".launch/production.app.wrangler.json",
]) {
  if (!existsSync(path)) continue;
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.vars.EMAIL_FROM = "BlogStack <noreply@mail.boldlaunchstudio.com>";
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}
writeFileSync(
  "artifacts/verification/email-configuration.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      domain: prepared.name,
      domainVerified: true,
      keyId: credential.id,
      permission: credential.permission,
      from: "BlogStack <noreply@mail.boldlaunchstudio.com>",
      deliveryVerified: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Verified sender and domain-restricted send-only credential stored privately. Email delivery acceptance remains pending.",
);
