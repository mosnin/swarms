import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listSimulationRuns } from "@/modules/simulations/simulation-repository";

export const dynamic = "force-dynamic";

export default async function SimulationsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { runs } = await listSimulationRuns(ctx, { limit: 50 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulations"
        description="CrewAI persona crews — parallel research panels and collaborative ICP simulations."
      />

      <DataTable>
        <THead>
          <TR>
            <TH>Run</TH>
            <TH>Mode</TH>
            <TH>Framework</TH>
            <TH>Personas</TH>
            <TH>Status</TH>
            <TH>Cost</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <tbody>
          {runs.length === 0 && <EmptyRow colSpan={7}>No simulations yet. Run one via POST /api/v1/simulations or MCP.</EmptyRow>}
          {runs.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-xs">
                <Link href={`/simulations/${r.id}`} className="hover:underline">
                  {r.id}
                </Link>
              </TD>
              <TD className="text-xs">{r.mode}</TD>
              <TD className="text-xs text-muted-foreground">{r.frameworkId ?? "—"}</TD>
              <TD className="text-xs tabular-nums">{r.agentCount}</TD>
              <TD>
                <StatusPill status={r.status} />
              </TD>
              <TD className="text-xs tabular-nums">
                {format({ amountMinor: r.costMinor, currency: r.costCurrency })}
              </TD>
              <TD className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
