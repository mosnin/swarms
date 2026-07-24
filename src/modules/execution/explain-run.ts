/**
 * "Explain this run" — turns the hard facts of a job (status, timing, GPU
 * seconds, rate, budget ceiling, ledger charge) into a plain-English account of
 * what happened and why it cost what it did. Deterministic and derived entirely
 * from recorded data — no model, no guessing — so the explanation is always
 * true to the ledger. Pure and unit-testable.
 */

import { format } from "@/lib/money";

export interface RunFacts {
  capabilityKind: string;
  status: string;
  task: string | null;
  costMinor: number;
  currency: string;
  maxGpuSeconds: number | null;
  rateMinorPerSecond: number | null;
  attempt: number;
  maxAttempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  workerRunCount: number;
  /** The authoritative charge from the ledger, if one was posted. */
  chargeMinor: number | null;
  errorMessage: string | null;
}

export interface RunExplanationPoint {
  label: string;
  body: string;
}

export interface RunExplanation {
  headline: string;
  points: RunExplanationPoint[];
}

/** Structural view of a job detail — satisfied by dashboard `JobDetail`. */
export interface RunDetailInput {
  job: {
    capabilityKind: string;
    status: string;
    task: string | null;
    costMinor: number;
    costCurrency: string;
    input: unknown;
    attempt: number;
    maxAttempts: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    error: unknown;
  };
  ledger: Array<{ kind: string; direction: string; amountMinor: number }>;
  workerRunCount: number;
}

export function buildRunFacts(input: RunDetailInput): RunFacts {
  const j = input.job;
  const rawInput = (j.input ?? {}) as { maxGpuSeconds?: number; rateMinorPerSecond?: number };
  const charge = input.ledger.find((e) => e.kind === "charge" && e.direction === "debit");
  return {
    capabilityKind: j.capabilityKind,
    status: j.status,
    task: j.task,
    costMinor: j.costMinor,
    currency: j.costCurrency,
    maxGpuSeconds: typeof rawInput.maxGpuSeconds === "number" ? rawInput.maxGpuSeconds : null,
    rateMinorPerSecond: typeof rawInput.rateMinorPerSecond === "number" ? rawInput.rateMinorPerSecond : null,
    attempt: j.attempt,
    maxAttempts: j.maxAttempts,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
    workerRunCount: input.workerRunCount,
    chargeMinor: charge ? charge.amountMinor : null,
    errorMessage: extractError(j.error),
  };
}

function extractError(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    return typeof m === "string" ? m : null;
  }
  return null;
}

const KIND_LABEL: Record<string, string> = { swarm: "swarm run", agent: "agent run" };

function statusVerb(status: string): string {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "was cancelled";
    case "running":
      return "is still running";
    case "queued":
      return "is queued";
    case "awaiting_approval":
      return "is waiting for approval";
    case "awaiting_payment":
      return "is waiting for payment";
    default:
      return `is ${status}`;
  }
}

function humanDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const s = ms / 1_000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const mins = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${mins}m ${rem}s`;
}

function trimSeconds(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function explainRun(facts: RunFacts): RunExplanation {
  const kind = KIND_LABEL[facts.capabilityKind] ?? `${facts.capabilityKind} run`;
  const verb = statusVerb(facts.status);
  const money = (minor: number) => format({ amountMinor: minor, currency: facts.currency });

  const charged = facts.chargeMinor ?? (facts.status === "succeeded" ? facts.costMinor : 0);
  const ceilingMinor =
    facts.maxGpuSeconds != null && facts.rateMinorPerSecond != null
      ? facts.maxGpuSeconds * facts.rateMinorPerSecond
      : null;
  const gpuSecondsUsed =
    facts.rateMinorPerSecond && facts.rateMinorPerSecond > 0 && charged > 0
      ? charged / facts.rateMinorPerSecond
      : null;

  const headline =
    charged > 0
      ? `This ${kind} ${verb} and cost ${money(charged)}.`
      : facts.status === "failed" || facts.status === "cancelled"
        ? `This ${kind} ${verb} — no charge.`
        : `This ${kind} ${verb}.`;

  const points: RunExplanationPoint[] = [];

  points.push({
    label: "What it was asked to do",
    body: facts.task?.trim() ? facts.task.trim() : "No task text was recorded for this run.",
  });

  // What happened.
  let happened = `It ${verb}`;
  if (facts.startedAt && facts.finishedAt) {
    const ms = new Date(facts.finishedAt).getTime() - new Date(facts.startedAt).getTime();
    if (ms >= 0) happened += ` in ${humanDuration(ms)}`;
  }
  if (facts.attempt > 1) happened += `, on attempt ${facts.attempt} of ${facts.maxAttempts}`;
  if (facts.workerRunCount > 0) {
    happened += `, across ${facts.workerRunCount} worker run${facts.workerRunCount === 1 ? "" : "s"}`;
  }
  points.push({ label: "What happened", body: `${happened}.` });

  // Why it cost what it did.
  let cost: string;
  if (charged > 0 && gpuSecondsUsed != null && facts.rateMinorPerSecond) {
    cost = `${trimSeconds(gpuSecondsUsed)}s of GPU time × ${money(facts.rateMinorPerSecond)}/s = ${money(charged)}`;
    if (ceilingMinor != null) cost += `, within the ${money(ceilingMinor)} hard ceiling`;
    cost += ".";
  } else if (charged > 0) {
    cost = `${money(charged)} was charged to the ledger.`;
  } else if (facts.status === "failed") {
    cost = "Failed runs never charge — the budget hold was released in full.";
  } else if (facts.status === "cancelled") {
    cost = "Cancelled before it completed, so nothing was charged.";
  } else if (["queued", "running", "awaiting_approval", "awaiting_payment"].includes(facts.status)) {
    cost =
      ceilingMinor != null
        ? `No charge yet — spend is capped at ${money(ceilingMinor)}.`
        : "No charge yet.";
  } else {
    cost = "No charge.";
  }
  points.push({ label: "Why it cost what it did", body: cost });

  if (facts.errorMessage) {
    points.push({ label: "What went wrong", body: facts.errorMessage });
  }

  return { headline, points };
}
