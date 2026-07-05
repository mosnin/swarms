import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { getOrganization } from "@/modules/identity/service";
import { overviewMetrics } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const [org, metrics] = await Promise.all([getOrganization(ctx), overviewMetrics(ctx)]);

  const cards = [
    { label: "Agent runs", value: String(metrics.totalJobs), href: "/jobs" },
    { label: "Succeeded", value: String(metrics.succeededJobs), href: "/jobs" },
    { label: "Failed", value: String(metrics.failedJobs), href: "/jobs" },
    {
      label: "GPU spend this month",
      value: format({ amountMinor: metrics.spendThisMonthMinor, currency: "USD" }),
      href: "/usage",
    },
    { label: "Running now", value: String(metrics.queuedJobs), href: "/jobs" },
    { label: "Pending approvals", value: String(metrics.pendingApprovals), href: "/approvals" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          <>
            {org.name} <span className="text-muted-foreground/60">({org.slug})</span> · on-demand
            agent labor
          </>
        }
        actions={
          <Link href="/spawn">
            <Button>Spawn an agent</Button>
          </Link>
        }
      />

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c, i) => (
          <Link key={c.label} href={c.href} className="animate-rise-in" style={{ animationDelay: `${i * 40}ms` }}>
            <Card interactive className="h-full p-4">
              <dt className="text-sm text-muted-foreground">{c.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{c.value}</dd>
            </Card>
          </Link>
        ))}
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
        <Card>
          {metrics.recentAudit.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
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
      </section>
    </div>
  );
}
