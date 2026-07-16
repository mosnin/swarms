"use client";

/**
 * An orbital system: worker nodes circling a core on two counter-rotating
 * rings. Pure SVG driven by two CSS transform-only rotations (own GPU
 * layers), with counter-rotation on each node so the dots stay upright.
 * Keynote energy at compositor prices.
 */

import { ACCENT, type Accent } from "@/app/(marketing)/_lib/site-map";

const RING_COLORS: Record<Accent, string> = {
  violet: "#8b5cf6",
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  cyan: "#06b6d4",
};

function nodesOn(radius: number, count: number, offsetDeg = 0) {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((360 / count) * i + offsetDeg) * (Math.PI / 180);
    return { x: 150 + radius * Math.cos(angle), y: 150 + radius * Math.sin(angle) };
  });
}

export function OrbitVisual({ accent = "violet" as Accent, className = "" }: { accent?: Accent; className?: string }) {
  const color = RING_COLORS[accent];
  const a = ACCENT[accent];
  const outer = nodesOn(118, 5, -18);
  const inner = nodesOn(70, 3, 30);

  return (
    <div className={`relative mx-auto aspect-square w-full max-w-[340px] ${className}`}>
      <svg viewBox="0 0 300 300" className="h-full w-full" aria-hidden>
        <defs>
          <radialGradient id={`orbit-core-${accent}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Static rings */}
        <circle cx="150" cy="150" r="118" fill="none" stroke={color} strokeOpacity="0.16" strokeDasharray="2 6" />
        <circle cx="150" cy="150" r="70" fill="none" stroke={color} strokeOpacity="0.22" strokeDasharray="2 6" />

        {/* Core glow + node */}
        <circle cx="150" cy="150" r="52" fill={`url(#orbit-core-${accent})`} />
      </svg>

      {/* Core chip (HTML so it stays crisp) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`grid h-16 w-16 place-items-center rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_30px_-8px_rgb(0_0_0/0.18)]`}>
          <span className={`font-mono text-[10px] font-semibold ${a.text}`}>you</span>
        </div>
      </div>

      {/* Outer ring — rotates; each node counter-rotates to stay upright. */}
      <div className="animate-spin-slow absolute inset-0" style={{ transformOrigin: "50% 50%" }}>
        {outer.map((n, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${(n.x / 300) * 100}%`, top: `${(n.y / 300) * 100}%` }}
          >
            <div className="animate-spin-slow -translate-x-1/2 -translate-y-1/2" style={{ animationDirection: "reverse" }}>
              <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 shadow-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
                <span className="font-mono text-[9px] text-neutral-500">w{i + 1}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Inner ring — counter-rotates slower. */}
      <div className="animate-spin-slower absolute inset-0" style={{ transformOrigin: "50% 50%" }}>
        {inner.map((n, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${(n.x / 300) * 100}%`, top: `${(n.y / 300) * 100}%` }}
          >
            <div className="animate-spin-slower -translate-x-1/2 -translate-y-1/2" style={{ animationDirection: "normal" }}>
              <span className={`block h-2.5 w-2.5 rounded-full ${a.dot} shadow-sm`} style={{ opacity: 0.75 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
