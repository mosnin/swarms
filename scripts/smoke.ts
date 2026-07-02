/**
 * One-command full-spine smoke test — the "does it actually work?" signal.
 *
 * Drives the REAL request path end to end, with nothing mocked except the
 * agent runtime and sandbox (which default to in-process stubs):
 *
 *   create org + API key  ->  POST /api/v1/swarms route handler
 *   ->  Bearer API-key authentication        (real hashing + lookup)
 *   ->  spawnSwarm: one worker agent per task (real execution spine)
 *   ->  budget reserve / commit              (real money path)
 *   ->  usage ledger charge                  (append-only system of record)
 *
 * It runs against PGlite (in-process Postgres with the real migrations), so
 * `npm run smoke` needs no external services and is a single green/red exit
 * code suitable for local use or a pre-deploy CI gate.
 *
 * To point it at a real database instead, export DATABASE_URL and the harness
 * still injects PGlite — wiring a live target is a follow-up; this proves the
 * code path, not a specific deployment.
 */

// MUST be first: sets env defaults before any module reads `@/lib/env` (which
// validates at import time). ESM evaluates imports in source order.
import "./_smoke-env";

import { eq } from "drizzle-orm";

import { __setTestDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { createApiKey } from "@/modules/identity/service";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { POST as spawnSwarmRoute } from "@/app/api/v1/swarms/route";

import { createTestDb, seedOrg } from "../tests/integration/harness";

/** Throw with a clear message when an invariant the product depends on fails. */
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`smoke assertion failed: ${message}`);
}

const TASKS = ["Draft the launch announcement", "List the top risks", "Propose a timeline"];
const BUDGET_MINOR = 300;

async function main(): Promise<void> {
  // The queue runs jobs inline so the swarm resolves synchronously in-process.
  setJobQueue(new LocalQueue());

  // Real Postgres schema (PGlite) injected so route handlers + services use it.
  const { db } = await createTestDb();
  __setTestDb(db);

  // 1. Create an organization (with owner + wallet).
  const { organizationId, userId } = await seedOrg(db, "smoke-org");
  const owner = userContext({ organizationId, userId, membershipId: "m_smoke", role: "owner" });

  // 2. Mint a real API key scoped to spawn work — exactly what an agent uses.
  const { plaintext } = await createApiKey(
    owner,
    { name: "smoke-key", scopes: ["jobs.create", "jobs.read"] },
    db,
  );
  check(plaintext.length > 0, "API key plaintext returned");

  // 3. Hit the actual HTTP route handler with Bearer auth — no shortcuts.
  const request = new Request("http://smoke.local/api/v1/swarms", {
    method: "POST",
    headers: {
      authorization: `Bearer ${plaintext}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      objective: "Smoke test the workforce path",
      tasks: TASKS,
      budgetMinor: BUDGET_MINOR,
      idempotencyKey: "smoke-0001",
    }),
    // Next's route handler accepts the web Request; cast for the typed signature.
  }) as unknown as Parameters<typeof spawnSwarmRoute>[0];

  const response = await spawnSwarmRoute(request);
  check(response.status === 201, `expected 201 from POST /api/v1/swarms, got ${response.status}`);

  const payload = (await response.json()) as { data: SpawnResponse };
  const result = payload.data;

  // 4. Assert the workforce ran: one worker per task, all succeeded.
  check(result.status === "succeeded", `swarm status was "${result.status}"`);
  check(result.workerCount === TASKS.length, `expected ${TASKS.length} workers`);
  check(result.workers.length === TASKS.length, "workers array length");
  check(
    result.workers.every((w) => w.status === "succeeded"),
    "every worker succeeded",
  );
  check(
    result.workers.every((w) => Boolean(w.jobId)),
    "every worker has a persisted jobId",
  );

  // 5. Assert the LEDGER charge: an append-only debit charge actually landed,
  //    within budget and consistent with the reported cost.
  const ledger = await db
    .select()
    .from(schema.usageLedgerEntries)
    .where(eq(schema.usageLedgerEntries.organizationId, organizationId));

  const charges = ledger.filter((e) => e.direction === "debit" && e.kind === "charge");
  const chargedMinor = charges.reduce((sum, e) => sum + e.amountMinor, 0);

  check(charges.length > 0, "at least one usage-ledger charge was recorded");
  check(result.costMinor > 0, "swarm reported a positive cost");
  check(chargedMinor === result.costMinor, `ledger total ${chargedMinor} == reported ${result.costMinor}`);
  check(chargedMinor <= BUDGET_MINOR, `charge ${chargedMinor} stayed within budget ${BUDGET_MINOR}`);

  // 6. Secrets-in / secrets-out sanity: nothing plaintext leaked in the body.
  check(!JSON.stringify(result).includes(plaintext), "API key not echoed in response");

  report(result, charges.length, chargedMinor);
}

interface SpawnResponse {
  swarmRunId: string;
  status: string;
  workerCount: number;
  costMinor: number;
  workers: { jobId: string; status: string }[];
}

function report(result: SpawnResponse, chargeCount: number, chargedMinor: number): void {
  const lines = [
    "SMOKE PASSED — full spine is green",
    `  swarm run        ${result.swarmRunId}`,
    `  workers          ${result.workerCount} spawned, all succeeded`,
    `  ledger charges   ${chargeCount} debit entr${chargeCount === 1 ? "y" : "ies"}`,
    `  charged          ${chargedMinor} minor (<= ${BUDGET_MINOR} budget)`,
  ];
  process.stdout.write(`\n${lines.join("\n")}\n\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(`\nSMOKE FAILED\n  ${error instanceof Error ? error.message : String(error)}\n\n`);
    process.exit(1);
  });
