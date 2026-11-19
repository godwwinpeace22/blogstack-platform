import {
  epoch,
  type Env,
  type Run,
  type BackupState,
  type MediaRef,
} from "./types.js";

const requestTimeout = 20000;
export async function startBackup(env: Env, manual = false, now = epoch()) {
  const date = new Date((now + 3600) * 1000); // Africa/Lagos, UTC+1.
  const day = date.toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  const kind = manual ? "manual" : date.getUTCDay() === 0 ? "weekly" : "daily";
  const dayKey = manual ? "manual:" + id : day;
  const state: BackupState = {
    stage: "export",
    prefix: "snapshots/" + kind + "/" + id + "/",
    pages: 0,
    objects: 0,
    bytes: 0,
  };
  await env.STATE.prepare(
    "INSERT OR IGNORE INTO backup_runs(id,day_key,kind,state,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(id, dayKey, kind, JSON.stringify(state), now, now)
    .run();
  const run = await env.STATE.prepare(
    "SELECT id,status FROM backup_runs WHERE day_key=?",
  )
    .bind(dayKey)
    .first<{ id: string; status: string }>();
  if (!run) throw new Error("BACKUP_START_FAILED");
  if (run.status === "running")
    await env.JOBS.send({ kind: "backup", id: run.id });
  return run;
}

async function databaseExport(env: Env, state: BackupState): Promise<boolean> {
  if (!env.CF_BACKUP_TOKEN) throw new Error("BACKUP_CREDENTIAL_MISSING");
  const response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" +
      env.CF_ACCOUNT_ID +
      "/d1/database/" +
      env.SOURCE_DATABASE_ID +
      "/export",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.CF_BACKUP_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        output_format: "polling",
        ...(state.bookmark ? { current_bookmark: state.bookmark } : {}),
      }),
      signal: AbortSignal.timeout(requestTimeout),
      redirect: "manual",
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("DATABASE_EXPORT_HTTP_" + response.status);
  }
  const result = await response.json<{
    success: boolean;
    result: {
      status?: string;
      at_bookmark?: string;
      result?: { signed_url?: string };
    };
  }>();
  if (!result.success || result.result.status === "error")
    throw new Error("DATABASE_EXPORT_FAILED");
  if (result.result.at_bookmark) state.bookmark = result.result.at_bookmark;
  if (result.result.status !== "complete") return false;
  const url = new URL(result.result.result?.signed_url || "");
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".r2.cloudflarestorage.com")
  )
    throw new Error("EXPORT_DOWNLOAD_HOST_REJECTED");
  // Never forward the account credential to the signed object URL.
  const download = await fetch(url, {
    redirect: "manual",
    headers: { "Accept-Encoding": "identity" },
    signal: AbortSignal.timeout(60000),
  });
  if (!download.ok || !download.body) throw new Error("EXPORT_DOWNLOAD_FAILED");
  const key = state.prefix + "database.sql";
  // Preserve the response's known-length stream: no full-database buffering
  // or CPU-heavy compression in a Free-plan Worker.
  const object = await env.BACKUPS.put(key, download.body, {
    httpMetadata: { contentType: "application/sql" },
  });
  if (!object) throw new Error("DATABASE_BACKUP_WRITE_FAILED");
  const check = await env.BACKUPS.head(key);
  if (!check || check.etag !== object.etag || check.size !== object.size)
    throw new Error("DATABASE_BACKUP_VERIFY_FAILED");
  state.database = {
    key,
    etag: object.etag,
    size: object.size,
    bookmark: state.bookmark ?? null,
  };
  state.stage = "media";
  delete state.bookmark;
  return true;
}

async function copyMedia(env: Env, state: BackupState, now: number) {
  if (!state.pending?.length && !state.listed) {
    const page = await env.SOURCE_MEDIA.list({
      limit: 100,
      ...(state.cursor ? { cursor: state.cursor } : {}),
    });
    state.pending = page.objects.map((o) => ({
      key: o.key,
      etag: o.etag,
      size: o.size,
    }));
    state.cursor = page.truncated ? page.cursor : null;
    state.refs = [];
    state.listed = true;
  }
  // Bound every continuation below the Free plan's subrequest/query limits.
  for (const item of state.pending?.slice(0, 6) ?? []) {
    if (item.size > 10 * 1024 * 1024)
      throw new Error("SOURCE_MEDIA_EXCEEDS_LAUNCH_LIMIT");
    const backupKey =
      "objects/" + encodeURIComponent(item.key) + "/" + item.etag;
    let copied = await env.BACKUPS.head(backupKey);
    if (!copied) {
      const source = await env.SOURCE_MEDIA.get(item.key);
      if (!source) {
        // Physical deletes have a 48h grace; a <=6h snapshot cannot reference
        // an already-removed row's old object. Skip that orphan safely.
        const live = await env.SOURCE_DB.prepare(
          "SELECT id FROM media WHERE key=?",
        )
          .bind(item.key)
          .first();
        if (live) throw new Error("REFERENCED_MEDIA_MISSING");
        state.pending!.shift();
        continue;
      }
      if (source.etag !== item.etag) {
        await source.body.cancel();
        throw new Error("SOURCE_MEDIA_CHANGED_DURING_SNAPSHOT");
      }
      await env.BACKUPS.put(backupKey, source.body, {
        ...(source.httpMetadata ? { httpMetadata: source.httpMetadata } : {}),
        customMetadata: { sourceEtag: item.etag },
      });
      copied = await env.BACKUPS.head(backupKey);
    }
    if (!copied || copied.size !== item.size || copied.etag !== item.etag)
      throw new Error("MEDIA_BACKUP_CHECKSUM_MISMATCH");
    await env.STATE.prepare(
      "INSERT INTO backup_objects(version_key,source_key,etag,size,last_referenced_at) VALUES(?,?,?,?,?) ON CONFLICT(version_key) DO UPDATE SET last_referenced_at=excluded.last_referenced_at",
    )
      .bind(backupKey, item.key, item.etag, item.size, now)
      .run();
    state.refs!.push({ ...item, backupKey });
    state.objects++;
    state.bytes += item.size;
    state.pending!.shift();
  }
  if (!state.pending?.length) {
    await env.BACKUPS.put(
      state.prefix + "media/" + String(state.pages).padStart(6, "0") + ".json",
      JSON.stringify(state.refs ?? []),
      { httpMetadata: { contentType: "application/json" } },
    );
    state.pages++;
    state.refs = [];
    state.listed = false;
    return state.cursor === null;
  }
  return false;
}

