"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { format } from "@/lib/money";
import { parseDollarsToMinor } from "@/lib/money-input";

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
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [mcpText, setMcpText] = useState("");
  /** Dollars string (e.g. "1.20"); converted to integer minor units on submit. */
  const [budgetUsd, setBudgetUsd] = useState("1.20");
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

  /** One MCP server per line: `name url [token]`. */
  function parseMcp(): Array<{ name: string; url: string; token?: string }> {
    const out: Array<{ name: string; url: string; token?: string }> = [];
    for (const line of mcpText.split("\n")) {
      const [name, url, token] = line.trim().split(/\s+/);
      if (name && url) out.push({ name, url, ...(token ? { token } : {}) });
    }
    return out;
  }

  async function spawn() {
    const budgetMinor = budgetUsd.trim() === "" ? undefined : parseDollarsToMinor(budgetUsd);
    if (budgetMinor === null) {
      setError("Enter the GPU budget in dollars, e.g. 1.20");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setLogs(null);
    try {
      const env = parseEnv();
      const mcpServers = parseMcp();
      const files = fileName.trim() && fileContent ? { [fileName.trim()]: fileContent } : undefined;
      const res = await fetch("/api/v1/spawn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task,
          resources: {
            context: context || undefined,
            env: Object.keys(env).length ? env : undefined,
            files,
            mcpServers: mcpServers.length ? mcpServers : undefined,
          },
          budgetMinor,
          idempotencyKey: `spawn-${crypto.randomUUID()}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to spawn agent");
      setResult(body.data);

      // Dev convenience only: drive the local worker so the result appears
      // immediately. In production the standalone worker drains the queue, so
      // the browser must never call the internal endpoint.
      if (process.env.NODE_ENV !== "production") {
        await fetch("/api/internal/jobs/process", { method: "POST" }).catch(() => undefined);
      }
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
            placeholder="e.g. Read spec.md, then use the github MCP server to open a matching issue."
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
          <span className="text-sm font-medium">Files</span>
          <span className="block text-xs text-muted-foreground">
            A file the worker can read with its <code>read_file</code> tool.
          </span>
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="spec.md"
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
          />
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            rows={3}
            placeholder="File contents…"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">MCP servers</span>
          <span className="block text-xs text-muted-foreground">
            One per line: <code>name url [token]</code>. The worker can call each as a real tool.
          </span>
          <textarea
            value={mcpText}
            onChange={(e) => setMcpText(e.target.value)}
            rows={2}
            placeholder={"github https://mcp.example/github tok_..."}
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Resources (env / secrets)</span>
          <span className="block text-xs text-muted-foreground">
            KEY=value per line. Handed to the worker so it has the same access you do. Encrypted at
            rest, decrypted only server-side for this run.
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
          <span className="text-sm font-medium">GPU budget (USD)</span>
          <span className="block text-xs text-muted-foreground">
            A hard ceiling on compute. The agent physically cannot spend more.
          </span>
          <input
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            inputMode="decimal"
            placeholder="1.20"
            className="w-40 rounded-md border px-3 py-2 text-sm"
          />
          {budgetUsd.trim() !== "" && parseDollarsToMinor(budgetUsd) !== null && (
            <span className="block text-xs text-muted-foreground">
              = {format({ amountMinor: parseDollarsToMinor(budgetUsd) ?? 0, currency: "USD" })}
            </span>
          )}
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={spawn} disabled={busy || task.trim().length === 0}>
          {busy ? "Spawning…" : "Spawn agent"}
        </Button>
      </div>

      <div className="space-y-4">
        {!result && (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Spawn an agent and its result + cost will appear here.
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
                <dt className="text-muted-foreground">Compute ceiling</dt>
                <dd>{result.maxGpuSeconds}s</dd>
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="tabular-nums">
                  {format({ amountMinor: result.estimatedCostMinor, currency: result.currency })}
                </dd>
                <dt className="text-muted-foreground">Inherited</dt>
                <dd className="text-xs">
                  {result.resources.envKeys.length} secrets · {result.resources.fileCount} files ·{" "}
                  {result.resources.mcpServers.length} MCP ·{" "}
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
