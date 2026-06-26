/**
 * GET /api/v1/skills/manifest
 *
 * Lightweight version check — returns only the catalogVersion and a summary
 * row per skill (id, version, name, endpoint, method). Agents should cache
 * the full catalog locally (from GET /api/v1/skills) and re-download it only
 * when the catalogVersion here is newer than their cached copy.
 *
 * Typical pattern:
 *   1. On first run: GET /api/v1/skills — cache the result.
 *   2. On subsequent runs: GET /api/v1/skills/manifest — if catalogVersion
 *      differs, re-fetch /api/v1/skills and update the cache.
 *
 * Public, no authentication required.
 */

import type { NextRequest } from "next/server";

import { buildManifest, CATALOG_VERSION } from "@/server/skills/skill-registry";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET(_request: NextRequest): Response {
  const manifest = buildManifest();
  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
      Etag: `"${CATALOG_VERSION}"`,
    },
  });
}
