/**
 * GET /api/v1/simulations/:simulationRunId/stream
 *
 * Server-Sent Events stream of a simulation run's progress.
 *
 * Event types:
 *   simulation.started — emitted once on connect; carries run metadata
 *   persona.update     — emitted as each persona's record appears (terminal)
 *   simulation.done    — emitted once the run reaches a terminal state
 *   heartbeat          — a ':' comment every 5 s to keep the connection alive
 *
 * The whole crew runs in one sandbox, so persona records typically arrive
 * together when the run settles; the stream still emits them incrementally and
 * closes on terminal state or after 10 minutes.
 */

import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

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
const MAX_STREAM_MS = 10 * 60 * 1_000;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ simulationRunId: string }> },
): Promise<Response> {
  const db = getDb();

  let ctx;
  try {
    ctx = await authenticateRequest(request);
  } catch {
    return new Response(sseEvent("error", { code: "UNAUTHORIZED", message: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  try {
    await enforceRateLimit(ctx, "execute");
  } catch (err) {
    const status = isAppError(err) ? err.status : 429;
    return new Response(sseEvent("error", { code: "RATE_LIMITED", message: "Rate limit exceeded" }), {
      status,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const { simulationRunId } = await params;

  const run = (
    await db
      .select()
      .from(schema.simulationRuns)
      .where(
        and(
          eq(schema.simulationRuns.id, simulationRunId),
          eq(schema.simulationRuns.organizationId, ctx.organizationId),
        ),
      )
      .limit(1)
  )[0];

  if (!run) {
    return new Response(
      sseEvent("error", { code: "NOT_FOUND", message: `Simulation run ${simulationRunId} not found` }),
      { status: 404, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  try {
    requireOrganization(ctx, run.organizationId);
  } catch {
    return new Response(sseEvent("error", { code: "FORBIDDEN", message: "Access denied" }), {
      status: 403,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  let stopped = false;

  const stream = new ReadableStream({
    cancel() {
      stopped = true;
    },
    async start(controller) {
      const enc = (s: string) => new TextEncoder().encode(s);
      const emit = (type: string, data: unknown) => {
        if (stopped) return;
        try {
          controller.enqueue(enc(sseEvent(type, data)));
        } catch {
          stopped = true;
        }
      };
      request.signal.addEventListener("abort", () => {
        stopped = true;
      });

      emit("simulation.started", {
        simulationRunId: run.id,
        status: run.status,
        mode: run.mode,
        createdAt: run.createdAt,
      });

      const emittedAgents = new Set<string>();
      const deadline = Date.now() + MAX_STREAM_MS;
      let heartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;

      const poll = async (): Promise<boolean> => {
        if (stopped) return false;

        const agents = await db
          .select()
          .from(schema.simulationAgents)
          .where(eq(schema.simulationAgents.simulationRunId, simulationRunId));

        for (const agent of agents) {
          if (!emittedAgents.has(agent.id)) {
            emittedAgents.add(agent.id);
            emit("persona.update", {
              agentId: agent.id,
              personaName: agent.personaName,
              role: agent.role,
              status: agent.status,
              output: agent.output,
              error: agent.error,
            });
          }
        }

        const currentRun = (
          await db
            .select({
              status: schema.simulationRuns.status,
              costMinor: schema.simulationRuns.costMinor,
              finishedAt: schema.simulationRuns.finishedAt,
            })
            .from(schema.simulationRuns)
            .where(eq(schema.simulationRuns.id, simulationRunId))
            .limit(1)
        )[0];

        const runStatus = currentRun?.status ?? run.status;

        if (TERMINAL.has(runStatus)) {
          emit("simulation.done", {
            simulationRunId,
            status: runStatus,
            personaCount: agents.length,
            costMinor: currentRun?.costMinor ?? 0,
            finishedAt: currentRun?.finishedAt,
          });
          return false;
        }

        if (Date.now() >= deadline) {
          emit("simulation.done", {
            simulationRunId,
            status: "timeout",
            message: "Stream closed after 10 minutes (simulation still running)",
          });
          return false;
        }

        if (Date.now() >= heartbeatAt) {
          try {
            controller.enqueue(enc(`: heartbeat\n\n`));
          } catch {
            return false;
          }
          heartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        return true;
      };

      try {
        let keepGoing = true;
        while (keepGoing && !stopped) {
          keepGoing = await poll();
        }
      } catch (err) {
        emit("error", { code: "INTERNAL", message: String(err) });
      } finally {
        if (!stopped) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
