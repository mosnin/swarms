import { headers } from "next/headers";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { clientIpFrom } from "@/lib/client-ip";
import { format } from "@/lib/money";
import { requestIdFrom } from "@/lib/request-id";
import { logAdminAction } from "@/modules/admin/authz";
import { currentPlatformAdmin } from "@/modules/admin/current";
import { JOB_STATUSES, listJobsAcrossOrganizations } from "@/modules/admin/service";

export const dynamic = "force-dynamic";

const JOB_TONE: Record<string, string> = {
  succeeded: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  queued: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  cancelled: "bg-slate-500/10 text-slate-500",
  awaiting_payment: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  awaiting_approval: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; organizationId?: string; page?: string }>;
}) {
  const admin = await currentPlatformAdmin();
  const { status, organizationId, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const result = await listJobsAcrossOrganizations({ status, organizationId, page });

  const headerList = await headers();
  await logAdminAction(admin, {
    action: "admin.jobs.list",
    resourceType: "job",
    targetOrganizationId: organizationId ?? null,
    requestId: requestIdFrom(headerList),
    ip: clientIpFrom(headerList),
    metadata: { status: status ?? null, page },
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const filterParams = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string> = {};
    const next = { status, organizationId, page: undefined, ...overrides };
    for (const [k, v] of Object.entries(next)) if (v) merged[k] = v;
    return new URLSearchParams(merged).toString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.total.toLocaleString()} across all organizations
          {status ? ` · filtered to ${status}` : ""}.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/admin/jobs?${filterParams({ status: undefined })}`}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!status ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-muted"}`}
        >
          All
        </Link>
        {JOB_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/jobs?${filterParams({ status: s })}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${status === s ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-muted"}`}
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Organization</th>
                <th className="px-4 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((j) => (
                <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs">{j.id}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/organizations/${j.organizationId}`} className="hover:underline">
                      {j.organizationName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{j.capabilityKind}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${JOB_TONE[j.status] ?? "bg-muted text-muted-foreground"}`}>
                      {j.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {format({ amountMinor: j.costMinor, currency: "USD" })}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(j.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No jobs match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/jobs?${filterParams({ page: String(page - 1) })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/admin/jobs?${filterParams({ page: String(page + 1) })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
