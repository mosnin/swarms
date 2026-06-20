import { beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/time";
import type { JobLogRecord, JobRecord, JobStore } from "@/modules/execution/job-service";
import {
  processJob,
  type ProcessDeps,
  type ResolvedExecution,
  type WorkerRunRecord,
  type WorkerRunStore,
} from "@/server/jobs/processJob";

class InMemoryJobStore implements JobStore {
  readonly jobs = new Map<string, JobRecord>();
  readonly logs: JobLogRecord[] = [];
  async findByIdempotencyKey() {
    return null;
  }
  async insert(r: JobRecord) {
    this.jobs.set(r.id, r);
    return r;
  }
  async findById(id: string) {
    return this.jobs.get(id) ?? null;
  }
  async update(id: string, patch: Partial<JobRecord>) {
    const next = { ...this.jobs.get(id)!, ...patch };
    this.jobs.set(id, next);
    return next;
  }
  async appendLog(r: JobLogRecord) {
    this.logs.push(r);
    return r;
  }
  async listLogs(jobId: string) {
    return this.logs.filter((l) => l.jobId === jobId);
  }
}

class InMemoryWorkerRunStore implements WorkerRunStore {
  readonly runs = new Map<string, WorkerRunRecord>();
  async insert(r: WorkerRunRecord) {
    this.runs.set(r.id, r);
    return r;
  }
  async update(id: string, patch: Partial<WorkerRunRecord>) {
    const next = { ...this.runs.get(id)!, ...patch };
    this.runs.set(id, next);
    return next;
  }
}

const clock = fixedClock(new Date("2026-03-01T00:00:00Z"));

function queuedJob(): JobRecord {
  const now = clock.now();
  return {
    id: "job_1",
    organizationId: "org_1",
    createdByUserId: null,
    apiKeyId: "key_1",
    capabilityKind: "skill",
    skillVersionId: "skv_1",
    idempotencyKey: "idem-key-proc",
    inputHash: "hash",
    input: { url: "https://example.com" },
    output: null,
    error: null,
    status: "queued",
    priority: 0,
    attempt: 0,
    maxAttempts: 1,
    costMinor: 0,
    costCurrency: "USD",
    queuedAt: now,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDeps(
  jobStore: JobStore,
  workerRunStore: WorkerRunStore,
  resolved: ResolvedExecution | null,
  charges: Array<{ costMinor: number; currency: string }>,
): ProcessDeps {
  return {
    jobStore,
    workerRunStore,
    resolve: async () => resolved,
    workerId: "test-worker",
    clock,
    async onCharge(_job, costMinor, currency) {
      charges.push({ costMinor, currency });
    },
  };
}

const mockExec: ResolvedExecution = {
  runnerType: "mock",
  runnerConfig: null,
  maxRuntimeMs: 30_000,
  priceMinor: 200,
  currency: "USD",
};

describe("processJob", () => {
  let jobStore: InMemoryJobStore;
  let workerRunStore: InMemoryWorkerRunStore;
  let charges: Array<{ costMinor: number; currency: string }>;

  beforeEach(async () => {
    jobStore = new InMemoryJobStore();
    workerRunStore = new InMemoryWorkerRunStore();
    charges = [];
    await jobStore.insert(queuedJob());
  });

  it("runs a queued job to success with the mock runner", async () => {
    const result = await processJob(makeDeps(jobStore, workerRunStore, mockExec, charges), "job_1");
    expect(result.status).toBe("succeeded");
    expect(result.output).toMatchObject({ producedBy: "mock-runner" });
    expect(result.costMinor).toBe(200);
  });

  it("records a worker run and execution logs", async () => {
    await processJob(makeDeps(jobStore, workerRunStore, mockExec, charges), "job_1");
    const runs = [...workerRunStore.runs.values()];
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("succeeded");
    expect(runs[0]?.costMinor).toBe(200);
    expect(jobStore.logs.some((l) => l.message.includes("started"))).toBe(true);
  });

  it("charges the usage ledger on success", async () => {
    await processJob(makeDeps(jobStore, workerRunStore, mockExec, charges), "job_1");
    expect(charges).toEqual([{ costMinor: 200, currency: "USD" }]);
  });

  it("fails the job when execution cannot be resolved", async () => {
    const result = await processJob(makeDeps(jobStore, workerRunStore, null, charges), "job_1");
    expect(result.status).toBe("failed");
    expect(charges).toHaveLength(0);
  });

  it("produces a structured failure for a disabled runner", async () => {
    const result = await processJob(
      makeDeps(jobStore, workerRunStore, { ...mockExec, runnerType: "local_worker" }, charges),
      "job_1",
    );
    expect(result.status).toBe("failed");
    expect((result.error as { code?: string })?.code).toBe("SANDBOX_FAILURE");
  });

  it("is a no-op on redelivery of a non-queued job (no double execution)", async () => {
    await processJob(makeDeps(jobStore, workerRunStore, mockExec, charges), "job_1");
    const again = await processJob(makeDeps(jobStore, workerRunStore, mockExec, charges), "job_1");
    expect(again.status).toBe("succeeded");
    expect(workerRunStore.runs.size).toBe(1); // not re-run
    expect(charges).toHaveLength(1);
  });

  it("processes a pre-claimed (already running) job without re-transitioning", async () => {
    // Simulate a poller that atomically claimed the job: queued -> running.
    await jobStore.update("job_1", { status: "running", startedAt: clock.now(), attempt: 1 });
    const result = await processJob(
      makeDeps(jobStore, workerRunStore, mockExec, charges),
      "job_1",
      { preClaimed: true },
    );
    expect(result.status).toBe("succeeded");
    expect(workerRunStore.runs.size).toBe(1);
    expect(charges).toEqual([{ costMinor: 200, currency: "USD" }]);
  });

  it("a non-preClaimed call ignores an already-running job (no double run)", async () => {
    await jobStore.update("job_1", { status: "running" });
    const result = await processJob(makeDeps(jobStore, workerRunStore, mockExec, charges), "job_1");
    expect(result.status).toBe("running"); // untouched
    expect(workerRunStore.runs.size).toBe(0);
  });
});
