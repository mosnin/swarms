import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { SwarmSpawnForm } from "@/app/(dashboard)/swarms/_components/swarm-spawn-form";
import { SwarmLive } from "@/app/(dashboard)/swarms/[swarmRunId]/_components/swarm-live";
import { Id } from "@/components/ui/id";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listSwarmRuns } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "partial"]);

export default async function SwarmsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const runs = await listSwarmRuns(ctx);
  const anyActive = runs.some((r) => !TERMINAL.has(r.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Swarms"
        description="Multi-agent runs and their rolled-up cost."
        actions={anyActive ? <SwarmLive status="running" /> : undefined}
      />

      <SwarmSpawnForm />

      <DataTable>
        <THead>
          <TR>
            <TH>Run</TH>
            <TH>Status</TH>
            <TH>Cost</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <tbody>
          {runs.length === 0 && <EmptyRow colSpan={4}>No swarm runs yet.</EmptyRow>}
          {runs.map((r) => (
            <TR key={r.id}>
              <TD className="text-xs">
                <Id value={r.id} href={`/swarms/${r.id}`} />
              </TD>
              <TD>
                <StatusPill status={r.status} />
              </TD>
              <TD className="text-xs tabular-nums">
                {format({ amountMinor: r.costMinor, currency: r.costCurrency })}
              </TD>
              <TD className="text-xs text-muted-foreground">{r.createdAt.toLocaleString()}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
