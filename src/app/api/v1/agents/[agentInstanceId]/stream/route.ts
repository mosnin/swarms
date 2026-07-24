/**
 * GET /api/v1/agents/:agentInstanceId/stream
 *
 * Server-Sent Events (SSE) — a live wake console for a hosted agent. Watch it
 * wake, run, spend, and reply in real time instead of polling the thread.
 *
 * Event types:
 *   agent.snapshot — emitted once on connect; current status + latest wake
 *   agent.status   — the agent transitioned (active | paused | suspended | terminated)
 *   wake.update    — the latest wake job changed state; carries cost so far
 *   message        — a new thread message appeared (inbound, or the agent's reply)
 *   stream.closed  — emitted once before the stream ends (terminal or timeout)
 *   heartbeat      — a comment line every 5 s so clients can detect stale links
 *
 * Only activity newer than the connection is streamed (history lives in the
 * thread). The connection stays open for a live agent and closes when the agent
 * is terminated, after a 10-minute safety timeout, or when the client leaves.
 */

import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isAppError } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { requireOrganization } from "@/modules/identity/access-control";
import {
  AGENT_STREAM_TERMINAL,
  diffAgentStream,
  type AgentStreamState,
} from "@/modules/hosted-agents/agent-stream";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_STREAM_MS = 10 * 60 * 1_000;

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentInstanceId: string }> },
): Promise<Response> {
  const db = getDb();
  const sseHeaders = { "Content-Type": "text/event-stream" } as const;

  let ctx;
  try {
    ctx = await authenticateRequest(request);
  } catch {
    return new Response(sseEvent("error", { code: "UNAUTHORIZED", message: "Authentication required" }), {
      status: 401,
      headers: sseHeaders,
    });
  }

  try {
    await enforceRateLimit(ctx, "execute");
  } catch (err) {
    const status = isAppError(err) ? err.status : 429;
    return new Response(sseEvent("error", { code: "RATE_LIMITED", message: "Rate limit exceeded" }), {
      status,
      headers: sseHeaders,
    });
  }

  const { agentInstanceId } = await params;

  const agent = (
    await db
      .select()
      .from(schema.agentInstances)
      .where(
        and(
          eq(schema.agentInstances.id, agentInstanceId),
          eq(schema.agentInstances.organizationId, ctx.organizationId),
        ),
      )
      .limit(1)
  )[0];

  if (!agent) {
    return new Response(
      sseEvent("error", { code: "NOT_FOUND", message: `Agent ${agentInstanceId} not found` }),
      { status: 404, headers: sseHeaders },
    );
  }

  try {
    requireOrganization(ctx, agent.organizationId);
  } catch {
    return new Response(sseEvent("error", { code: "FORBIDDEN", message: "Access denied" }), {
      status: 403,
      headers: sseHeaders,
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

      emit("agent.snapshot", {
        id: agent.id,
        status: agent.status,
        nextWakeAt: agent.nextWakeAt,
        lastWakeAt: agent.lastWakeAt,
        lastJobId: agent.lastJobId,
      });

      // Start "now": only activity newer than the connection streams. The wake
      // job starts unseen so the current wake surfaces on the first poll.
      let state: AgentStreamState = {
        agentStatus: agent.status,
        lastJobId: null,
        lastJobStatus: null,
        lastMessageAtMs: Date.now(),
      };

      const deadline = Date.now() + MAX_STREAM_MS;
      let heartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;

      const poll = async (): Promise<boolean> => {
        if (stopped) return false;

        const row = (
          await db
            .select({
              status: schema.agentInstances.status,
              lastJobId: schema.agentInstances.lastJobId,
            })
            .from(schema.agentInstances)
            .where(eq(schema.agentInstances.id, agentInstanceId))
            .limit(1)
        )[0];
        const agentStatus = row?.status ?? state.agentStatus;

        let jobSnapshot: { id: string; status: string; costMinor: number; currency: string } | null = null;
        if (row?.lastJobId) {
          const j = (
            await db
              .select({
                id: schema.jobs.id,
                status: schema.jobs.status,
                costMinor: schema.jobs.costMinor,
                currency: schema.jobs.costCurrency,
              })
              .from(schema.jobs)
              .where(eq(schema.jobs.id, row.lastJobId))
              .limit(1)
          )[0];
          if (j) jobSnapshot = j;
        }

        const newMessages = await db
          .select({
            id: schema.agentMessages.id,
            role: schema.agentMessages.role,
            content: schema.agentMessages.content,
            jobId: schema.agentMessages.jobId,
            createdAt: schema.agentMessages.createdAt,
          })
          .from(schema.agentMessages)
          .where(
            and(
              eq(schema.agentMessages.agentInstanceId, agentInstanceId),
              gt(schema.agentMessages.createdAt, new Date(state.lastMessageAtMs)),
            ),
          )
          .orderBy(asc(schema.agentMessages.createdAt))
          .limit(50);

        const { events, state: nextState } = diffAgentStream(state, {
          agentStatus,
          job: jobSnapshot,
          newMessages,
        });
        state = nextState;
        for (const ev of events) {
          const { type, ...data } = ev;
          emit(type, data);
        }

        if (AGENT_STREAM_TERMINAL.has(agentStatus)) {
          emit("stream.closed", { reason: "terminated" });
          return false;
        }
        if (Date.now() >= deadline) {
          emit("stream.closed", { reason: "timeout" });
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
