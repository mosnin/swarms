import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { tryCurrentContext } from "@/modules/identity/current";
import { listSchedules } from "@/modules/schedules/schedule-service";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const schedules = await listSchedules(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedules"
        description="Recurring agent, swarm, and simulation runs (UTC cron). Pause/resume via the API or MCP."
      />

      <DataTable>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Kind</TH>
            <TH>Cron (UTC)</TH>
            <TH>Status</TH>
            <TH>Next run</TH>
            <TH>Last run</TH>
            <TH>Runs</TH>
          </TR>
        </THead>
        <tbody>
          {schedules.length === 0 && (
            <EmptyRow colSpan={7}>No schedules yet. Create one via POST /api/v1/schedules or MCP.</EmptyRow>
          )}
          {schedules.map((s) => (
            <TR key={s.id}>
              <TD className="text-xs font-medium">
                {s.name}
                {s.lastError && (
                  <span className="ml-2 text-red-500" title={s.lastError}>
                    ⚠
                  </span>
                )}
              </TD>
              <TD className="text-xs">{s.kind}</TD>
              <TD className="font-mono text-xs">{s.cronExpression}</TD>
              <TD>
                <StatusPill status={s.status} />
              </TD>
              <TD className="text-xs text-muted-foreground">
                {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—"}
              </TD>
              <TD className="text-xs text-muted-foreground">
                {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"}
              </TD>
              <TD className="text-xs tabular-nums">{s.runCount}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
