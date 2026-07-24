/**
 * Unit: the deterministic run explainer. The narrative must always match the
 * facts — a succeeded run explains its GPU-seconds × rate = charge within the
 * ceiling; a failed run explains that nothing was charged.
 */

import { describe, expect, it } from "vitest";

import { buildRunFacts, explainRun, type RunFacts } from "@/modules/execution/explain-run";

const base: RunFacts = {
  capabilityKind: "agent",
  status: "succeeded",
  task: "Summarize the transcript",
  costMinor: 40,
  currency: "USD",
  maxGpuSeconds: 60,
  rateMinorPerSecond: 2,
  attempt: 1,
  maxAttempts: 1,
  startedAt: "2026-07-24T12:00:00.000Z",
  finishedAt: "2026-07-24T12:00:03.200Z",
  workerRunCount: 1,
  chargeMinor: 40,
  errorMessage: null,
};

describe("explainRun", () => {
  it("explains a succeeded run's cost as GPU-seconds × rate within the ceiling", () => {
    const e = explainRun(base);
    expect(e.headline).toBe("This agent run succeeded and cost $0.40.");
    const cost = e.points.find((p) => p.label === "Why it cost what it did")!.body;
    expect(cost).toContain("20s of GPU time × $0.02/s = $0.40");
    expect(cost).toContain("within the $1.20 hard ceiling");
    const happened = e.points.find((p) => p.label === "What happened")!.body;
    expect(happened).toContain("in 3.2s");
  });

  it("explains a failed run as never charged", () => {
    const e = explainRun({
      ...base,
      status: "failed",
      chargeMinor: null,
      costMinor: 0,
      errorMessage: "sandbox exited non-zero",
    });
    expect(e.headline).toBe("This agent run failed — no charge.");
    expect(e.points.find((p) => p.label === "Why it cost what it did")!.body).toMatch(/never charge/i);
    expect(e.points.find((p) => p.label === "What went wrong")!.body).toBe("sandbox exited non-zero");
  });

  it("describes an in-flight run with its cap and no charge yet", () => {
    const e = explainRun({ ...base, status: "running", chargeMinor: null, costMinor: 0, finishedAt: null });
    expect(e.headline).toBe("This agent run is still running.");
    expect(e.points.find((p) => p.label === "Why it cost what it did")!.body).toContain("capped at $1.20");
  });

  it("notes multiple attempts and worker runs", () => {
    const e = explainRun({ ...base, attempt: 2, maxAttempts: 3, workerRunCount: 4 });
    const happened = e.points.find((p) => p.label === "What happened")!.body;
    expect(happened).toContain("on attempt 2 of 3");
    expect(happened).toContain("across 4 worker runs");
  });
});

describe("buildRunFacts", () => {
  it("pulls gpu/rate from input, the charge from the ledger, and the error message", () => {
    const facts = buildRunFacts({
      job: {
        capabilityKind: "agent",
        status: "succeeded",
        task: "do a thing",
        costMinor: 40,
        costCurrency: "USD",
        input: { maxGpuSeconds: 30, rateMinorPerSecond: 2 },
        attempt: 1,
        maxAttempts: 1,
        startedAt: new Date("2026-07-24T12:00:00Z"),
        finishedAt: new Date("2026-07-24T12:00:02Z"),
        error: null,
      },
      ledger: [
        { kind: "credit", direction: "credit", amountMinor: 1000 },
        { kind: "charge", direction: "debit", amountMinor: 40 },
      ],
      workerRunCount: 1,
    });
    expect(facts.maxGpuSeconds).toBe(30);
    expect(facts.rateMinorPerSecond).toBe(2);
    expect(facts.chargeMinor).toBe(40);
    expect(facts.errorMessage).toBeNull();
  });

  it("extracts an error message from an error object", () => {
    const facts = buildRunFacts({
      job: {
        capabilityKind: "agent",
        status: "failed",
        task: null,
        costMinor: 0,
        costCurrency: "USD",
        input: {},
        attempt: 1,
        maxAttempts: 1,
        startedAt: null,
        finishedAt: null,
        error: { message: "boom" },
      },
      ledger: [],
      workerRunCount: 0,
    });
    expect(facts.errorMessage).toBe("boom");
    expect(facts.chargeMinor).toBeNull();
  });
});
