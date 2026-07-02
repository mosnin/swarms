/**
 * Request correlation IDs. Each inbound request gets a stable id (honoring an
 * incoming `x-request-id` when present) so logs, audit events, and error
 * responses can be correlated across the control plane.
 */

import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

export function requestIdFrom(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  if (incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)) return incoming;
  return `req_${randomUUID()}`;
}
