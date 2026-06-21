import { beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/time";
import {
  cancelJob,
  createJob,
  type JobLogRecord,
  type JobRecord,
  type JobStore,
  type ResolvedCapability,
} from "@/modules/execution/job-service";
import type { JobMessage, JobQueue } from "@/server/queue/types";

class InMemoryJobStore implements JobStore {
  readonly jobs = new Map<string, JobRecord>();
  readonly logs: JobLogRecord[] = [];

  async findByIdempotencyKey(organizationId: string, key: string): Promise<JobRecord | null> {
    for (const job of this.jobs.values()) {
      if (job.organizationId === organizationId && job.idempotencyKey === key) return job;
    }
    return null;
  }
  async insert(record: JobRecord): Promise<JobRecord> {
    this.jobs.set(record.id, record);
    return record;
  }
  async findById(id: string): Promise<JobRecord | null> {
    return this.jobs.get(id) ?? null;
  }
  async update(id: string, patch: Partial<JobRecord>): Promise<JobRecord> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error("missing job");
    const next = { ...existing, ...patch };
    this.jobs.set(id, next);
    return next;
  }
  async appendLog(record: JobLogRecord): Promise<JobLogRecord> {
    this.logs.push(record);
    return record;
  }
  async listLogs(jobId: string): Promise<JobLogRecord[]> {
    return this.logs.filter((l) => l.jobId === jobId);
  }
}

class SpyQueue implements JobQueue {
  readonly enqueued: JobMessage[] = [];
  async enqueue(message: JobMessage): Promise<void> {
    this.enqueued.push(message);
  }
  async dequeue(): Promise<JobMessage | null> {
    return this.enqueued.shift() ?? null;
  }
  size(): number {
    return this.enqueued.length;
  }
}

const clock = fixedClock(new Date("2026-02-01T00:00:00Z"));

function skillCapability(overrides: Partial<ResolvedCapability> = {}): ResolvedCapability {
  return {
    kind: "skill",
    skillVersionId: "skv_1",
    inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
    priceMinor: 200,
    priceCurrency: "USD",
    ...overrides,
  };
}

function agentCapability(overrides: Partial<ResolvedCapability> = {}): ResolvedCapability {
  return {
    kind: "agent",
    skillVersionId: null,
    task: "summarize the report",
    resourceBundleId: "rsb_1",
    model: "claude-haiku-4-5",
    priceMinor: 200,
    priceCurrency: "USD",
    ...overrides,
  };
}

function baseInput() {
  return {
    organizationId: "org_1",
    createdByUserId: null,
    apiKeyId: "key_1",
    capability: skillCapability(),
    input: { url: "https://example.com" },
    idempotencyKey: "idem-key-0001",
  };
}

describe("createJob", () => {
  let store: InMemoryJobStore;
  let queue: SpyQueue;

  beforeEach(() => {
    store = new InMemoryJobStore();
    queue = new SpyQueue();
  });

  it("creates a queued job and enqueues exactly one message", async () => {
    const { job, replay } = await createJob(store, queue, baseInput(), clock);
    expect(replay).toBe(false);
    expect(job.status).toBe("queued");
    expect(job.queuedAt).toEqual(clock.now());
    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0]?.jobId).toBe(job.id);
  });

  it("persists the job before enqueueing (durable source of truth)", async () => {
    const { job } = await createJob(store, queue, baseInput(), clock);
    expect(await store.findById(job.id)).not.toBeNull();
    expect(store.logs.some((l) => l.jobId === job.id)).toBe(true);
  });

  it("replays the same job for a repeated idempotency key + identical input", async () => {
    const first = await createJob(store, queue, baseInput(), clock);
    const second = await createJob(store, queue, baseInput(), clock);
    expect(second.replay).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    // No second enqueue / no duplicate job.
    expect(queue.enqueued).toHaveLength(1);
    expect(store.jobs.size).toBe(1);
  });

  it("rejects a reused idempotency key with different input (conflict)", async () => {
    await createJob(store, queue, baseInput(), clock);
    await expect(
      createJob(
        store,
        queue,
        { ...baseInput(), input: { url: "https://different.com" } },
        clock,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects input that violates the skill input schema", async () => {
    await expect(
      createJob(store, queue, { ...baseInput(), input: { notUrl: 1 } }, clock),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("creates an agent job and carries its task/model/resource bundle", async () => {
    const { job } = await createJob(
      store,
      queue,
      { ...baseInput(), capability: agentCapability(), input: { task: "summarize the report" } },
      clock,
    );
    expect(job.capabilityKind).toBe("agent");
    expect(job.task).toBe("summarize the report");
    expect(job.model).toBe("claude-haiku-4-5");
    expect(job.resourceBundleId).toBe("rsb_1");
  });

  it("rejects an agent spawn with an empty task", async () => {
    await expect(
      createJob(
        store,
        queue,
        { ...baseInput(), capability: agentCapability({ task: "  " }), input: {} },
        clock,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a budget below the estimated cost", async () => {
    await expect(
      createJob(store, queue, { ...baseInput(), budgetMinor: 100 }, clock),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("accepts a budget that covers the estimated cost", async () => {
    const { job } = await createJob(store, queue, { ...baseInput(), budgetMinor: 500 }, clock);
    expect(job.status).toBe("queued");
  });
});

describe("cancelJob", () => {
  let store: InMemoryJobStore;
  let queue: SpyQueue;

  beforeEach(() => {
    store = new InMemoryJobStore();
    queue = new SpyQueue();
  });

  it("cancels a queued job and stamps finishedAt", async () => {
    const { job } = await createJob(store, queue, baseInput(), clock);
    const cancelled = await cancelJob(store, job.id, clock);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.finishedAt).toEqual(clock.now());
  });

  it("refuses to cancel a terminal job", async () => {
    const { job } = await createJob(store, queue, baseInput(), clock);
    await store.update(job.id, { status: "succeeded" });
    await expect(cancelJob(store, job.id, clock)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws NOT_FOUND for an unknown job", async () => {
    await expect(cancelJob(store, "job_missing", clock)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
