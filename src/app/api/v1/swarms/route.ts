import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { idempotencyKeySchema } from "@/lib/idempotency";
import { requireOrganization } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

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

const body = z.object({
  organizationId: z.string().optional(),
  tasks: z.array(z.string().min(1).max(20_000)).min(1).max(16),
  objective: z.string().max(2_000).optional(),
  resources: resourcesSchema,
  model: z.string().max(96).optional(),
  budgetMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  idempotencyKey: idempotencyKeySchema,
});

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

    const response = await spawnSwarm(ctx, {
      tasks: parsed.data.tasks,
      objective: parsed.data.objective,
      resources: parsed.data.resources,
      model: parsed.data.model,
      budgetMinor: parsed.data.budgetMinor,
      currency: parsed.data.currency,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return ok(response, 201);
  });
}
