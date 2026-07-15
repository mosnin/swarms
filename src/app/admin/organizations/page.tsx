import { headers } from "next/headers";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { logAdminAction } from "@/modules/admin/authz";
import { currentPlatformAdmin } from "@/modules/admin/current";
import { listOrganizations } from "@/modules/admin/service";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  archived: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  suspended: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const admin = await currentPlatformAdmin();
  const { search, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const result = await listOrganizations({ search, page });

  const headerList = await headers();
  await logAdminAction(admin, {
    action: "admin.organizations.list",
    resourceType: "organization",
    requestId: requestIdFrom(headerList),
    ip: clientIpFrom(headerList),
    metadata: { search: search ?? null, page },
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-1 text-sm text-muted-foreground">{result.total.toLocaleString()} total.</p>
      </div>

      <form className="relative max-w-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden>
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          name="search"
          defaultValue={search ?? ""}
          placeholder="Search by name or slug…"
          className="h-10 w-full rounded-xl border bg-background pl-10 pr-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/20"
        />
      </form>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Organization</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Members</th>
                <th className="px-4 py-2.5 font-medium">Jobs</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((org) => (
                <tr key={org.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/organizations/${org.id}`} className="font-medium hover:underline">
                      {org.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{org.slug}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[org.status] ?? "bg-muted text-muted-foreground"}`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{org.memberCount}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{org.jobCount}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No organizations match.
                  </td>
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
              <Link
                href={`/admin/organizations?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page - 1) })}`}
                className="rounded-lg border px-3 py-1.5 hover:bg-muted"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/organizations?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page + 1) })}`}
                className="rounded-lg border px-3 py-1.5 hover:bg-muted"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
