import { afterEach, describe, expect, it } from "vitest";

import { LogMetrics, metrics, setMetrics, type MetricTags } from "@/lib/metrics";

class Recorder extends LogMetrics {
  readonly counts: Array<{ name: string; value: number; tags: MetricTags }> = [];
  override increment(name: string, value = 1, tags: MetricTags = {}): void {
    this.counts.push({ name, value, tags });
  }
}

describe("metrics sink", () => {
  afterEach(() => setMetrics(new LogMetrics()));

  it("defaults to a usable sink", () => {
    expect(() => metrics().increment("x")).not.toThrow();
    expect(() => metrics().timing("y", 5)).not.toThrow();
  });

  it("can be swapped for a recording adapter", () => {
    const rec = new Recorder();
    setMetrics(rec);
    metrics().increment("jobs.processed", 1, { status: "succeeded" });
    metrics().increment("jobs.processed", 2, { status: "failed" });
    expect(rec.counts).toEqual([
      { name: "jobs.processed", value: 1, tags: { status: "succeeded" } },
      { name: "jobs.processed", value: 2, tags: { status: "failed" } },
    ]);
  });
});
