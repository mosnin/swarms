import { describe, expect, it } from "vitest";

import { onboardingState } from "@/modules/dashboard/onboarding";

describe("onboardingState", () => {
  it("marks nothing done and points to funding for a brand-new org", () => {
    const s = onboardingState({ balanceMinor: 0, totalJobs: 0, succeededJobs: 0 });
    expect(s.doneCount).toBe(0);
    expect(s.complete).toBe(false);
    expect(s.nextKey).toBe("fund");
  });

  it("advances the next step as signals arrive", () => {
    expect(onboardingState({ balanceMinor: 5_000, totalJobs: 0, succeededJobs: 0 }).nextKey).toBe("spawn");
    expect(onboardingState({ balanceMinor: 5_000, totalJobs: 3, succeededJobs: 0 }).nextKey).toBe("result");
  });

  it("is complete once a run has succeeded", () => {
    const s = onboardingState({ balanceMinor: 5_000, totalJobs: 3, succeededJobs: 1 });
    expect(s.complete).toBe(true);
    expect(s.doneCount).toBe(3);
    expect(s.nextKey).toBeNull();
  });
});
