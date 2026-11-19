/**
 * Thin wrapper around the Resend API for transactional emails.
 * Uses fetch directly to avoid Node-only dependencies.
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from: string;
  idempotencyKey?: string;
}

export async function sendAppEmail(
  env: { API_URL: string; RESEND_API_KEY?: string; EMAIL_FROM: string },
  options: SendEmailOptions,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (["localhost", "127.0.0.1"].includes(new URL(env.API_URL).hostname)) {
      console.info("[development email]", options.subject, options.html);
      return;
    }
    throw new Error("Transactional email is not configured");
  }
  await sendEmail(env.RESEND_API_KEY, options);
}

export async function sendEmail(
  apiKey: string,
  options: SendEmailOptions,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from: options.from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Resend error ${res.status}`);
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

export function invitationEmail(opts: {
  inviteeName: string;
  inviterName: string;
  projectOrAccountName: string;
  role: string;
  acceptUrl: string;
}): string {
  const safe = Object.fromEntries(
    Object.entries(opts).map(([key, value]) => [
      key,
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    ]),
  );
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2>You've been invited to ${safe.projectOrAccountName}</h2>
      <p>
        ${safe.inviterName} has invited you to join
        <strong>${safe.projectOrAccountName}</strong> as a
        <strong>${safe.role}</strong>.
      </p>
      <p>
        <a href="${safe.acceptUrl}"
           style="background:#e8ff47;color:#09090b;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
          Accept invitation
        </a>
      </p>
      <p style="color:#888;font-size:12px">
        This invitation expires in 7 days. If you did not expect this email, you can ignore it.
      </p>
    </div>
  `;
}
