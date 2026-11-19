export type Job =
  | { kind: "backup"; id: string }
  | { kind: "monitor" | "maintain" };
export interface Env {
  STATE: D1Database;
  SOURCE_DB: D1Database;
  SOURCE_MEDIA: R2Bucket;
  BACKUPS: R2Bucket;
  JOBS: Queue<Job>;
  MAIN_QUEUE: Queue;
  MAIN_DEAD: Queue;
  OPS_DEAD: Queue;
  CF_ACCOUNT_ID: string;
  SOURCE_DATABASE_ID: string;
  SOURCE_BUCKET_NAME: string;
  CF_BACKUP_TOKEN?: string;
  CF_ANALYTICS_TOKEN?: string;
  CF_BACKUP_TOKEN_EXPIRES?: string;
  CF_ANALYTICS_TOKEN_EXPIRES?: string;
  RESEND_API_KEY?: string;
  ALERT_EMAIL: string;
  EMAIL_FROM: string;
  HEALTH_URLS: string;
  WORKER_NAMES: string;
  OPS_ENABLED?: string;
}
export interface MediaRef {
  key: string;
  etag: string;
  size: number;
  backupKey: string;
}
export interface BackupState {
  stage: "export" | "media";
  prefix: string;
  bookmark?: string;
  database?: {
    key: string;
    etag: string;
    size: number;
    bookmark: string | null;
  };
  cursor?: string | null;
  listed?: boolean;
  pending?: { key: string; etag: string; size: number }[];
  refs?: MediaRef[];
  pages: number;
  objects: number;
  bytes: number;
}
export interface Run {
  id: string;
  kind: string;
  status: string;
  state: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  attempts: number;
}
export const epoch = () => Math.floor(Date.now() / 1000);
export async function stateGet<T>(env: Env, id: string): Promise<T | null> {
  const row = await env.STATE.prepare("SELECT value FROM ops_state WHERE id=?")
    .bind(id)
    .first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}
export async function statePut(env: Env, id: string, value: unknown) {
  await env.STATE.prepare(
    "INSERT INTO ops_state(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  )
    .bind(id, JSON.stringify(value), epoch())
    .run();
}
