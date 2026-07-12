import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { StatTile } from "@/components/ui/stat-tile";
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
      <header>
        <h1 className="text-2xl font-bold">Usage & spend</h1>
        <p className="text-sm text-muted-foreground">
          Balance, burn rate, and the append-only ledger of holds, charges, releases, and payments.
        </p>
      </header>

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

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Direction</th>
              <th className="p-3 font-medium">Kind</th>
              <th className="p-3 font-medium">Amount</th>
              <th className="p-3 font-medium">Job</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No ledger entries yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="p-3 text-xs">{e.createdAt.toLocaleString()}</td>
                <td className="p-3 text-xs">{e.direction}</td>
                <td className="p-3 text-xs">{e.kind}</td>
                <td className="p-3 font-mono text-xs">
                  {format({ amountMinor: e.amountMinor, currency: e.currency })}
                </td>
                <td className="p-3 font-mono text-xs">
                  {e.jobId ? (
                    <Link href={`/jobs/${e.jobId}`} className="hover:underline">
                      {e.jobId.slice(0, 12)}…
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
