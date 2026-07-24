"use client";

import { useMemo, useState } from "react";

import { format } from "@/lib/money";

export interface ChartDay {
  date: string; // yyyy-mm-dd (UTC)
  jobs: number;
  succeeded: number;
  failed: number;
  spendMinor: number;
}

const W = 720;
const H = 220;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 28;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function shortDate(iso: string): string {
  // iso is yyyy-mm-dd; render "Jul 24" without touching a live clock.
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

/**
 * Dependency-free activity chart: stacked succeeded/failed bars carry job
 * volume, an overlaid violet line carries succeeded spend. One shared x-scale,
 * two y-scales (counts left, money right), hover reveals the exact day.
 */
export function PlatformChart({ days }: { days: ChartDay[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { maxJobs, maxSpend, currency } = useMemo(() => {
    const mj = days.reduce((a, d) => Math.max(a, d.jobs), 0);
    const ms = days.reduce((a, d) => Math.max(a, d.spendMinor), 0);
    return { maxJobs: mj, maxSpend: ms, currency: "USD" };
  }, [days]);

  if (days.length === 0) return null;

  const n = days.length;
  const slot = PLOT_W / n;
  const barW = Math.max(2, Math.min(28, slot * 0.62));

  const ySpend = (v: number) => (maxSpend > 0 ? PAD_T + PLOT_H - (v / maxSpend) * PLOT_H : PAD_T + PLOT_H);
  const xCenter = (i: number) => PAD_L + slot * i + slot / 2;

  const spendPath = days
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xCenter(i).toFixed(1)} ${ySpend(d.spendMinor).toFixed(1)}`)
    .join(" ");

  const totals = days.reduce(
    (a, d) => ({ jobs: a.jobs + d.jobs, succeeded: a.succeeded + d.succeeded, spend: a.spend + d.spendMinor }),
    { jobs: 0, succeeded: 0, spend: 0 },
  );

  const active = hover != null ? days[hover] : null;
  const first = days[0]!;
  const last = days[n - 1]!;
  const mid = n > 2 ? days[Math.floor(n / 2)] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-emerald-500" /> Succeeded
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-red-500" /> Failed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-full bg-violet-500" /> Spend
        </span>
        <span className="ml-auto tabular-nums">
          {totals.jobs.toLocaleString()} jobs · {format({ amountMinor: totals.spend, currency })} spent
        </span>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Daily job activity and spend over the last ${n} days`}
          preserveAspectRatio="none"
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={PAD_T + PLOT_H * f}
              y2={PAD_T + PLOT_H * f}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}

          {days.map((d, i) => {
            const succH = maxJobs > 0 ? (d.succeeded / maxJobs) * PLOT_H : 0;
            const failH = maxJobs > 0 ? (d.failed / maxJobs) * PLOT_H : 0;
            const x = xCenter(i) - barW / 2;
            const baseY = PAD_T + PLOT_H;
            const isOn = hover === i;
            return (
              <g key={d.date} opacity={hover == null || isOn ? 1 : 0.5}>
                {failH > 0 && (
                  <rect x={x} y={baseY - failH} width={barW} height={failH} rx={1.5} className="fill-red-500" />
                )}
                {succH > 0 && (
                  <rect
                    x={x}
                    y={baseY - failH - succH}
                    width={barW}
                    height={succH}
                    rx={1.5}
                    className="fill-emerald-500"
                  />
                )}
              </g>
            );
          })}

          {maxSpend > 0 && (
            <path d={spendPath} fill="none" className="stroke-violet-500" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {maxSpend > 0 &&
            days.map((d, i) => (
              <circle
                key={d.date}
                cx={xCenter(i)}
                cy={ySpend(d.spendMinor)}
                r={hover === i ? 3.5 : 0}
                className="fill-violet-500"
              />
            ))}

          {hover != null && (
            <line
              x1={xCenter(hover)}
              x2={xCenter(hover)}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              className="stroke-foreground/20"
              strokeWidth={1}
            />
          )}

          {/* Invisible full-height hover targets. */}
          {days.map((d, i) => (
            <rect
              key={d.date}
              x={PAD_L + slot * i}
              y={PAD_T}
              width={slot}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border bg-background px-3 py-2 text-xs shadow-md"
            style={{ left: `${(xCenter(hover!) / W) * 100}%` }}
          >
            <p className="font-medium">{shortDate(active.date)}</p>
            <p className="mt-1 flex items-center gap-1.5 tabular-nums text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {active.succeeded.toLocaleString()} succeeded
            </p>
            <p className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {active.failed.toLocaleString()} failed
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 tabular-nums text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> {format({ amountMinor: active.spendMinor, currency })}
            </p>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{shortDate(first.date)}</span>
        {mid && <span>{shortDate(mid.date)}</span>}
        <span>{shortDate(last.date)}</span>
      </div>
    </div>
  );
}
