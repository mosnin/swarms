import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { redact } from "@/lib/redaction";
import { tryCurrentContext } from "@/modules/identity/current";
import { getJobDetail } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { jobId } = await params;
  const detail = await getJobDetail(ctx, jobId);
  if (!detail) notFound();
  const { job, logs, workerRuns, ledger, receipt } = detail;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/jobs" className="hover:underline">
            Jobs
          </Link>{" "}
          / {job.id}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Job</h1>
          <StatusPill status={job.status} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Meta label="Status" value={<StatusPill status={job.status} />} />
        <Meta label="Kind" value={job.capabilityKind} />
        <Meta label="Cost" value={format({ amountMinor: job.costMinor, currency: job.costCurrency })} />
        <Meta label="Created" value={job.createdAt.toLocaleString()} />
      </dl>

      <Json label="Input" value={job.input} />
      {job.output ? <Json label="Output" value={job.output} /> : null}
      {job.error ? <Json label="Error" value={job.error} /> : null}

      <Section title="Logs">
        {logs.length === 0 ? (
          <Empty>No logs.</Empty>
        ) : (
          <ul className="divide-y rounded-lg border">
            {logs.map((l) => (
              <li key={l.id} className="flex justify-between gap-4 p-3 text-xs">
                <span>
                  <span className="font-mono text-muted-foreground">[{l.level}]</span> {l.message}
                </span>
                <span className="shrink-0 text-muted-foreground">{l.loggedAt.toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Worker runs">
        {workerRuns.length === 0 ? (
          <Empty>No worker runs.</Empty>
        ) : (
          <DataTable>
            <THead>
              <TR>
                <TH>Worker</TH>
                <TH>Runner</TH>
                <TH>Status</TH>
                <TH>Duration</TH>
                <TH>Cost</TH>
              </TR>
            </THead>
            <tbody>
              {workerRuns.map((w) => (
                <TR key={w.id}>
                  <TD className="font-mono text-xs">{w.workerId}</TD>
                  <TD className="text-xs">{w.runnerType ?? "—"}</TD>
                  <TD>
                    <StatusPill status={w.status} />
                  </TD>
                  <TD className="text-xs tabular-nums">{w.durationMs != null ? `${w.durationMs}ms` : "—"}</TD>
                  <TD className="text-xs tabular-nums">
                    {format({ amountMinor: w.costMinor, currency: w.costCurrency })}
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      <Section title="Ledger entries">
        {ledger.length === 0 ? (
          <Empty>No ledger entries.</Empty>
        ) : (
          <ul className="divide-y rounded-lg border text-xs">
            {ledger.map((e) => (
              <li key={e.id} className="flex justify-between p-3">
                <span>
                  {e.direction} · {e.kind}
                </span>
                <span className="font-mono">{format({ amountMinor: e.amountMinor, currency: e.currency })}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {receipt && (
        <Section title="Payment receipt">
          <Json label="" value={redact(receipt)} />
        </Section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border p-4 text-sm text-muted-foreground">{children}</p>;
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="space-y-2">
      {label && <h2 className="text-sm font-semibold">{label}</h2>}
      <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-4 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
