import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrgActions } from "@/app/admin/_components/org-actions";
import { Card, CardBody } from "@/components/ui/card";
import { clientIpFrom } from "@/lib/client-ip";
import { format } from "@/lib/money";
import { requestIdFrom } from "@/lib/request-id";
import { logAdminAction } from "@/modules/admin/authz";
import { currentPlatformAdmin } from "@/modules/admin/current";
import { getOrganizationDetail } from "@/modules/admin/service";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  archived: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  suspended: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const JOB_TONE: Record<string, string> = {
  succeeded: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
  running: "text-blue-600 dark:text-blue-400",
  queued: "text-muted-foreground",
  cancelled: "text-muted-foreground",
  awaiting_payment: "text-amber-600 dark:text-amber-400",
  awaiting_approval: "text-amber-600 dark:text-amber-400",
};

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const admin = await currentPlatformAdmin();
  const { organizationId } = await params;

  const org = await getOrganizationDetail(organizationId);
  if (!org) notFound();

  const headerList = await headers();
  await logAdminAction(admin, {
    action: "admin.organization.read",
    resourceType: "organization",
    resourceId: organizationId,
    targetOrganizationId: organizationId,
    requestId: requestIdFrom(headerList),
    ip: clientIpFrom(headerList),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin/organizations" className="hover:text-foreground">Organizations</Link>
            <span aria-hidden>/</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{org.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{org.id} · {org.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[org.status] ?? "bg-muted text-muted-foreground"}`}>
            {org.status}
          </span>
          <OrgActions organizationId={org.id} status={org.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-sm font-medium">Wallets</p>
            {org.wallets.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No wallets.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {org.wallets.map((w) => (
                  <li key={w.id} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{w.id}</span>
                    <span className="font-medium tabular-nums">
                      {format({ amountMinor: w.balanceMinor, currency: w.currency })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-sm font-medium">Budgets</p>
            {org.budgets.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No budgets.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {org.budgets.map((b) => {
                  const pct = b.limitMinor > 0 ? Math.min(100, (b.spentMinor / b.limitMinor) * 100) : 0;
                  return (
                    <li key={b.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{b.name}</span>
                        <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">
                          {format({ amountMinor: b.spentMinor, currency: b.currency })} / {format({ amountMinor: b.limitMinor, currency: b.currency })}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b px-5 py-3">
          <p className="text-sm font-medium">Members ({org.members.length})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m) => (
                <tr key={m.userId} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{m.name ?? m.email}</span>
                    {m.name && <span className="ml-2 text-xs text-muted-foreground">{m.email}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{m.role}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {org.members.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No members.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b px-5 py-3">
            <p className="text-sm font-medium">Recent jobs</p>
          </div>
          <ul className="divide-y">
            {org.recentJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs">{j.id}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{j.capabilityKind}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {format({ amountMinor: j.costMinor, currency: "USD" })}
                  </span>
                  <span className={`text-xs font-medium ${JOB_TONE[j.status] ?? "text-muted-foreground"}`}>{j.status}</span>
                </div>
              </li>
            ))}
            {org.recentJobs.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">No jobs yet.</li>
            )}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-5 py-3">
            <p className="text-sm font-medium">Recent audit events</p>
          </div>
          <ul className="divide-y">
            {org.recentAuditEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="truncate font-medium">{e.action}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{e.resourceType}</span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
            {org.recentAuditEvents.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">No audit events.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
