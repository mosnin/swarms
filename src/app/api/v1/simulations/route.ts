import type { NextRequest } from "next/server";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { assertSafeUrl } from "@/lib/ssrf-guard";
import { formatResponse } from "@/lib/format-response";
import { requireOrganization } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { simulationConfigSchema } from "@/modules/simulations/schema";
import { enqueueSimulation } from "@/modules/simulations/simulation-service";
import { listSimulationRuns } from "@/modules/simulations/simulation-repository";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["queued", "running", "succeeded", "failed", "cancelled"]);

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor") ?? undefined;

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      throw Errors.validation(
        `Invalid status filter: "${status}". Must be one of: ${[...VALID_STATUSES].join(", ")}`,
      );
    }
    const limit = limitRaw !== null ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw Errors.validation("limit must be an integer between 1 and 100");
    }

    const result = await listSimulationRuns(ctx, { status, limit, cursor });
    if (url.searchParams.get("format") === "markdown") {
      return formatResponse(request, result);
    }
    return ok(result);
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "swarmRun");
    const json = await readJsonBody(request);
    const parsed = simulationConfigSchema.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    if (parsed.data.organizationId) requireOrganization(ctx, parsed.data.organizationId);

    // SSRF guard: validate every externally-reachable URL before it flows into a
    // sandbox transport or webhook — callback, inherited MCP servers, and (in
    // collaborative mode) the environment MCP tool.
    if (parsed.data.callbackUrl !== undefined) await assertSafeUrl(parsed.data.callbackUrl, "callbackUrl");
    for (const server of parsed.data.resources?.mcpServers ?? []) {
      await assertSafeUrl(server.url, `mcpServers[${server.name}].url`);
    }
    if (parsed.data.scenario?.environment?.kind === "mcp") {
      await assertSafeUrl(parsed.data.scenario.environment.url, "scenario.environment.url");
    }

    const response = await enqueueSimulation(ctx, parsed.data);
    return ok(response, 202);
  });
}
