"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { format } from "@/lib/money";
import { parseDollarsToMinor } from "@/lib/money-input";

/**
 * Front door for the flagship feature: spawn a swarm of worker agents from the
 * UI. POSTs to /api/v1/swarms (async, 202) and jumps to the live detail page so
 * the customer watches the workforce run and finish.
 */
export function SwarmSpawnForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState("");
  const [objective, setObjective] = useState("");
  const [budgetUsd, setBudgetUsd] = useState("");
  const [aggregatorTask, setAggregatorTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const taskList = tasks
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (taskList.length === 0) {
      setError("Add at least one task (one per line).");
      return;
    }
    // Dollars string → integer minor units, integer math only (no floats).
    const budgetMinor = budgetUsd.trim() === "" ? undefined : parseDollarsToMinor(budgetUsd);
    if (budgetMinor === null) {
      setError("Enter the budget in dollars, e.g. 5.00");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/swarms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tasks: taskList,
          objective: objective.trim() || undefined,
          budgetMinor,
          aggregatorTask: aggregatorTask.trim() || undefined,
          idempotencyKey: `ui-swarm-${crypto.randomUUID()}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to spawn swarm");
      // Async: jump to the live detail page to watch it complete.
      router.push(`/swarms/${body.data.swarmRunId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to spawn swarm");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>New swarm</Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">New swarm</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Tasks — one worker per line</span>
        <textarea
          value={tasks}
          onChange={(e) => setTasks(e.target.value)}
          rows={4}
          placeholder={"Research the competitive landscape\nDraft a one-page summary\nList three risks"}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Objective (optional — shared context)</span>
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Budget (USD, hard ceiling)</span>
          <input
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            inputMode="decimal"
            placeholder="5.00"
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
          {budgetUsd.trim() !== "" && parseDollarsToMinor(budgetUsd) !== null && (
            <span className="block text-xs text-muted-foreground">
              = {format({ amountMinor: parseDollarsToMinor(budgetUsd) ?? 0, currency: "USD" })}
            </span>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Aggregator task (optional)</span>
          <input
            value={aggregatorTask}
            onChange={(e) => setAggregatorTask(e.target.value)}
            placeholder="Synthesize the workers' outputs"
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
        </label>
      </div>
      <Button onClick={submit} disabled={busy}>
        {busy ? "Spawning…" : "Spawn swarm"}
      </Button>
    </div>
  );
}
