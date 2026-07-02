/**
 * Metrics sink abstraction. The platform emits counters/timings through this
 * port; the default adapter writes structured log lines (so metrics are visible
 * in any log pipeline), and a production deployment can swap in a StatsD/OTEL
 * adapter without touching call sites. Tags carry low-cardinality dimensions.
 */

import { logger } from "@/lib/logger";

export type MetricTags = Record<string, string | number | boolean>;

export interface Metrics {
  increment(name: string, value?: number, tags?: MetricTags): void;
  timing(name: string, ms: number, tags?: MetricTags): void;
}

/**
 * Default adapter: emit metrics as structured logs at INFO so they are visible
 * under the default production LOG_LEVEL. (Emitting at debug meant metrics were
 * silently dropped in production, leaving the system unobservable.) A real
 * deployment swaps in a StatsD/OTEL sink via {@link setMetrics}.
 */
export class LogMetrics implements Metrics {
  increment(name: string, value = 1, tags: MetricTags = {}): void {
    logger.info("metric.increment", { metric: name, value, ...tags });
  }
  timing(name: string, ms: number, tags: MetricTags = {}): void {
    logger.info("metric.timing", { metric: name, ms, ...tags });
  }
}

let sink: Metrics = new LogMetrics();

export function metrics(): Metrics {
  return sink;
}

/** Swap the metrics sink (production OTEL/StatsD adapter, or a test recorder). */
export function setMetrics(next: Metrics): void {
  sink = next;
}
