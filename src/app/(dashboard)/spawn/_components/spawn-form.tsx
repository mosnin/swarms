"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

interface SpawnResult {
  jobId: string;
  status: string;
  model: string;
  maxGpuSeconds: number;
  estimatedCostMinor: number;
  currency: string;
  resources: { envKeys: string[]; fileCount: number; mcpServers: string[]; hasContext: boolean };
}

export function SpawnForm() {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [envText, setEnvText] = useState("");
  const [budgetMinor, setBudgetMinor] = useState("120");
  const [result, setResult] = useState<SpawnResult | null>(null);
  const [logs, setLogs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function parseEnv(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return out;
  }

  async function spawn() {
    setBusy(true);
    setError(null);
    setResult(null);
    setLogs(null);
    try {
      const env = parseEnv();
      const res = await fetch("/api/v1/spawn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task,
          resources: {
            context: context || undefined,
            env: Object.keys(env).length ? env : undefined,
          },
          budgetMinor: Number.parseInt(budgetMinor, 10) || undefined,
          idempotencyKey: `spawn-${crypto.randomUUID()}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to spawn agent");
      setResult(body.data);

      // Dev convenience: drive the local worker so the result appears immediately.
      await fetch("/api/internal/jobs/process", { method: "POST" }).catch(() => undefined);
      const logsRes = await fetch(`/api/v1/jobs/${body.data.jobId}/logs`);
      const logsBody = await logsRes.json().catch(() => null);
      if (logsRes.ok) setLogs((logsBody.data.logs ?? []).map((l: { message: string }) => l.message));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to spawn agent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-lg border p-6">
        <label className="block space-y-1">
          <span className="text-sm font-medium">What should the agent do?</span>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            placeholder="e.g. Summarize the attached notes and draft three follow-up tasks."
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Context</span>
          <span className="block text-xs text-muted-foreground">
            What your agent already knows — so the spawned worker isn&apos;t starting blind.
          </span>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Resources (env / secrets)</span>
          <span className="block text-xs text-muted-foreground">
            KEY=value per line. Handed to the worker so it has the same access you do. Encrypted at
            rest, injected only into the sandbox.
          </span>
          <textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            rows={3}
            placeholder={"GITHUB_TOKEN=...\nNOTION_API_KEY=..."}
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">GPU budget (minor units)</span>
          <span className="block text-xs text-muted-foreground">
            A hard ceiling on GPU time. The agent physically cannot spend more.
          </span>
          <input
            value={budgetMinor}
            onChange={(e) => setBudgetMinor(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            className="w-40 rounded-md border px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={spawn} disabled={busy || task.trim().length === 0}>
          {busy ? "Spawning…" : "Spawn agent"}
        </Button>
      </div>

      <div className="space-y-4">
        {!result && (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Spawn an agent and its result + GPU cost will appear here.
          </div>
        )}
        {result && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm font-semibold">Agent spawned</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Run</dt>
                <dd className="font-mono text-xs">{result.jobId}</dd>
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-mono text-xs">{result.model}</dd>
                <dt className="text-muted-foreground">GPU ceiling</dt>
                <dd>{result.maxGpuSeconds}s</dd>
                <dt className="text-muted-foreground">Inherited</dt>
                <dd className="text-xs">
                  {result.resources.envKeys.length} secrets · {result.resources.fileCount} files ·{" "}
                  {result.resources.hasContext ? "context" : "no context"}
                </dd>
              </dl>
            </div>
            {logs && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-sm font-semibold">Live log</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {logs.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                <a href={`/jobs/${result.jobId}`} className="mt-3 inline-block text-xs underline">
                  View full run →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
