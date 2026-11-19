import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    snapshot: { type: "string" },
    kind: { type: "string" },
    directory: { type: "string" },
    bucket: { type: "string", default: "blogstack-backups" },
    config: { type: "string" },
  },
});
if (
  !/^[a-f0-9-]{36}$/.test(values.snapshot || "") ||
  !["manual", "daily", "weekly"].includes(values.kind)
)
  throw new Error(
    "Supply --snapshot UUID --kind manual|daily|weekly --directory NEW_PRIVATE_DIRECTORY",
  );
if (!values.directory) throw new Error("Missing --directory");
const directory = resolve(values.directory);
if (existsSync(directory))
  throw new Error(
    "Destination must not exist; previous recovery evidence is never overwritten",
  );
mkdirSync(directory, { recursive: true, mode: 0o700 });
const prefix = "snapshots/" + values.kind + "/" + values.snapshot + "/";
function download(key, filename) {
  const path = join(directory, filename);
  const result = spawnSync(
    process.execPath,
    [
      ...(values.config
        ? [
            "node_modules/wrangler/bin/wrangler.js",
            "--config",
            resolve(values.config),
          ]
        : ["scripts/launch.mjs", "cloudflare"]),
      "r2",
      "object",
      "get",
      // Wrangler interpolates this argument into a URL path without escaping.
      // Preserve literal percent-encoded source keys in the backup namespace.
      values.bucket + "/" + key.split("/").map(encodeURIComponent).join("/"),
      "--remote",
      "--file",
      path,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(
      "Backup download failed for " +
        filename +
        "; provider output withheld to protect private URLs",
    );
  chmodSync(path, 0o600);
  return path;
}
const manifest = JSON.parse(
  readFileSync(download(prefix + "manifest.json", "manifest.json"), "utf8"),
);
if (
  manifest.version !== 1 ||
  manifest.id !== values.snapshot ||
  manifest.kind !== values.kind ||
  manifest.database?.key !== prefix + "database.sql" ||
  !Number.isSafeInteger(manifest.mediaPages) ||
  manifest.mediaPages < 1
)
  throw new Error("Invalid completed backup manifest");
function verify(path, item) {
  const bytes = readFileSync(path);
  if (
    bytes.length !== item.size ||
    createHash("md5").update(bytes).digest("hex") !== item.etag
  )
    throw new Error("Backup checksum mismatch: " + item.key);
  return {
    file: path,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const database = verify(
  download(manifest.database.key, "database.sql"),
  manifest.database,
);
const media = [];
for (let i = 0; i < manifest.mediaPages; i++) {
  const page = JSON.parse(
    readFileSync(
      download(
        prefix + "media/" + String(i).padStart(6, "0") + ".json",
        "media-" + i + ".json",
      ),
      "utf8",
    ),
  );
  if (!Array.isArray(page)) throw new Error("Invalid media manifest page");
  for (const item of page) {
    if (
      typeof item.key !== "string" ||
      item.backupKey !==
        "objects/" + encodeURIComponent(item.key) + "/" + item.etag ||
      !/^[a-f0-9]{32}$/.test(item.etag)
    )
      throw new Error("Invalid media version reference");
    media.push({
      key: item.key,
      etag: item.etag,
      ...verify(
        download(item.backupKey, "object-" + media.length + ".bin"),
        item,
      ),
    });
  }
}
if (
  media.length !== manifest.mediaObjects ||
  media.reduce((sum, item) => sum + item.size, 0) !== manifest.mediaBytes
)
  throw new Error("Media inventory does not match the completed manifest");
const evidence = {
  snapshot: manifest.id,
  downloadedAt: new Date().toISOString(),
  manifest,
  database,
  media,
};
writeFileSync(
  join(directory, "verified.json"),
  JSON.stringify(evidence, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    snapshot: manifest.id,
    directory,
    sqlBytes: database.size,
    mediaObjects: media.length,
    mediaBytes: manifest.mediaBytes,
    verified: true,
  }),
);
console.log(
  "No import was performed. Restore only into isolated D1/R2 resources, revoke restored sessions and verification rows, and keep outbound integrations disabled.",
);
