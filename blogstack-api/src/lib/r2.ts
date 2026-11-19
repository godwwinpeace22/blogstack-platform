import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { Bindings } from "../types.js";

/**
 * Creates an S3Client pointed at Cloudflare R2 using the account ID from the
 * worker environment. The endpoint is derived from the ACCOUNT_ID variable or
 * falls back to using the R2 binding directly for local dev.
 *
 * For presigned URLs we need the S3-compat API (not the R2 binding).
 */
export function getR2S3Client(env: {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID ?? "unknown"}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
}

/**
 * Generates a presigned PUT URL for direct browser-to-R2 uploads.
 * The URL expires in 15 minutes.
 */
export async function presignPut(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, cmd, { expiresIn: 900 });
}

/**
 * Deletes an object from R2 via the R2 binding (no S3 client needed).
 * Also purges the CDN_CACHE KV entry for any image variants.
 */
export async function deleteMedia(
  env: Bindings,
  key: string,
  mediaId: string,
  physical = false,
): Promise<void> {
  const grace = Math.max(0, Number(env.MEDIA_DELETE_GRACE_SECONDS) || 0);
  if (physical || grace === 0) await env.MEDIA.delete(key);
  else {
    // Logical removal is immediate. Preserve bytes long enough for a bounded
    // database/media snapshot to finish without racing a concurrent deletion.
    await env.MAIN_DB.prepare(
      "INSERT OR IGNORE INTO r2_deletions(key,media_id) VALUES(?,?)",
    )
      .bind(key, mediaId)
      .run();
  }

  await env.CDN_CACHE.delete(`cdn:${key}`);

  // 2. Purge CDN_CACHE variants (format: `img:{key}:{variant}`)
  // We list with prefix and delete — up to 100 variants per image
  const listed = await env.CDN_CACHE.list({ prefix: `img:${key}:` });
  if (listed.keys.length > 0) {
    await Promise.all(listed.keys.map((k) => env.CDN_CACHE.delete(k.name)));
  }

  // 3. Delete D1 record (caller's responsibility to do this in a transaction)
  // (not done here — let the route handler manage the D1 delete)
  void mediaId; // used by caller
}

/**
 * Returns the CDN delivery URL for a given R2 key.
 */
export function mediaToCdnUrl(cdnBase: string, key: string): string {
  // Encode the key to be URL-safe
  return `${cdnBase}/${encodeURIComponent(key)}`;
}
