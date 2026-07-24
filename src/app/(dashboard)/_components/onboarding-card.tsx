import Link from "next/link";

import { cn } from "@/lib/utils";
import type { OnboardingState } from "@/modules/dashboard/onboarding";

/**
 * First-run guide. Three steps to the first result, with the next one lit up.
 * Renders only until onboarding is complete; the parent hides it after that.
 */
export function OnboardingCard({ state }: { state: OnboardingState }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-violet-50/70 via-background to-background dark:from-violet-950/25">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Get your first result in about a minute</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Three steps: fund, spawn, watch it finish. Everything metered, nothing hidden.
          </p>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {state.doneCount} / {state.total} done
        </span>
      </div>

      <ol className="divide-y">
        {state.steps.map((step, i) => {
          const isNext = state.nextKey === step.key;
          return (
            <li key={step.key} className={cn("flex items-center gap-4 px-5 py-4", isNext && "bg-violet-500/[0.04]")}>
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  step.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isNext
                      ? "border-violet-500 text-violet-600 dark:text-violet-300"
                      : "border-border text-muted-foreground",
                )}
              >
                {step.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                  {step.title}
                </p>
                {!step.done && <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>}
              </div>
              {!step.done && (
                <Link
                  href={step.href}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-medium transition-all active:scale-[0.98]",
                    isNext
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border hover:bg-muted",
                  )}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
