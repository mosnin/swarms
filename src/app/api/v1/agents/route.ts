import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { createAgentInstance, listAgentInstances } from "@/modules/hosted-agents/agent-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors modules/resources/resource-bundle.ts ResourceBundle.
const resourcesSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    files: z.record(z.string(), z.string()).optional(),
    mcpServers: z
      .array(z.object({ name: z.string(), url: z.string().url(), token: z.string().optional() }))
      .optional(),
    context: z.string().max(16_000).optional(),
  })
  .optional();

const createBody = z.object({
  name: z.string().min(1).max(120),
  instructions: z.string().min(1).max(8_000),
  model: z.string().min(1).max(96).optional(),
  wakeIntervalMinutes: z.number().int().min(5).max(24 * 60).nullish(),
  budgetMinorPerWake: z.number().int().positive().max(1_000_000).optional(),
  resources: resourcesSchema,
});

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const agents = await listAgentInstances(ctx);
    return ok({ agents });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const json = await readJsonBody(request);
    const parsed = createBody.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const agent = await createAgentInstance(ctx, {
      ...parsed.data,
      wakeIntervalMinutes: parsed.data.wakeIntervalMinutes ?? null,
    });
    return ok({ agent }, 201);
  });
}
