import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { isAppError } from "@/lib/errors";
import { tryCurrentContext } from "@/modules/identity/current";
import { getSimulationRun } from "@/modules/simulations/simulation-repository";

export const dynamic = "force-dynamic";

export default async function SimulationDetailPage({
  params,
}: {
  params: Promise<{ simulationRunId: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { simulationRunId } = await params;
  let run;
  try {
    run = await getSimulationRun(ctx, simulationRunId);
  } catch (err) {
    if (isAppError(err) && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Simulation ${run.id}`}
        description={run.objective || `${run.mode} crew of ${run.agents.length} personas`}
        actions={<StatusPill status={run.status} />}
      />

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Mode</dt>
          <dd>{run.mode}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cost</dt>
          <dd className="tabular-nums">{format({ amountMinor: run.costMinor, currency: run.costCurrency })}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Base fee</dt>
          <dd className="tabular-nums">{format({ amountMinor: run.baseFeeMinor, currency: run.costCurrency })}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">GPU seconds</dt>
          <dd className="tabular-nums">{run.gpuSeconds}</dd>
        </div>
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Personas</h2>
        <DataTable>
          <THead>
            <TR>
              <TH>Persona</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Output</TH>
            </TR>
          </THead>
          <tbody>
            {run.agents.length === 0 && <EmptyRow colSpan={4}>No persona records yet.</EmptyRow>}
            {run.agents.map((a) => (
              <TR key={a.personaName}>
                <TD className="text-xs font-medium">{a.personaName}</TD>
                <TD className="text-xs text-muted-foreground">{a.role ?? "—"}</TD>
                <TD>
                  <StatusPill status={a.status} />
                </TD>
                <TD className="max-w-md truncate text-xs text-muted-foreground">
                  {a.output ? JSON.stringify(a.output).slice(0, 160) : "—"}
                </TD>
              </TR>
            ))}
          </tbody>
        </DataTable>
      </section>

      {run.output !== null && run.output !== undefined && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Findings</h2>
          <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
