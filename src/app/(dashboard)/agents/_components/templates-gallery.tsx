"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { format } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AGENT_TEMPLATES, type TemplateAccent } from "@/modules/hosted-agents/templates";

const ACCENT: Record<TemplateAccent, string> = {
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  cyan: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
};

/**
 * One-click gallery of curated starting points. Deploying a template posts its
 * preset to the same create endpoint the deploy form uses, then jumps to the
 * new agent.
 */
export function TemplatesGallery() {
  const router = useRouter();
  const [deploying, setDeploying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function deploy(slug: string) {
    const template = AGENT_TEMPLATES.find((t) => t.slug === slug);
    if (!template) return;
    setDeploying(slug);
    setError(null);
    try {
      const res = await fetch("/api/v1/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          instructions: template.instructions,
          wakeIntervalMinutes: template.wakeIntervalMinutes,
          budgetMinorPerWake: template.budgetMinorPerWake,
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          json && typeof json === "object" && "error" in json
            ? String((json as { error: { message?: string } }).error.message ?? "Deploy failed")
            : "Deploy failed";
        throw new Error(message);
      }
      const newId =
        json && typeof json === "object" && "data" in json
          ? (json as { data?: { agent?: { id?: string } } }).data?.agent?.id
          : undefined;
      if (newId) router.push(`/agents/${newId}`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setDeploying(null);
    }
  }

  return (
    <div className="rounded-xl border bg-background shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-medium">Start from a template</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {AGENT_TEMPLATES.length} curated agents, deployed in one click
          </span>
        </span>
        <span className={cn("text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="border-t p-4">
          {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_TEMPLATES.map((t) => (
              <div key={t.slug} className="flex flex-col rounded-lg border p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.name}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", ACCENT[t.accent])}>
                    {t.wakeIntervalMinutes ? `${t.wakeIntervalMinutes}m` : "on message"}
                  </span>
                </div>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{t.tagline}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {format({ amountMinor: t.budgetMinorPerWake, currency: "USD" })} / wake
                  </span>
                  <button
                    type="button"
                    disabled={deploying !== null}
                    onClick={() => void deploy(t.slug)}
                    className="inline-flex h-7 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                  >
                    {deploying === t.slug ? "Deploying…" : "Deploy"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
