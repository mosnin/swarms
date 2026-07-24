"use client";

import { useMemo, useState } from "react";

import { format } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BurndownSeries } from "@/modules/billing/burndown";

const W = 760;
const H = 240;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const BAR_ZONE = 0.42; // spend bars occupy the bottom fraction of the plot

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

/**
 * Spend burn-down: historical daily spend as bars, and the current balance
 * projected forward at today's burn rate until it hits zero — the visual
 * runway. A "today" divider separates what happened from what's coming.
 */
export function BurndownChart({ series, currency }: { series: BurndownSeries; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
    const totalCols = series.history.length + Math.max(0, series.projection.length - 1);
    const slot = totalCols > 0 ? PLOT_W / totalCols : PLOT_W;
    const barZoneH = PLOT_H * BAR_ZONE;
    const barTop = PAD_T + PLOT_H - barZoneH;

    const maxSpend = series.maxSpendMinor;
    const startBal = series.startBalanceMinor || 1;

    const xHist = (i: number) => PAD_L + slot * i + slot / 2;
    const xProj = (i: number) => PAD_L + slot * (series.history.length - 1 + i);
    const yBal = (v: number) => PAD_T + (1 - v / startBal) * PLOT_H;

    const projPath = series.projection
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xProj(i).toFixed(1)} ${yBal(p.balanceMinor).toFixed(1)}`)
      .join(" ");

    return { slot, barZoneH, barTop, maxSpend, startBal, xHist, xProj, yBal, projPath, todayX: xProj(0) };
  }, [series]);

  const activeDay = hover != null ? series.history[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-blue-500" /> Daily spend
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-full bg-violet-500" /> Projected balance
        </span>
        <span className="ml-auto tabular-nums">
          {series.runwayDays !== null ? (
            <>
              <span className={cn("font-medium", series.runwayDays <= 7 ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                {series.runwayDays}d
              </span>{" "}
              of runway
            </>
          ) : (
            <span className="text-foreground">no burn — runway ∞</span>
          )}
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Spend burn-down and projected runway" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + PLOT_H * f} y2={PAD_T + PLOT_H * f} className="stroke-border" strokeWidth={1} strokeDasharray="2 4" />
          ))}

          {/* Spend bars (history). */}
          {series.history.map((h, i) => {
            const barH = layout.maxSpend > 0 ? (h.spentMinor / layout.maxSpend) * layout.barZoneH : 0;
            const bw = Math.max(2, Math.min(24, layout.slot * 0.6));
            const x = layout.xHist(i) - bw / 2;
            const y = PAD_T + PLOT_H - barH;
            return (
              <g key={h.date} opacity={hover == null || hover === i ? 1 : 0.55}>
                {barH > 0 && <rect x={x} y={y} width={bw} height={barH} rx={1.5} className="fill-blue-500" />}
                <rect
                  x={PAD_L + layout.slot * i}
                  y={PAD_T}
                  width={layout.slot}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h2) => (h2 === i ? null : h2))}
                />
              </g>
            );
          })}

          {/* Today divider. */}
          <line x1={layout.todayX} x2={layout.todayX} y1={PAD_T} y2={PAD_T + PLOT_H} className="stroke-foreground/25" strokeWidth={1} strokeDasharray="3 3" />

          {/* Projected balance line + runway endpoint. */}
          {series.projection.length > 1 && (
            <>
              <path d={layout.projPath} fill="none" className="stroke-violet-500" strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4" />
              <circle
                cx={layout.xProj(series.projection.length - 1)}
                cy={layout.yBal(series.projection[series.projection.length - 1]!.balanceMinor)}
                r={3.5}
                className={cn(series.runwayDays !== null && series.runwayDays <= 7 ? "fill-red-500" : "fill-violet-500")}
              />
            </>
          )}
          <circle cx={layout.todayX} cy={layout.yBal(series.startBalanceMinor)} r={3} className="fill-violet-500" />
        </svg>

        {activeDay && hover != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border bg-background px-3 py-2 text-xs shadow-md"
            style={{ left: `${(layout.xHist(hover) / W) * 100}%` }}
          >
            <p className="font-medium">{shortDate(activeDay.date)}</p>
            <p className="mt-1 tabular-nums text-muted-foreground">
              {format({ amountMinor: activeDay.spentMinor, currency })} spent
            </p>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{series.history[0] ? shortDate(series.history[0].date) : ""}</span>
        <span>today</span>
        <span>
          {series.projection.length > 1
            ? `runway → ${shortDate(series.projection[series.projection.length - 1]!.date)}`
            : ""}
        </span>
      </div>
    </div>
  );
}
