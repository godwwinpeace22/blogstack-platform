import { createRequire } from "node:module";
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} = createRequire(new URL("../blogstack-api/package.json", import.meta.url))(
  "@aws-sdk/client-s3",
);
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const apply = process.argv.includes("--apply");
if (!apply) {
  console.log(
    "Media backup copies source R2 objects to an independently controlled S3-compatible destination and records SHA-256/size. Supply BACKUP_SOURCE_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY and BACKUP_DEST_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY, then run --apply. No network request was made.",
  );
  process.exit();
}
function config(prefix) {
  for (const name of [
    "ENDPOINT",
    "BUCKET",
    "ACCESS_KEY_ID",
    "SECRET_ACCESS_KEY",
  ])
    if (!process.env[prefix + name])
      throw new Error("Missing " + prefix + name + " (values hidden)");
  return {
    endpoint: process.env[prefix + "ENDPOINT"],
    bucket: process.env[prefix + "BUCKET"],
    region: process.env[prefix + "REGION"] || "auto",
    credentials: {
      accessKeyId: process.env[prefix + "ACCESS_KEY_ID"],
      secretAccessKey: process.env[prefix + "SECRET_ACCESS_KEY"],
    },
  };
}
const source = config("BACKUP_SOURCE_"),
  destination = config("BACKUP_DEST_");
if (
  source.endpoint === destination.endpoint &&
  source.bucket === destination.bucket
)
  throw new Error("Backup destination must differ from the live media bucket.");
const from = new S3Client(source),
  to = new S3Client(destination);
const stamp = new Date().toISOString().replaceAll(":", "-"),
  prefix = "snapshots/" + stamp + "/",
  manifest = [];
let token;
do {
  const page = await from.send(
    new ListObjectsV2Command({
      Bucket: source.bucket,
      ContinuationToken: token,
    }),
  );
  for (const item of page.Contents ?? []) {
    if (!item.Key) continue;
    if ((item.Size ?? 0) > 10 * 1024 * 1024)
      throw new Error(
        "Review a media object above the 10 MiB launch limit before backing it up.",
      );
    const object = await from.send(
      new GetObjectCommand({ Bucket: source.bucket, Key: item.Key }),
    );
    const bytes = await object.Body.transformToByteArray(),
      sha256 = createHash("sha256").update(bytes).digest("hex");
    const key = prefix + item.Key;
    await to.send(
      new PutObjectCommand({
        Bucket: destination.bucket,
        Key: key,
        Body: bytes,
        ContentType: object.ContentType,
        Metadata: { sha256 },
      }),
    );
    const copied = await to.send(
      new HeadObjectCommand({ Bucket: destination.bucket, Key: key }),
    );
    if (
      copied.ContentLength !== bytes.length ||
      copied.Metadata?.sha256 !== sha256
    )
      throw new Error("Backup object verification failed.");
    manifest.push({
      key: item.Key,
      backupKey: key,
      size: bytes.length,
      sha256,
      contentType: object.ContentType,
    });
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
const content = JSON.stringify(
  { createdAt: new Date().toISOString(), prefix, objects: manifest },
  null,
  2,
);
await to.send(
  new PutObjectCommand({
    Bucket: destination.bucket,
    Key: prefix + "manifest.json",
    Body: content,
    ContentType: "application/json",
  }),
);
mkdirSync("artifacts/backups", { recursive: true });
writeFileSync("artifacts/backups/media-" + stamp + ".json", content, {
  mode: 0o600,
});
console.log(
  "Copied and verified " +
    manifest.length +
    " media objects. Keep this manifest private and apply the documented retention policy to destination snapshots.",
);
