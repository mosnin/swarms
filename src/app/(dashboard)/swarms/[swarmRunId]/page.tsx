import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { SwarmLive } from "@/app/(dashboard)/swarms/[swarmRunId]/_components/swarm-live";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { isAppError } from "@/lib/errors";
import { tryCurrentContext } from "@/modules/identity/current";
import { getSwarmRun } from "@/modules/swarms/swarm-repository";

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "partial"]);

export const dynamic = "force-dynamic";

export default async function SwarmDetailPage({
  params,
}: {
  params: Promise<{ swarmRunId: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { swarmRunId } = await params;
  const run = await getSwarmRun(ctx, swarmRunId).catch((err) => {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/swarms" className="hover:underline">
            Swarms
          </Link>{" "}
          / {run.id}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Swarm run</h1>
          <StatusPill status={run.status} />
          <SwarmLive status={run.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{run.objective}</p>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Meta label="Total cost" value={format({ amountMinor: run.costMinor, currency: run.costCurrency })} />
        <Meta label="Agents" value={String(run.agents.length)} />
        <Meta label="Run id" value={run.id} mono />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Agents</h2>
        <DataTable>
          <THead>
            <TR>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Child job</TH>
              <TH>Cost</TH>
            </TR>
          </THead>
          <tbody>
            {run.agents.map((a, i) => (
              <TR key={i}>
                <TD className="font-medium">{a.role}</TD>
                <TD>
                  <StatusPill status={a.status} />
                </TD>
                <TD className="font-mono text-xs">
                  {a.jobId ? (
                    <Link href={`/jobs/${a.jobId}`} className="hover:underline">
                      {a.jobId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-xs tabular-nums">
                  {format({ amountMinor: a.costMinor, currency: run.costCurrency })}
                </TD>
              </TR>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Merged result</h2>
        {TERMINAL.has(run.status) && run.output != null ? (
          <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-4 text-xs">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {TERMINAL.has(run.status)
              ? "No merged result was produced."
              : "The workforce is still running. The merged result will appear here when the swarm completes."}
          </p>
        )}
      </section>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card className="p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={mono ? "mt-1 truncate font-mono text-xs" : "mt-1 text-sm font-medium"}>{value}</dd>
    </Card>
  );
}
