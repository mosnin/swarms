import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
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
    { label: "Total jobs", value: String(metrics.totalJobs), href: "/jobs" },
    { label: "Succeeded", value: String(metrics.succeededJobs), href: "/jobs" },
    { label: "Failed", value: String(metrics.failedJobs), href: "/jobs" },
    {
      label: "Spend this month",
      value: format({ amountMinor: metrics.spendThisMonthMinor, currency: "USD" }),
      href: "/usage",
    },
    { label: "Active skills", value: String(metrics.activeSkills), href: "/skills" },
    { label: "Connectors", value: String(metrics.activeConnectors), href: "/connectors" },
    { label: "Pending approvals", value: String(metrics.pendingApprovals), href: "/approvals" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {org.name} <span className="text-muted-foreground/60">({org.slug})</span> ·{" "}
          {ctx.actor.kind} / {ctx.actor.role}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-lg border p-4 hover:bg-muted/40">
            <dt className="text-sm text-muted-foreground">{c.label}</dt>
            <dd className="mt-1 text-xl font-semibold">{c.value}</dd>
          </Link>
        ))}
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
        <div className="rounded-lg border">
          {metrics.recentAudit.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {metrics.recentAudit.map((e, i) => (
                <li key={i} className="flex justify-between p-3 text-sm">
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.resourceType} · {e.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
