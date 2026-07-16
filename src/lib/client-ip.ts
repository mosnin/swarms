/**
 * Best-effort client IP extraction for audit trails. Trusts `x-forwarded-for`
 * (set by the platform's edge/proxy layer) and falls back to `x-real-ip`; this
 * is for audit attribution only and must never be used as an authorization
 * input (headers are caller-controlled when there is no trusted proxy).
 */
export function clientIpFrom(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
