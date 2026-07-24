import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { AgentControls } from "@/app/(dashboard)/agents/_components/agent-controls";
import { AgentThread } from "@/app/(dashboard)/agents/_components/agent-thread";
import { WakeConsole } from "@/app/(dashboard)/agents/_components/wake-console";
import { Card, CardBody } from "@/components/ui/card";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { getAgentInstance } from "@/modules/hosted-agents/agent-service";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  paused: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  suspended: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentInstanceId: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { agentInstanceId } = await params;
  let data;
  try {
    data = await getAgentInstance(ctx, agentInstanceId);
  } catch {
    notFound();
  }
  const { agent, messages, spend } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/agents" className="hover:text-foreground">Hosted agents</Link>
            <span aria-hidden>/</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{agent.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{agent.id} · {agent.model}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[agent.status] ?? "bg-muted text-muted-foreground"}`}>
            {agent.status}
          </span>
          <AgentControls agentInstanceId={agent.id} status={agent.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <AgentThread agentInstanceId={agent.id} status={agent.status} initialMessages={messages} />
          <WakeConsole agentInstanceId={agent.id} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <p className="text-sm font-medium">Spend</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">
                  {format({ amountMinor: spend.totalSpendMinor, currency: spend.currency })}
                </span>
                <span className="text-xs text-muted-foreground">
                  across {spend.wakeCount} wake{spend.wakeCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Every wake is hard-capped at{" "}
                {format({ amountMinor: agent.budgetMinorPerWake, currency: agent.currency })}.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="text-sm font-medium">Configuration</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Per-wake budget</dt>
                  <dd className="tabular-nums">{format({ amountMinor: agent.budgetMinorPerWake, currency: agent.currency })}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Wake mode</dt>
                  <dd>{agent.wakeIntervalMinutes ? `heartbeat · ${agent.wakeIntervalMinutes}m` : "message-driven"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Last wake</dt>
                  <dd>{agent.lastWakeAt ? new Date(agent.lastWakeAt).toLocaleString() : "never"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Memory version</dt>
                  <dd className="tabular-nums">v{agent.stateVersion}</dd>
                </div>
                {agent.lastJobId && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Last run</dt>
                    <dd>
                      <Link href={`/jobs/${agent.lastJobId}`} className="font-mono text-xs hover:underline">
                        {agent.lastJobId.slice(0, 16)}…
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="text-sm font-medium">Standing instructions</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{agent.instructions}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
