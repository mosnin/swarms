/**
 * Unit: the wake-console event diff. Only genuine changes since the last poll
 * become events; state carries forward so nothing is emitted twice.
 */

import { describe, expect, it } from "vitest";

import { diffAgentStream, type AgentStreamState } from "@/modules/hosted-agents/agent-stream";

const base: AgentStreamState = {
  agentStatus: "active",
  lastJobId: null,
  lastJobStatus: null,
  lastMessageAtMs: 0,
};

describe("diffAgentStream", () => {
  it("emits a wake.update when the latest job first appears", () => {
    const { events, state } = diffAgentStream(base, {
      agentStatus: "active",
      job: { id: "job_1", status: "running", costMinor: 0, currency: "USD" },
      newMessages: [],
    });
    expect(events).toEqual([{ type: "wake.update", jobId: "job_1", status: "running", costMinor: 0, currency: "USD" }]);
    expect(state.lastJobId).toBe("job_1");
    expect(state.lastJobStatus).toBe("running");
  });

  it("does not re-emit an unchanged job", () => {
    const s1 = diffAgentStream(base, {
      agentStatus: "active",
      job: { id: "job_1", status: "running", costMinor: 0, currency: "USD" },
      newMessages: [],
    }).state;
    const { events } = diffAgentStream(s1, {
      agentStatus: "active",
      job: { id: "job_1", status: "running", costMinor: 0, currency: "USD" },
      newMessages: [],
    });
    expect(events).toEqual([]);
  });

  it("emits a wake.update when the job status advances, carrying cost", () => {
    const s1 = diffAgentStream(base, {
      agentStatus: "active",
      job: { id: "job_1", status: "running", costMinor: 0, currency: "USD" },
      newMessages: [],
    }).state;
    const { events } = diffAgentStream(s1, {
      agentStatus: "active",
      job: { id: "job_1", status: "succeeded", costMinor: 42, currency: "USD" },
      newMessages: [],
    });
    expect(events).toEqual([
      { type: "wake.update", jobId: "job_1", status: "succeeded", costMinor: 42, currency: "USD" },
    ]);
  });

  it("emits only strictly-newer messages, in order, and advances the watermark", () => {
    const state = { ...base, lastMessageAtMs: 1_000 };
    const { events, state: next } = diffAgentStream(state, {
      agentStatus: "active",
      job: null,
      newMessages: [
        { id: "m3", role: "agent", content: "reply", jobId: "job_1", createdAt: new Date(3_000) },
        { id: "m1", role: "user", content: "old", jobId: null, createdAt: new Date(500) }, // stale, dropped
        { id: "m2", role: "user", content: "hi", jobId: null, createdAt: new Date(2_000) },
      ],
    });
    expect(events.map((e) => e.type === "message" && e.id)).toEqual(["m2", "m3"]);
    expect(next.lastMessageAtMs).toBe(3_000);
  });

  it("emits an agent.status event on transition and remembers it", () => {
    const { events, state } = diffAgentStream(base, {
      agentStatus: "suspended",
      job: null,
      newMessages: [],
    });
    expect(events).toEqual([{ type: "agent.status", status: "suspended" }]);
    expect(state.agentStatus).toBe("suspended");
    // No repeat next poll.
    expect(diffAgentStream(state, { agentStatus: "suspended", job: null, newMessages: [] }).events).toEqual([]);
  });
});
