import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "./auth-schema.js";
import { sendEmail } from "./email.js";
import type { Bindings } from "../types.js";

export function initAuth(env: Bindings, baseURL?: string) {
  const isLocal = ["localhost", "127.0.0.1"].includes(
    new URL(env.API_URL).hostname,
  );
  async function mail(to: string, subject: string, url: string) {
    if (!env.RESEND_API_KEY) {
      if (isLocal) {
        console.info("[development email]", subject, url);
        return;
      }
      throw new Error("Transactional email is not configured");
    }
    const escaped = url
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");
    await sendEmail(env.RESEND_API_KEY, {
      to,
      subject,
      from: env.EMAIL_FROM,
      html:
        '<p><a href="' +
        escaped +
        '">' +
        subject +
        "</a></p><p>If you did not request this, ignore this email.</p>",
    });
  }
  return betterAuth({
    baseURL,
    database: drizzleAdapter(drizzle(env.MAIN_DB, { schema: authSchema }), {
      provider: "sqlite",
    }),
    secret: env.BETTER_AUTH_SECRET,
    advanced: isLocal
      ? {}
      : {
          ...(env.COOKIE_DOMAIN
            ? {
                crossSubDomainCookies: {
                  enabled: true,
                  domain: env.COOKIE_DOMAIN,
                },
              }
            : {}),
          defaultCookieAttributes: { sameSite: "lax", secure: true },
        },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) =>
        mail(user.email, "Reset your BlogStack password", url),
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const link = new URL(url);
        const callback = link.searchParams.get("callbackURL");
        let destination = env.FRONTEND_URL + "/projects";
        try {
          const candidate = new URL(callback || destination, env.FRONTEND_URL);
          if (candidate.origin === new URL(env.FRONTEND_URL).origin)
            destination = candidate.href;
        } catch {
          /* use the configured dashboard */
        }
        link.searchParams.set("callbackURL", destination);
        await mail(user.email, "Verify your BlogStack email", link.href);
      },
    },
    trustedOrigins: [env.FRONTEND_URL],
  });
}
export type AuthInstance = ReturnType<typeof initAuth>;