export async function processBackup(env: Env, id: string, now = epoch()) {
  const token = crypto.randomUUID();
  const claim = await env.STATE.prepare(
    "UPDATE backup_runs SET lease_token=?,lease_until=? WHERE id=? AND status='running' AND COALESCE(lease_until,0)<?",
  )
    .bind(token, now + 120, id, now)
    .run();
  if (!claim.meta.changes) return;
  const run = await env.STATE.prepare("SELECT * FROM backup_runs WHERE id=?")
    .bind(id)
    .first<Run>();
  if (!run) return;
  const state = JSON.parse(run.state) as BackupState;
  try {
    if (now - run.created_at > 6 * 3600)
      throw new Error("BACKUP_EXCEEDED_SNAPSHOT_WINDOW");
    let complete = false;
    if (state.stage === "export") await databaseExport(env, state);
    else complete = await copyMedia(env, state, now);
    if (complete) {
      const manifest = {
        version: 1,
        id,
        kind: run.kind,
        startedAt: run.created_at,
        completedAt: now,
        sourceDatabaseId: env.SOURCE_DATABASE_ID,
        sourceBucket: env.SOURCE_BUCKET_NAME,
        database: state.database,
        mediaPages: state.pages,
        mediaObjects: state.objects,
        mediaBytes: state.bytes,
        checksum: "R2 single-part MD5 ETags",
        encryptedAtRest: "Cloudflare R2",
        retentionDays: run.kind === "weekly" ? 90 : 30,
      };
      await env.BACKUPS.put(
        state.prefix + "manifest.json",
        JSON.stringify(manifest),
        { httpMetadata: { contentType: "application/json" } },
      );
      await env.STATE.prepare(
        "UPDATE backup_runs SET status='complete',state=?,completed_at=?,updated_at=?,lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=? AND lease_token=?",
      )
        .bind(JSON.stringify(state), now, now, id, token)
        .run();
    } else {
      await env.STATE.prepare(
        "UPDATE backup_runs SET state=?,updated_at=?,lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=? AND lease_token=?",
      )
        .bind(JSON.stringify(state), now, id, token)
        .run();
      await env.JOBS.send(
        { kind: "backup", id },
        { delaySeconds: state.stage === "export" ? 1 : 0 },
      );
    }
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "BACKUP_STEP_FAILED";
    await env.STATE.prepare(
      "UPDATE backup_runs SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'failed' ELSE status END,error_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?",
    )
      .bind(code, now, id, token)
      .run();
    throw new Error(code); // Never log signed URLs, provider bodies or credentials.
  }
}

export async function maintainBackups(env: Env, now = epoch()) {
  const stuck = await env.STATE.prepare(
    "SELECT id FROM backup_runs WHERE status='running' AND COALESCE(lease_until,0)<? AND updated_at<? LIMIT 3",
  )
    .bind(now, now - 60)
    .all<{ id: string }>();
  for (const run of stuck.results)
    await env.JOBS.send({ kind: "backup", id: run.id });
  const old = await env.STATE.prepare(
    "SELECT id,state FROM backup_runs WHERE status!='running' AND created_at<?-CASE WHEN kind='weekly' THEN 7776000 ELSE 2592000 END ORDER BY created_at LIMIT 1",
  )
    .bind(now)
    .first<{ id: string; state: string }>();
  if (old) {
    const state = JSON.parse(old.state) as BackupState;
    if (
      !/^snapshots\/(?:daily|weekly|manual)\/[a-f0-9-]+\/$/.test(state.prefix)
    )
      throw new Error("RETENTION_PREFIX_REJECTED");
    const objects = await env.BACKUPS.list({
      prefix: state.prefix,
      limit: 1000,
    });
    if (objects.objects.length)
      await env.BACKUPS.delete(objects.objects.map((o) => o.key));
    if (!objects.truncated)
      await env.STATE.prepare(
        "DELETE FROM backup_runs WHERE id=? AND status!='running'",
      )
        .bind(old.id)
        .run();
  }
  // Content-addressed media is shared by snapshots, so keep each version for
  // 90 days after its latest reference, including references in partial runs.
  const objects = await env.STATE.prepare(
    "SELECT version_key FROM backup_objects WHERE last_referenced_at<? LIMIT 10",
  )
    .bind(now - 90 * 86400)
    .all<{ version_key: string }>();
  for (const object of objects.results) {
    if (!object.version_key.startsWith("objects/"))
      throw new Error("RETENTION_OBJECT_REJECTED");
    await env.BACKUPS.delete(object.version_key);
    await env.STATE.prepare(
      "DELETE FROM backup_objects WHERE version_key=? AND last_referenced_at<?",
    )
      .bind(object.version_key, now - 90 * 86400)
      .run();
  }
}
