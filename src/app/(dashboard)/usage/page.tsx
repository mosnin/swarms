import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listLedger } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const entries = await listLedger(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Usage ledger</h1>
        <p className="text-sm text-muted-foreground">
          Append-only record of holds, charges, releases, and payments.
        </p>
      </header>

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
