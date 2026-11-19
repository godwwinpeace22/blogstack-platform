import { epoch, stateGet, statePut, type Env } from "./types.js";

export interface Issue {
  code: string;
  message: string;
}
export interface AlertState {
  codes: string[];
  eventId: string;
  sentAt: number;
  subject?: string;
  text?: string;
}

async function send(env: Env, subject: string, text: string, id: string) {
  if (!env.RESEND_API_KEY) throw new Error("ALERT_CREDENTIAL_MISSING");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": id,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.ALERT_EMAIL],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error("ALERT_SEND_FAILED");
  }
  const result = await r.json<{ id: string }>();
  return result.id;
}
export async function notify(
  env: Env,
  issues: Issue[],
  now = epoch(),
  key = "health.alert",
) {
  const codes = [...new Set(issues.map((i) => i.code))].sort();
  const previous = await stateGet<AlertState>(env, key);
  const same = JSON.stringify(codes) === JSON.stringify(previous?.codes ?? []);
  if (same && (!previous || previous.sentAt)) return { sent: false };
  const recovery = codes.length === 0;
  let event = previous;
  if (!same) {
    event = {
      codes,
      eventId: crypto.randomUUID(),
      sentAt: 0,
      subject: recovery ? "BlogStack recovered" : "BlogStack needs attention",
      text:
        (recovery
          ? "The previously reported issues have cleared."
          : issues.map((i) => i.message).join("\n")) +
        "\n\nChecked at " +
        new Date(now * 1000).toISOString() +
        ". Details are available through the private BlogStack operations status. No customer content is included in this email.",
    };
    // Claim a stable event before sending. Concurrent checks and a retry after
    // delivery/state-write failure reuse the same Resend idempotency key/body.
    const claim = await env.STATE.prepare(
      "INSERT INTO ops_state(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE ops_state.value=?",
    )
      .bind(key, JSON.stringify(event), now, JSON.stringify(previous))
      .run();
    if (!claim.meta.changes) return { sent: false };
  }
  if (!event?.subject || !event.text) throw new Error("ALERT_EVENT_INVALID");
  const emailId = await send(
    env,
    event.subject,
    event.text,
    "blogstack-ops-" + event.eventId,
  );
  await env.STATE.prepare(
    "UPDATE ops_state SET value=?,updated_at=? WHERE id=? AND value=?",
  )
    .bind(
      JSON.stringify({ ...event, sentAt: now }),
      now,
      key,
      JSON.stringify(event),
    )
    .run();
  return { sent: true, emailId, recovery };
}
export async function testAlert(
  env: Env,
  phase: "incident" | "recovery",
  testId: string,
) {
  const id = "ops-delivery-test-" + testId + "-" + phase;
  const emailId = await send(
    env,
    phase === "incident"
      ? "BlogStack alert delivery test"
      : "BlogStack recovery delivery test",
    "This is the requested BlogStack operations delivery test. " +
      (phase === "incident"
        ? "The monitor can report an incident."
        : "The monitor can report recovery.") +
      " No real incident has been created and no billing settings were changed.",
    id,
  );
  await statePut(env, "alert.delivery." + phase, {
    emailId,
    at: epoch(),
    testId,
  });
  return { emailId, testId, phase };
}
export async function collectIssues(env: Env, now = epoch()) {
  const issues: Issue[] = [];
  const targets = JSON.parse(env.HEALTH_URLS) as {
    name: string;
    url: string;
    contains?: string;
  }[];
  const health = await Promise.all(
    targets.map(async (target) => {
      try {
        const r = await fetch(target.url, {
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
          headers: {
            Accept: "text/html,application/json",
            "User-Agent": "BlogStack-Monitor/1.0",
          },
        });
        if (!r.ok) {
          await r.body?.cancel();
          return {
            code: "http:" + target.name,
            message: target.name + " returned HTTP " + r.status,
          };
        }
        if (target.contains) {
          const body = await r.text();
          if (!body.includes(target.contains))
            return {
              code: "http:" + target.name,
              message: target.name + " did not contain its expected response",
            };
        } else await r.body?.cancel();
        return null;
      } catch {
        return {
          code: "http:" + target.name,
          message: target.name + " did not respond before the timeout",
        };
      }
    }),
  );
  for (const issue of health) if (issue) issues.push(issue);
  try {
    const counts = await env.SOURCE_DB.prepare(
      "SELECT (SELECT COUNT(*) FROM background_jobs WHERE status='failed') AS failed,(SELECT COUNT(*) FROM background_jobs WHERE status='running' AND lease_until<?) AS stalled,(SELECT COUNT(*) FROM background_jobs WHERE status='pending' AND available_at<?) AS overdue,(SELECT COUNT(*) FROM r2_deletions WHERE created_at<?) AS cleanup,(SELECT COUNT(*) FROM payment_events WHERE processed_at IS NULL AND received_at<?) AS payments,(SELECT COUNT(*) FROM background_jobs WHERE kind='email' AND status='failed') AS email",
    )
      .bind(now - 600, now - 600, now - 72 * 3600, now - 900)
      .first<Record<string, number>>();
    for (const [metric, count] of Object.entries(counts ?? {}))
      if (count > 0)
        issues.push({
          code: "jobs:" + metric,
          message: count + " " + metric + " operational records need attention",
        });
  } catch {
    issues.push({
      code: "database:checks",
      message: "The production database operations check failed",
    });
  }
  const queues = [
    ["publishing", env.MAIN_QUEUE],
    ["publishing dead letters", env.MAIN_DEAD],
    ["operations", env.JOBS],
    ["operations dead letters", env.OPS_DEAD],
  ] as const;
  for (const [name, queue] of queues) {
    try {
      const m = await queue.metrics();
      const age = m.oldestMessageTimestamp
        ? (now * 1000 - m.oldestMessageTimestamp.getTime()) / 1000
        : 0;
      if (
        (name.includes("dead letters") && m.backlogCount > 0) ||
        m.backlogCount > 100 ||
        age > 600
      )
        issues.push({
          code: "queue:" + name,
          message:
            name +
            " queue has " +
            m.backlogCount +
            " messages; oldest is " +
            Math.max(0, Math.floor(age)) +
            " seconds",
        });
    } catch {
      issues.push({
        code: "queue:" + name,
        message: name + " queue metrics could not be read",
      });
    }
  }
  try {
    if (!env.CF_ANALYTICS_TOKEN) throw new Error("MISSING_METRICS_TOKEN");
    const query =
      "query($accountTag:string!,$since:Time!,$until:Time!,$names:[string!]){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$since,datetime_leq:$until,scriptName_in:$names}){dimensions{scriptName}sum{requests errors}}}}}";
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.CF_ANALYTICS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          accountTag: env.CF_ACCOUNT_ID,
          since: new Date((now - 900) * 1000).toISOString(),
          until: new Date(now * 1000).toISOString(),
          names: JSON.parse(env.WORKER_NAMES),
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await r.json<{
      errors?: unknown[];
      data?: {
        viewer: {
          accounts: {
            workersInvocationsAdaptive: {
              dimensions: { scriptName: string };
              sum: { requests: number; errors: number };
            }[];
          }[];
        };
      };
    }>();
    if (!r.ok || body.errors?.length || !body.data?.viewer.accounts.length)
      throw new Error("METRICS_UNAVAILABLE");
    for (const row of body.data.viewer.accounts[0]!
      .workersInvocationsAdaptive) {
      const { requests, errors } = row.sum;
      if (
        errors >= 20 ||
        (errors >= 3 && errors / Math.max(requests, 1) >= 0.05)
      )
        issues.push({
          code: "worker:" + row.dimensions.scriptName,
          message:
            row.dimensions.scriptName +
            " error estimates crossed the 15-minute alert threshold (" +
            errors +
            " of " +
            requests +
            ")",
        });
    }
  } catch {
    issues.push({
      code: "metrics:unavailable",
      message: "Worker error-rate metrics could not be queried",
    });
  }
  const latest = await env.STATE.prepare(
    "SELECT MAX(completed_at) AS completedAt FROM backup_runs WHERE status='complete'",
  ).first<{ completedAt: number | null }>();
  if (!latest?.completedAt || now - latest.completedAt > 26 * 3600)
    issues.push({
      code: "backup:stale",
      message:
        "No complete database and media backup exists within the last 26 hours",
    });
  const failures = await env.STATE.prepare(
    "SELECT COUNT(*) AS total FROM backup_runs WHERE status='failed' AND created_at>?",
  )
    .bind(latest?.completedAt ?? now - 86400)
    .first<{ total: number }>();
  if (failures?.total)
    issues.push({
      code: "backup:failed",
      message:
        "An automated backup failed; the last completed backup is preserved",
    });
  for (const [name, expires] of [
    ["backup", env.CF_BACKUP_TOKEN_EXPIRES],
    ["analytics", env.CF_ANALYTICS_TOKEN_EXPIRES],
  ] as const) {
    const date = new Date(expires ?? "");
    const expiryMs = date.getTime();
    let problem: string | undefined;
    if (!expires?.trim()) problem = "has no expiry date configured";
    else if (
      !Number.isFinite(expiryMs) ||
      date.toISOString().replace(/\.000Z$/, "Z") !==
        expires.replace(/\.000Z$/, "Z")
    )
      problem = "has an invalid expiry date. Use a UTC timestamp";
    else if (expiryMs <= now * 1000) problem = "has expired";
    else if (expiryMs <= (now + 30 * 86400) * 1000)
      problem = "expires within 30 days";
    if (problem)
      issues.push({
        code: "credential:" + name,
        message: `The ${name} credential ${problem}.`,
      });
  }
  return issues;
}
export async function monitor(env: Env, now = epoch()) {
  const issues = await collectIssues(env, now);
  await notify(env, issues, now);
  await statePut(env, "health.latest", { at: now, issues });
  return issues;
}
