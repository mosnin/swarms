import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { isAppError } from "@/lib/errors";
import { tryCurrentContext } from "@/modules/identity/current";
import { getSwarmRun } from "@/modules/swarms/swarm-repository";

export const dynamic = "force-dynamic";

export default async function SwarmDetailPage({
  params,
}: {
  params: Promise<{ swarmRunId: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { swarmRunId } = await params;
  const run = await getSwarmRun(ctx, swarmRunId).catch((err) => {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/swarms" className="hover:underline">
            Swarms
          </Link>{" "}
          / {run.id}
        </p>
        <h1 className="text-2xl font-bold">Swarm {run.status}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{run.objective}</p>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Meta label="Status" value={run.status} />
        <Meta label="Total cost" value={format({ amountMinor: run.costMinor, currency: run.costCurrency })} />
        <Meta label="Agents" value={String(run.agents.length)} />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Agents</h2>
        <div className="rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Child job</th>
                <th className="p-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {run.agents.map((a, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-3">{a.role}</td>
                  <td className="p-3 text-xs">{a.status}</td>
                  <td className="p-3 font-mono text-xs">
                    {a.jobId ? (
                      <Link href={`/jobs/${a.jobId}`} className="hover:underline">
                        {a.jobId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {format({ amountMinor: a.costMinor, currency: run.costCurrency })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Merged result</h2>
        <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-4 text-xs">
          {JSON.stringify(run.output, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
