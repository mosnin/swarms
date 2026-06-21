import { describe, expect, it } from "vitest";

import { StatsdMetrics } from "@/lib/metrics-statsd";

describe("StatsdMetrics", () => {
  function recorder() {
    const packets: string[] = [];
    const m = new StatsdMetrics({ prefix: "hermes", send: (p) => packets.push(p) });
    return { m, packets };
  }

  it("formats a counter in DogStatsD format with tags", () => {
    const { m, packets } = recorder();
    m.increment("jobs.processed", 1, { status: "succeeded" });
    expect(packets[0]).toBe("hermes.jobs.processed:1|c|#status:succeeded");
  });

  it("formats a timing", () => {
    const { m, packets } = recorder();
    m.timing("job.duration", 1234, { runner: "mock" });
    expect(packets[0]).toBe("hermes.job.duration:1234|ms|#runner:mock");
  });

  it("omits the tag section when there are no tags", () => {
    const { m, packets } = recorder();
    m.increment("x");
    expect(packets[0]).toBe("hermes.x:1|c");
  });
});
