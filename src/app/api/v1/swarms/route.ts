import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { deriveIdempotencyKey, idempotencyKeySchema } from "@/lib/idempotency";
import { assertSafeUrl } from "@/lib/ssrf-guard";
import { formatResponse } from "@/lib/format-response";
import { usdToMinor } from "@/lib/money";
import { requireOrganization } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { enqueueSwarm } from "@/modules/swarms/spawn-swarm";
import { listSwarmRuns } from "@/modules/swarms/swarm-repository";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { expandTemplate, findTemplate } from "@/server/swarms/swarm-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resourcesSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    files: z.record(z.string(), z.string()).optional(),
    mcpServers: z
      .array(z.object({ name: z.string(), url: z.string().url(), token: z.string().optional() }))
      .optional(),
    context: z.string().optional(),
  })
  .optional();

const body = z
  .object({
    organizationId: z.string().optional(),
    /**
     * Pre-built swarm pattern (e.g. "research", "pipeline", "synthesis").
     * When provided, tasks/aggregatorTask/sequential default to the template's
     * values and can be individually overridden by the caller.
     * GET /api/v1/swarms/templates lists all available templates.
     */
    templateId: z.string().optional(),
    /** Required unless templateId is supplied. */
    tasks: z.array(z.string().min(1).max(20_000)).min(1).max(16).optional(),
    objective: z.string().max(2_000).optional(),
    resources: resourcesSchema,
    model: z.string().max(96).optional(),
    budgetMinor: z.number().int().nonnegative().optional(),
    /** Human-friendly alternative to budgetMinor: dollars as a decimal (e.g. 3.00). */
    budgetUsd: z.number().positive().optional(),
    currency: z.string().length(3).transform((c) => c.toUpperCase()).optional(),
    idempotencyKey: idempotencyKeySchema.optional(),
    aggregatorTask: z.string().min(1).max(20_000).optional(),
    sequential: z.boolean().optional(),
    /**
     * Per-worker GPU-second limits. When provided, length must equal tasks.length
     * (or the expanded template's task count). Each element is seconds (integer ≥ 1).
     */
    workerTimeouts: z.array(z.number().int().positive()).max(16).optional(),
    /**
     * When true, reject the request if any two tasks appear to be duplicates
     * (similarity ≥ 0.8). Default false — warnings are returned but execution
     * continues.
     */
    deduplicateStrict: z.boolean().optional(),
    /**
     * When provided, a signed webhook is POSTed to this URL after the swarm
     * reaches a terminal state. Event type is `swarm.succeeded` or `swarm.failed`.
     * Delivery is best-effort with exponential-backoff retries.
     */
    callbackUrl: z.string().url().optional(),
  })
  .refine((d) => d.templateId !== undefined || (d.tasks !== undefined && d.tasks.length > 0), {
    message: "Provide tasks or templateId",
    path: ["tasks"],
  })
  .refine((d) => !(d.budgetUsd !== undefined && d.budgetMinor !== undefined), {
    message: "Provide budgetUsd or budgetMinor, not both",
    path: ["budgetUsd"],
  });

const VALID_STATUSES = new Set(["queued", "running", "succeeded", "failed", "cancelled"]);

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor") ?? undefined;

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      throw Errors.validation(`Invalid status filter: "${status}". Must be one of: ${[...VALID_STATUSES].join(", ")}`);
    }

    const limit = limitRaw !== null ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw Errors.validation("limit must be an integer between 1 and 100");
    }

    const result = await listSwarmRuns(ctx, { status, limit, cursor });
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
    const json = await request.json().catch(() => null);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    if (parsed.data.organizationId) requireOrganization(ctx, parsed.data.organizationId);

    const { idempotencyKey, budgetUsd, templateId, workerTimeouts, deduplicateStrict, callbackUrl, ...rest } = parsed.data;

    // SSRF guard: validate callbackUrl and MCP server URLs before they reach downstream transports.
    if (callbackUrl !== undefined) await assertSafeUrl(callbackUrl, "callbackUrl");
    for (const server of rest.resources?.mcpServers ?? []) {
      await assertSafeUrl(server.url, `mcpServers[${server.name}].url`);
    }

    // Expand template defaults, then apply any caller overrides.
    let tasks = rest.tasks;
    let aggregatorTask = rest.aggregatorTask;
    let sequential = rest.sequential;
    if (templateId !== undefined) {
      const template = findTemplate(templateId);
      if (!template) {
        throw Errors.validation(`Unknown templateId: "${templateId}". See GET /api/v1/swarms/templates.`);
      }
      const expanded = expandTemplate(template, rest.objective ?? "");
      tasks = rest.tasks ?? expanded.tasks;
      aggregatorTask = rest.aggregatorTask ?? expanded.aggregatorTask;
      sequential = rest.sequential ?? expanded.sequential;
    }
    if (!tasks || tasks.length === 0) {
      throw Errors.validation("tasks is required when templateId is not provided");
    }

    const budgetMinor = rest.budgetMinor ?? (budgetUsd !== undefined ? usdToMinor(budgetUsd) : undefined);
    const currency = rest.currency ?? (budgetUsd !== undefined ? "USD" : undefined);
    const resolvedKey =
      idempotencyKey ??
      deriveIdempotencyKey(ctx.organizationId, {
        tasks,
        objective: rest.objective,
        model: rest.model,
        aggregatorTask,
        sequential,
        templateId,
      });

    // Async: enqueue the swarm (creates the run + a director job) and return
    // immediately with status "queued". The worker executes the fleet off the
    // request thread; clients poll GET /swarms/:id or stream for the result.
    const response = await enqueueSwarm(ctx, {
      tasks,
      objective: rest.objective,
      resources: rest.resources,
      model: rest.model,
      budgetMinor,
      currency,
      idempotencyKey: resolvedKey,
      aggregatorTask,
      sequential,
      workerTimeouts,
      deduplicateStrict,
      callbackUrl,
    });
    return ok(response, 202);
  });
}
