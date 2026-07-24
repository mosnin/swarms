import { headers } from "next/headers";

import { Card, CardBody } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { format } from "@/lib/money";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { logAdminAction } from "@/modules/admin/authz";
import { currentPlatformAdmin } from "@/modules/admin/current";
import { getPlatformTimeseries } from "@/modules/admin/metrics";
import { getPlatformOverview } from "@/modules/admin/service";

import { PlatformChart } from "./_components/platform-chart";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  awaiting_payment: "Awaiting payment",
  awaiting_approval: "Awaiting approval",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  queued: "bg-slate-400",
  running: "bg-blue-500",
  awaiting_payment: "bg-amber-500",
  awaiting_approval: "bg-amber-500",
  succeeded: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-slate-300",
};

const g = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
    <path d={d} />
  </svg>
);

export default async function AdminOverviewPage() {
  const admin = await currentPlatformAdmin();
  const overview = await getPlatformOverview();
  const timeseries = await getPlatformTimeseries({ days: 14 });

  const headerList = await headers();
  await logAdminAction(admin, {
    action: "admin.overview.read",
    resourceType: "platform",
    requestId: requestIdFrom(headerList),
    ip: clientIpFrom(headerList),
  });

  const totalJobs = Object.values(overview.jobsByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Platform overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cross-tenant metrics as of this request. Every figure here spans all organizations.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={g("M3 21v-3.5A3.5 3.5 0 0 1 6.5 14h3A3.5 3.5 0 0 1 13 17.5V21M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM16 21v-2.5a2.5 2.5 0 0 1 2.5-2.5h0a2.5 2.5 0 0 1 2.5 2.5V21M18 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z")}
          tone="violet"
          label="Organizations"
          value={overview.totalOrganizations.toLocaleString()}
        />
        <StatTile
          icon={g("M4 4h16v16H4z M4 9h16 M9 4v16")}
          tone="blue"
          label="Users"
          value={overview.totalUsers.toLocaleString()}
        />
        <StatTile
          icon={g("M13 2 3 14h7l-1 8 10-12h-7l1-8Z")}
          tone="orange"
          label="Active jobs"
          value={overview.activeJobs.toLocaleString()}
          footer="queued + running"
        />
        <StatTile
          icon={g("M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z")}
          tone="slate"
          label="Platform admins"
          value={overview.totalPlatformAdmins.toLocaleString()}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-sm font-medium">Spend</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {format({ amountMinor: overview.spendLast30dMinor, currency: "USD" })}
              </span>
              <span className="text-xs text-muted-foreground">last 30 days</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {format({ amountMinor: overview.spendAllTimeMinor, currency: "USD" })} all-time · succeeded jobs only
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-sm font-medium">Error rate (24h)</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {(overview.errorRateLast24h * 100).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                {overview.failedLast24h.toLocaleString()} of {overview.jobsLast24h.toLocaleString()} jobs
              </span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Activity &amp; spend</p>
            <p className="text-xs text-muted-foreground">last 14 days · UTC</p>
          </div>
          <div className="mt-4">
            <PlatformChart days={timeseries.days} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="text-sm font-medium">Jobs by status</p>
          <div className="mt-4 space-y-2.5">
            {Object.entries(overview.jobsByStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, n]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_TONE[status] ?? "bg-slate-400"}`} />
                  <span className="w-36 shrink-0 text-sm text-muted-foreground">{STATUS_LABEL[status] ?? status}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${STATUS_TONE[status] ?? "bg-slate-400"}`}
                      style={{ width: totalJobs > 0 ? `${Math.max(2, (n / totalJobs) * 100)}%` : "0%" }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums">{n.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
