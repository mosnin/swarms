/**
 * Pure event-diffing for the live wake console (see the SSE route at
 * app/api/v1/agents/[agentInstanceId]/stream). Each poll hands this function a
 * fresh snapshot of the agent — its status, its latest wake job, and any
 * messages newer than the last one we emitted — and it returns exactly the
 * events that changed since last time, plus the next state to carry forward.
 * Keeping the diff pure makes the "what changed" logic fully unit-testable
 * without timers, streams, or a database.
 */

export type AgentStreamEvent =
  | { type: "agent.status"; status: string }
  | { type: "wake.update"; jobId: string; status: string; costMinor: number; currency: string }
  | { type: "message"; id: string; role: string; content: string; jobId: string | null; createdAt: string };

export interface AgentStreamState {
  agentStatus: string;
  lastJobId: string | null;
  lastJobStatus: string | null;
  /** Epoch ms of the newest message already emitted; only strictly-newer stream. */
  lastMessageAtMs: number;
}

export interface AgentStreamSnapshot {
  agentStatus: string;
  job: { id: string; status: string; costMinor: number; currency: string } | null;
  /** Candidate messages; only those newer than `state.lastMessageAtMs` are emitted. */
  newMessages: Array<{ id: string; role: string; content: string; jobId: string | null; createdAt: Date }>;
}

/** Terminal agent statuses — the stream closes once the agent reaches one. */
export const AGENT_STREAM_TERMINAL = new Set(["terminated"]);

export function diffAgentStream(
  state: AgentStreamState,
  snapshot: AgentStreamSnapshot,
): { events: AgentStreamEvent[]; state: AgentStreamState } {
  const events: AgentStreamEvent[] = [];
  let { agentStatus, lastJobId, lastJobStatus, lastMessageAtMs } = state;

  if (snapshot.agentStatus !== agentStatus) {
    agentStatus = snapshot.agentStatus;
    events.push({ type: "agent.status", status: agentStatus });
  }

  if (snapshot.job && (snapshot.job.id !== lastJobId || snapshot.job.status !== lastJobStatus)) {
    lastJobId = snapshot.job.id;
    lastJobStatus = snapshot.job.status;
    events.push({
      type: "wake.update",
      jobId: snapshot.job.id,
      status: snapshot.job.status,
      costMinor: snapshot.job.costMinor,
      currency: snapshot.job.currency,
    });
  }

  const fresh = snapshot.newMessages
    .filter((m) => m.createdAt.getTime() > lastMessageAtMs)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const m of fresh) {
    events.push({
      type: "message",
      id: m.id,
      role: m.role,
      content: m.content,
      jobId: m.jobId,
      createdAt: m.createdAt.toISOString(),
    });
    lastMessageAtMs = Math.max(lastMessageAtMs, m.createdAt.getTime());
  }

  return { events, state: { agentStatus, lastJobId, lastJobStatus, lastMessageAtMs } };
}
