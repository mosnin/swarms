import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { createJob } from "@/modules/execution/job-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { processJobInDb } from "@/modules/execution/worker";
import { reserveBudget } from "@/server/budget/reserveBudget";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: spawn a workforce (swarm of agents)", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => {
    setJobQueue(undefined);
    __setTestDb(undefined);
  });

  it("spawns one worker per task, each inheriting the shared resources, under one budget", async () => {
    const { organizationId, userId } = await seedOrg(db);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        objective: "Prepare the launch",
        tasks: ["Draft the announcement", "List the risks", "Propose a timeline"],
        resources: { context: "Launch is in Q4", env: { NOTION_TOKEN: "secret-value" } },
        budgetMinor: 300,
        idempotencyKey: "swarm-int-0001",
      },
      db,
    );

    expect(res.workerCount).toBe(3);
    expect(res.workers).toHaveLength(3);
    expect(res.status).toBe("succeeded");
    expect(res.workers.every((w) => w.status === "succeeded")).toBe(true);
    // Secrets never surface in the response.
    expect(JSON.stringify(res)).not.toContain("secret-value");

    // Every worker is a real agent job that inherited the shared resources.
    for (const worker of res.workers) {
      expect(worker.jobId).toBeTruthy();
      expect(worker.output).toMatchObject({ producedBy: "mock-agent-runtime", usedContext: true });
    }

    // One shared, encrypted resource bundle for the whole workforce.
    const bundles = await db.select().from(schema.resourceBundles);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.encrypted).not.toContain("secret-value");

    // Aggregate spend stayed within the swarm budget.
    expect(res.costMinor).toBeGreaterThan(0);
    expect(res.costMinor).toBeLessThanOrEqual(300);

    // The swarm run was persisted (the agent-workforce path).
    const run = (
      await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, res.swarmRunId))
    )[0];
    expect(run?.id).toBe(res.swarmRunId);
  });

  it("splits the aggregate budget into a hard per-worker GPU ceiling", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      { tasks: ["a", "b"], budgetMinor: 8, idempotencyKey: "swarm-int-0002" },
      db,
    );
    // rate 2/sec, budget 8 over 2 workers = 4 minor each = 2 GPU-seconds per worker.
    expect(res.maxGpuSecondsPerWorker).toBe(2);
    expect(res.costMinor).toBeLessThanOrEqual(8);
  });

  it("rejects an empty workforce", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    await expect(
      spawnSwarm(ctx, { tasks: ["   "], idempotencyKey: "swarm-int-0003" }, db),
    ).rejects.toThrow(/at least one task/i);
  });

  it("rejects a budget too low to fund the workforce instead of over-charging", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    // rate is 2/sec; 4 workers need >= 8 minor units. A budget of 4 can fund
    // only floor(4/4)=1 < 2 per worker — must be rejected, never silently
    // bumped to 2/worker (which would charge 8 > the stated budget of 4).
    await expect(
      spawnSwarm(
        ctx,
        { tasks: ["a", "b", "c", "d"], budgetMinor: 4, idempotencyKey: "swarm-int-0004" },
        db,
      ),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  // ── Feature 1: Sequential context threading ────────────────────────────────

  it("sequential mode: each worker receives the prior worker's output as context", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-seq-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        tasks: ["Scrape the homepage", "Extract key facts"],
        budgetMinor: 200,
        sequential: true,
        idempotencyKey: "swarm-seq-0001",
      },
      db,
    );

    expect(res.status).toBe("succeeded");
    expect(res.workerCount).toBe(2);

    // The second worker's task should contain "Previous step output" — verify via
    // what the mock runtime echoes back in its output.task field.
    const w2 = res.workers[1]!;
    const task2 = (w2.output as { task?: string })?.task ?? "";
    expect(task2).toContain("Previous step output");
    expect(task2).toContain("mock-agent-runtime"); // w1's output is in w2's context
  });

  // ── Feature 2: Aggregator agent (Mixture-of-Agents) ───────────────────────

  it("aggregator: spawns a final synthesis agent and returns aggregatorOutput", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-agg-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        tasks: ["Research topic A", "Research topic B"],
        aggregatorTask: "Combine the research into one report",
        // 3 slots (2 workers + 1 aggregator): budget must cover all 3
        budgetMinor: 300,
        idempotencyKey: "swarm-agg-0001",
      },
      db,
    );

    expect(res.status).toBe("succeeded");
    expect(res.workerCount).toBe(2);
    // aggregatorOutput is present and non-null
    expect(res.aggregatorOutput).toBeTruthy();
    // The aggregator is a real agent job whose task contains worker outputs
    const aggTask = (res.aggregatorOutput as { task?: string })?.task ?? "";
    expect(aggTask).toContain("Combine the research");
    expect(aggTask).toContain("worker-1");
    expect(aggTask).toContain("worker-2");
  });

  it("aggregator: budget includes the aggregator slot (N+1 agents)", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-agg-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // 2 workers + 1 aggregator = 3 slots; rate 2/sec; budget 6 → 2 minor/slot = 1 GPU-sec each
    const res = await spawnSwarm(
      ctx,
      {
        tasks: ["a", "b"],
        aggregatorTask: "summarise",
        budgetMinor: 6,
        idempotencyKey: "swarm-agg-0002",
      },
      db,
    );

    expect(res.maxGpuSecondsPerWorker).toBe(1);
    expect(res.costMinor).toBeLessThanOrEqual(6);
  });

  // ── Feature 10: Per-worker timeout override ───────────────────────────────

  it("per-worker timeouts: each worker gets an individual GPU budget", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-timeout-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Workers get 10 s and 30 s respectively. rate = 2 minor/sec → 20 and 60 minor.
    const res = await spawnSwarm(
      ctx,
      {
        tasks: ["quick task", "long task"],
        workerTimeouts: [10, 30],
        idempotencyKey: "swarm-timeout-0001",
      },
      db,
    );

    expect(res.status).toBe("succeeded");
    expect(res.workerCount).toBe(2);
    // Aggregate cost must be within the sum of per-worker budgets (20+60=80 minor).
    expect(res.costMinor).toBeLessThanOrEqual(80);
  });

  it("per-worker timeouts: rejects when length mismatches task count", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-timeout-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await expect(
      spawnSwarm(
        ctx,
        { tasks: ["a", "b", "c"], workerTimeouts: [10, 20], idempotencyKey: "swarm-timeout-err" },
        db,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("per-worker timeouts: rejects when total exceeds budgetMinor", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-timeout-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // rate=2, 30s+30s = 120 minor; budget only 50
    await expect(
      spawnSwarm(
        ctx,
        { tasks: ["a", "b"], workerTimeouts: [30, 30], budgetMinor: 50, idempotencyKey: "swarm-timeout-budget" },
        db,
      ),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  // ── Feature 3: Hierarchical director (kind="swarm") ───────────────────────

  it("director job: a kind=swarm job spawns a child swarm and reports its output", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-dir-1");

    // Director job holds the child swarm config in its `input` JSONB field.
    const directorInput = {
      tasks: ["Write intro", "Write conclusion"],
      objective: "Draft a blog post",
      budgetMinor: 200,
      currency: "USD",
    };

    const { job: director } = await createJob(
      dbJobStore(db),
      new LocalQueue(),
      {
        organizationId,
        createdByUserId: userId,
        apiKeyId: null,
        capability: {
          kind: "swarm",
          // Human-readable description stored in task; actual config is in input.
          task: JSON.stringify(directorInput),
          priceMinor: 200,
          priceCurrency: "USD",
        },
        input: directorInput,
        idempotencyKey: "director-int-0001",
        currency: "USD",
      },
    );

    expect(director.capabilityKind).toBe("swarm");

    // Reserve budget for the director job itself.
    await reserveBudget(
      { organizationId, jobId: director.id, amountMinor: 200, currency: "USD" },
      db,
    );

    // Processing the director job spawns the child swarm via SwarmRunner.
    const result = await processJobInDb(director.id, db);

    expect(result.status).toBe("succeeded");
    // The director's output is the child swarm result.
    expect(result.output).toMatchObject({ workerCount: 2, status: expect.stringMatching(/succeeded|partial/) });
    // Child swarm workers ran real agent jobs.
    const childJobs = await db.select().from(schema.jobs).where(eq(schema.jobs.organizationId, organizationId));
    // Director job + 2 child worker jobs = 3 jobs
    expect(childJobs.length).toBeGreaterThanOrEqual(3);
  });

  // ── Feature 8: Swarm templates ────────────────────────────────────────────

  it("templateId=research: spawns 4 workers + aggregator with objective interpolated", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-tpl-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        templateId: "research",
        objective: "the future of autonomous agents",
        // research template = 4 workers + 1 aggregator = 5 slots; rate 2/sec → 10 minor min
        budgetMinor: 500,
        idempotencyKey: "swarm-tpl-research-0001",
      },
      db,
    );

    expect(res.status).toBe("succeeded");
    expect(res.workerCount).toBe(4); // research template has 4 tasks
    // Aggregator ran (research template defines aggregatorTask)
    expect(res.aggregatorOutput).toBeTruthy();
    // Objective is interpolated into worker tasks
    const taskStrings = res.workers.map((w) => (w.output as { task?: string })?.task ?? "");
    expect(taskStrings.some((t) => t.includes("the future of autonomous agents"))).toBe(true);
  });

  it("templateId=pipeline: spawns 4 sequential workers with no aggregator", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-tpl-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        templateId: "pipeline",
        objective: "open-source LLM landscape",
        budgetMinor: 400,
        idempotencyKey: "swarm-tpl-pipeline-0001",
      },
      db,
    );

    expect(res.status).toBe("succeeded");
    expect(res.workerCount).toBe(4); // pipeline template has 4 tasks
    // Pipeline template has no aggregatorTask
    expect(res.aggregatorOutput).toBeUndefined();
  });

  it("templateId=synthesis: spawns 3 workers + aggregator (Mixture-of-Agents)", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-tpl-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        templateId: "synthesis",
        objective: "best practices for multi-agent systems",
        budgetMinor: 400,
        idempotencyKey: "swarm-tpl-synthesis-0001",
      },
      db,
    );

    expect(res.status).toBe("succeeded");
    expect(res.workerCount).toBe(3); // synthesis template has 3 tasks
    expect(res.aggregatorOutput).toBeTruthy();
  });

  it("templateId: caller-supplied tasks override the template default", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-tpl-4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        templateId: "research",
        tasks: ["custom task only"], // override — 1 worker instead of template's 4
        objective: "ignored when tasks are explicit",
        budgetMinor: 200,
        idempotencyKey: "swarm-tpl-override-0001",
      },
      db,
    );

    expect(res.workerCount).toBe(1);
  });

  it("templateId: unknown template returns a VALIDATION error", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-tpl-5");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await expect(
      spawnSwarm(ctx, { templateId: "does-not-exist", budgetMinor: 100, idempotencyKey: "swarm-tpl-bad" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
