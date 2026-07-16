"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATES = [
  {
    key: "hermes",
    name: "Hermes agent",
    description: "General-purpose persistent assistant in the Hermes style: remembers context, handles messages, runs on a heartbeat.",
    model: "nousresearch/hermes-4-70b",
    instructions:
      "You are a capable, persistent assistant. Keep replies concise and actionable. Use your memory of prior exchanges to stay consistent.",
  },
  {
    key: "custom",
    name: "Custom",
    description: "Start from a blank persona and write your own standing instructions.",
    model: "",
    instructions: "",
  },
] as const;

/** One-click deploy: template → (optional) tweak → deploy. */
export function DeployAgentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]>(TEMPLATES[0]);
  const [name, setName] = useState("My Hermes agent");
  const [instructions, setInstructions] = useState<string>(TEMPLATES[0].instructions);
  const [model, setModel] = useState<string>(TEMPLATES[0].model);
  const [heartbeat, setHeartbeat] = useState(false);
  const [budgetUsd, setBudgetUsd] = useState("1.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickTemplate(t: (typeof TEMPLATES)[number]) {
    setTemplate(t);
    if (t.key !== "custom") {
      setName(`My ${t.name}`);
      setInstructions(t.instructions);
      setModel(t.model);
    }
  }

  async function deploy() {
    setBusy(true);
    setError(null);
    try {
      const budgetMinorPerWake = Math.round(Number.parseFloat(budgetUsd || "0") * 100);
      const res = await fetch("/api/v1/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          instructions,
          ...(model ? { model } : {}),
          wakeIntervalMinutes: heartbeat ? 60 : null,
          budgetMinorPerWake,
        }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as { error: { message?: string } }).error.message ?? "Deploy failed")
            : "Deploy failed";
        throw new Error(message);
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Deploy an agent
      </button>
    );
  }

  return (
    <div className="rounded-2xl border bg-background p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Deploy an agent</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => pickTemplate(t)}
            className={`rounded-xl border p-3.5 text-left transition-all ${template.key === t.key ? "border-violet-400 bg-violet-500/[0.05] ring-1 ring-violet-400/40" : "hover:border-foreground/20"}`}
          >
            <p className="text-sm font-medium">{t.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-foreground/25"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Model</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="platform default"
            className="mt-1 h-9 w-full rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:border-foreground/25"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-muted-foreground">Standing instructions</span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:border-foreground/25"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Budget per wake (USD)</span>
          <input
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            inputMode="decimal"
            className="mt-1 h-9 w-28 rounded-lg border bg-background px-3 text-sm tabular-nums outline-none focus:border-foreground/25"
          />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={heartbeat}
            onChange={(e) => setHeartbeat(e.target.checked)}
            className="h-4 w-4 rounded border"
          />
          Hourly heartbeat (acts on instructions even without messages)
        </label>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Each wake is a normal metered run: policy-checked, reserved against your balance, and hard-capped
        at the per-wake budget. Pause or terminate anytime.
      </p>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy || !name.trim() || !instructions.trim()}
          onClick={deploy}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Deploying…" : "Deploy agent"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
