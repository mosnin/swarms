import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { Id } from "@/components/ui/id";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listLedger } from "@/modules/dashboard/reads";
import { getAutoReload, getUsageAnalytics } from "@/modules/billing/credit-service";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const [entries, usage, autoReload] = await Promise.all([
    listLedger(ctx),
    getUsageAnalytics(ctx, { sinceDays: 30 }).catch(() => null),
    getAutoReload(ctx).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage & spend"
        description="Balance, burn rate, and the append-only ledger of holds, charges, releases, and payments."
      />

      {usage && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<span aria-hidden>◍</span>}
            tone="green"
            label="Available balance"
            value={format({ amountMinor: usage.balanceMinor, currency: usage.currency })}
          />
          <StatTile
            icon={<span aria-hidden>◔</span>}
            tone="blue"
            label={`Spent (last ${usage.sinceDays}d)`}
            value={format({ amountMinor: usage.totalSpentMinor, currency: usage.currency })}
          />
          <StatTile
            icon={<span aria-hidden>◑</span>}
            tone="orange"
            label="Daily burn"
            value={format({ amountMinor: usage.dailyBurnMinor, currency: usage.currency })}
          />
          <StatTile
            icon={<span aria-hidden>◕</span>}
            tone="violet"
            label="Runway"
            value={usage.runwayDays !== null ? `${usage.runwayDays}d` : "∞"}
            footer={
              autoReload?.enabled
                ? `Auto-reload: +${format({ amountMinor: autoReload.amountMinor, currency: autoReload.currency })} below ${format({ amountMinor: autoReload.thresholdMinor, currency: autoReload.currency })}`
                : "Auto-reload off"
            }
          />
        </div>
      )}

      <DataTable>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Direction</TH>
            <TH>Kind</TH>
            <TH>Amount</TH>
            <TH>Job</TH>
          </TR>
        </THead>
        <tbody>
          {entries.length === 0 && <EmptyRow colSpan={5}>No ledger entries yet.</EmptyRow>}
          {entries.map((e) => (
            <TR key={e.id}>
              <TD className="text-xs">{e.createdAt.toLocaleString()}</TD>
              <TD className="text-xs">{e.direction}</TD>
              <TD className="text-xs">{e.kind}</TD>
              <TD className="font-mono text-xs tabular-nums">
                {format({ amountMinor: e.amountMinor, currency: e.currency })}
              </TD>
              <TD className="text-xs">
                {e.jobId ? <Id value={e.jobId} href={`/jobs/${e.jobId}`} /> : "—"}
              </TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
