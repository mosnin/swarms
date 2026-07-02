/**
 * GET /api/v1/swarms/:swarmRunId/stream
 *
 * Server-Sent Events (SSE) stream of worker progress for a swarm run.
 *
 * Event types:
 *   swarm.started   — emitted once on connect; carries swarm metadata
 *   worker.update   — emitted each time a worker transitions to a terminal state
 *   swarm.done      — emitted once the swarm reaches a terminal state; carries summary
 *   heartbeat       — emitted every 5 s so the client can detect stale connections
 *
 * For a swarm that has already completed, all worker.update events are emitted
 * immediately followed by swarm.done, then the stream closes.
 *
 * For a swarm that is still running (async spawn), the stream polls the DB every
 * second and emits events as workers finish.
 *
 * Connection closes automatically once the swarm reaches a terminal state
 * (succeeded | partial | failed) or after 10 minutes (safety timeout).
 */

import type { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isAppError } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { requireOrganization } from "@/modules/identity/access-control";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_STREAM_MS = 10 * 60 * 1_000; // 10 minutes safety timeout
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ swarmRunId: string }> },
): Promise<Response> {
  const db = getDb();

  let ctx;
  try {
    ctx = await authenticateRequest(request);
  } catch {
    return new Response(
      sseEvent("error", { code: "UNAUTHORIZED", message: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  try {
    await enforceRateLimit(ctx, "execute");
  } catch (err) {
    const status = isAppError(err) ? err.status : 429;
    return new Response(
      sseEvent("error", { code: "RATE_LIMITED", message: "Rate limit exceeded" }),
      { status, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const { swarmRunId } = await params;

  // Verify the swarm run exists and belongs to this org.
  const run = (
    await db
      .select()
      .from(schema.swarmRuns)
      .where(
        and(
          eq(schema.swarmRuns.id, swarmRunId),
          eq(schema.swarmRuns.organizationId, ctx.organizationId),
        ),
      )
      .limit(1)
  )[0];

  if (!run) {
    return new Response(
      sseEvent("error", { code: "NOT_FOUND", message: `Swarm run ${swarmRunId} not found` }),
      { status: 404, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  try {
    requireOrganization(ctx, run.organizationId);
  } catch {
    return new Response(
      sseEvent("error", { code: "FORBIDDEN", message: "Access denied" }),
      { status: 403, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (s: string) => new TextEncoder().encode(s);
      const emit = (type: string, data: unknown) => {
        controller.enqueue(enc(sseEvent(type, data)));
      };

      // ── initial swarm.started ────────────────────────────────────────────
      emit("swarm.started", {
        swarmRunId: run.id,
        status: run.status,
        createdAt: run.createdAt,
      });

      const emittedAgents = new Set<string>();
      const deadline = Date.now() + MAX_STREAM_MS;
      let heartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;

      const poll = async (): Promise<void> => {
        // Fetch all agents for this run.
        const agents = await db
          .select()
          .from(schema.swarmAgents)
          .where(eq(schema.swarmAgents.swarmRunId, swarmRunId));

        // Emit update for any agent that reached a terminal state we haven't emitted yet.
        for (const agent of agents) {
          if (TERMINAL.has(agent.status) && !emittedAgents.has(agent.id)) {
            emittedAgents.add(agent.id);
            emit("worker.update", {
              agentId: agent.id,
              role: agent.role,
              status: agent.status,
              jobId: agent.jobId,
              costMinor: agent.costMinor,
              output: agent.output,
              error: agent.error,
            });
          }
        }

        // Re-fetch run status to catch terminal transition.
        const currentRun = (
          await db
            .select({ status: schema.swarmRuns.status, costMinor: schema.swarmRuns.costMinor, finishedAt: schema.swarmRuns.finishedAt })
            .from(schema.swarmRuns)
            .where(eq(schema.swarmRuns.id, swarmRunId))
            .limit(1)
        )[0];

        const runStatus = currentRun?.status ?? run.status;

        if (TERMINAL.has(runStatus)) {
          // Emit any remaining non-terminal agents (e.g. cancelled mid-flight).
          for (const agent of agents) {
            if (!emittedAgents.has(agent.id)) {
              emittedAgents.add(agent.id);
              emit("worker.update", {
                agentId: agent.id,
                role: agent.role,
                status: agent.status,
                jobId: agent.jobId,
                costMinor: agent.costMinor,
                output: agent.output,
                error: agent.error,
              });
            }
          }
          emit("swarm.done", {
            swarmRunId,
            status: runStatus,
            totalWorkers: agents.length,
            finishedWorkers: emittedAgents.size,
            costMinor: currentRun?.costMinor ?? 0,
            finishedAt: currentRun?.finishedAt,
          });
          controller.close();
          return;
        }

        // Safety timeout.
        if (Date.now() >= deadline) {
          emit("swarm.done", {
            swarmRunId,
            status: "timeout",
            message: "Stream closed after 10 minutes (swarm still running)",
          });
          controller.close();
          return;
        }

        // Heartbeat.
        if (Date.now() >= heartbeatAt) {
          controller.enqueue(enc(`: heartbeat\n\n`));
          heartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        await poll();
      };

      await poll().catch((err) => {
        emit("error", { code: "INTERNAL", message: String(err) });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
