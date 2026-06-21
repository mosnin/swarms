/**
 * StatsD metrics adapter (production sink). Emits counters/timings as StatsD
 * UDP packets with tags in the DogStatsD format. The transport is injectable so
 * the formatting can be unit-tested without a socket; by default it sends over
 * UDP to `STATSD_HOST:STATSD_PORT`.
 */

import { createSocket } from "node:dgram";

import type { Metrics, MetricTags } from "@/lib/metrics";

export type StatsdSend = (packet: string) => void;

function formatTags(tags: MetricTags): string {
  const entries = Object.entries(tags);
  if (entries.length === 0) return "";
  return "|#" + entries.map(([k, v]) => `${k}:${v}`).join(",");
}

export class StatsdMetrics implements Metrics {
  private readonly send: StatsdSend;

  constructor(opts: { host?: string; port?: number; prefix?: string; send?: StatsdSend } = {}) {
    const prefix = opts.prefix ?? "hermes";
    if (opts.send) {
      this.send = (p) => opts.send!(`${prefix}.${p}`);
    } else {
      const socket = createSocket("udp4");
      const host = opts.host ?? "127.0.0.1";
      const port = opts.port ?? 8125;
      this.send = (p) => {
        const buf = Buffer.from(`${prefix}.${p}`);
        socket.send(buf, 0, buf.length, port, host, () => undefined);
      };
    }
  }

  increment(name: string, value = 1, tags: MetricTags = {}): void {
    this.send(`${name}:${value}|c${formatTags(tags)}`);
  }

  timing(name: string, ms: number, tags: MetricTags = {}): void {
    this.send(`${name}:${ms}|ms${formatTags(tags)}`);
  }
}
