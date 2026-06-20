import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listSwarmRuns } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

export default async function SwarmsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const runs = await listSwarmRuns(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Swarms</h1>
        <p className="text-sm text-muted-foreground">Multi-agent runs and their rolled-up cost.</p>
      </header>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Run</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Cost</th>
              <th className="p-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                  No swarm runs yet.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/swarms/${r.id}`} className="hover:underline">
                    {r.id}
                  </Link>
                </td>
                <td className="p-3 text-xs">{r.status}</td>
                <td className="p-3 text-xs">{format({ amountMinor: r.costMinor, currency: r.costCurrency })}</td>
                <td className="p-3 text-xs">{r.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
