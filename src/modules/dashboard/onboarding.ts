/**
 * First-run onboarding state, derived from real account signals. Three steps to
 * the first result — fund, spawn, see it finish — each marked done from actual
 * data (balance, jobs run, jobs succeeded) rather than a stored flag, so the
 * checklist can never drift from reality. Pure and unit-testable.
 */

export interface OnboardingInput {
  balanceMinor: number;
  totalJobs: number;
  succeededJobs: number;
}

export interface OnboardingStep {
  key: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  done: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  complete: boolean;
  doneCount: number;
  total: number;
  /** The first not-yet-done step — what to nudge the user toward next. */
  nextKey: string | null;
}

export function onboardingState(input: OnboardingInput): OnboardingState {
  const steps: OnboardingStep[] = [
    {
      key: "fund",
      title: "Add funds",
      body: "Load a prepaid balance. You only pay for the GPU-seconds a run actually uses.",
      href: "/usage",
      cta: "Add funds",
      done: input.balanceMinor > 0,
    },
    {
      key: "spawn",
      title: "Spawn your first agent",
      body: "Hand a task to a sandboxed worker with a hard budget ceiling it cannot exceed.",
      href: "/spawn",
      cta: "Spawn an agent",
      done: input.totalJobs > 0,
    },
    {
      key: "result",
      title: "Watch it finish",
      body: "See the result and the exact cost, metered to the cent on the ledger.",
      href: "/jobs",
      cta: "View runs",
      done: input.succeededJobs > 0,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return {
    steps,
    complete: doneCount === steps.length,
    doneCount,
    total: steps.length,
    nextKey: next ? next.key : null,
  };
}
