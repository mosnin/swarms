import Link from "next/link";

import { SearchTrigger } from "@/app/(dashboard)/_components/search-trigger";
import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { getOrganization } from "@/modules/identity/service";
import { overviewMetrics } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

/* Small inline glyphs for the card icons. */
const g = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
    <path d={d} />
  </svg>
);

export default async function DashboardPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const [org, metrics] = await Promise.all([getOrganization(ctx), overviewMetrics(ctx)]);

  return (
    <div className="space-y-6">
      {/* Search — opens the command palette */}
      <SearchTrigger />

      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Here&apos;s what&apos;s happening</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {org.name} <span className="text-muted-foreground/60">({org.slug})</span> · on-demand agent labor
          </p>
        </div>
        <Link href="/spawn">
          <Button>
            {g("M12 5v14M5 12h14")}
            Spawn an agent
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          tone="blue"
          icon={g("M8 6h13M8 12h13M8 18h13")}
          label="Agent runs"
          value={metrics.totalJobs}
          footer={`${metrics.succeededJobs} succeeded · ${metrics.failedJobs} failed`}
        />
        <StatTile
          tone="orange"
          icon={g("M13 2 3 14h9l-1 8 10-12h-9l1-8Z")}
          label="Running now"
          value={metrics.queuedJobs}
          footer="queued + in flight"
        />
        <StatTile
          tone="green"
          icon={g("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")}
          label="GPU spend · month"
          value={format({ amountMinor: metrics.spendThisMonthMinor, currency: "USD" })}
          footer="current billing period"
        />
        <StatTile
          tone="violet"
          icon={g("M9 11.5l2 2 4-4M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z")}
          label="Pending approvals"
          value={metrics.pendingApprovals}
          footer="awaiting review"
        />
      </div>

      {/* Recent activity */}
      <Card>
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-700 text-white">
            {g("M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z")}
          </span>
          <h2 className="text-sm font-semibold">Recent activity</h2>
        </div>
        {metrics.recentAudit.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No activity yet. Spawn your first agent to put it to work.
          </p>
        ) : (
          <ul className="divide-y">
            {metrics.recentAudit.map((e, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-mono text-xs">{e.action}</span>
                <span className="text-xs text-muted-foreground">
                  {e.resourceType} · {e.createdAt.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
