import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { DeployAgentForm } from "@/app/(dashboard)/agents/_components/deploy-agent-form";
import { Card } from "@/components/ui/card";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listAgentInstances } from "@/modules/hosted-agents/agent-service";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  paused: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  suspended: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default async function AgentsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const agents = await listAgentInstances(ctx);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hosted agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Persistent agents that live here and wake on messages or a heartbeat. Every wake is a
            metered, budget-capped run.
          </p>
        </div>
      </div>

      <DeployAgentForm />

      {agents.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No hosted agents yet. Deploy your first one above — it takes one click.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((a) => (
            <Card key={a.id} interactive className="p-4">
              <Link href={`/agents/${a.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.model}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[a.status] ?? "bg-muted text-muted-foreground"}`}>
                    {a.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    {format({ amountMinor: a.budgetMinorPerWake, currency: a.currency })} / wake
                  </span>
                  <span>
                    {a.wakeIntervalMinutes ? `heartbeat ${a.wakeIntervalMinutes}m` : "message-driven"}
                  </span>
                  {a.lastWakeAt && <span>last wake {new Date(a.lastWakeAt).toLocaleString()}</span>}
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
