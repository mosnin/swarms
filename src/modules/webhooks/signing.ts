/**
 * Webhook signing. Outbound webhooks are signed with HMAC-SHA256 over the exact
 * JSON body; consumers recompute and compare in constant time. Pure + testable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

const DEV_SECRET = "dev-webhook-signing-secret-do-not-use-in-prod";

/** The configured signing secret (or a fixed dev secret outside production). */
export function webhookSecret(): string {
  if (env.WEBHOOK_SIGNING_SECRET) return env.WEBHOOK_SIGNING_SECRET;
  if (env.NODE_ENV === "production") {
    // Fail closed: never sign with the dev secret in production.
    throw new Error("WEBHOOK_SIGNING_SECRET is required in production");
  }
  return DEV_SECRET;
}

/** Compute the hex HMAC-SHA256 signature of `body` with `secret`. */
export function signWebhook(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Constant-time verification of a webhook signature. */
export function verifyWebhook(secret: string, body: string, signature: string): boolean {
  const expected = signWebhook(secret, body);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
