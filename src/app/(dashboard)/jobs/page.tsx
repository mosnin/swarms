import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listJobs } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-blue-100 text-blue-800",
  queued: "bg-muted text-muted-foreground",
  awaiting_approval: "bg-yellow-100 text-yellow-800",
  awaiting_payment: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-muted text-muted-foreground",
};

export default async function JobsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const jobs = await listJobs(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Agent runs</h1>
        <p className="text-sm text-muted-foreground">
          Sandboxed worker agents spawned by your agents and members.
        </p>
      </header>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Job</th>
              <th className="p-3 font-medium">Kind</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Cost</th>
              <th className="p-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No jobs yet.
                </td>
              </tr>
            )}
            {jobs.map((j) => (
              <tr key={j.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/jobs/${j.id}`} className="hover:underline">
                    {j.id}
                  </Link>
                </td>
                <td className="p-3 text-xs">{j.capabilityKind}</td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[j.status] ?? "bg-muted"}`}>
                    {j.status}
                  </span>
                </td>
                <td className="p-3 text-xs">{format({ amountMinor: j.costMinor, currency: j.costCurrency })}</td>
                <td className="p-3 text-xs">{j.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
