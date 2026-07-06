import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "green" | "orange" | "blue" | "violet" | "slate";

const TONE_BG: Record<Tone, string> = {
  green: "bg-emerald-500",
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  slate: "bg-slate-700",
};

/**
 * Metric card in the reference style: a colored rounded-square icon + label,
 * a large value, and a footer with a comparison and a signed delta.
 */
export function StatTile({
  icon,
  tone = "slate",
  label,
  value,
  footer,
  delta,
  className,
}: {
  icon: React.ReactNode;
  tone?: Tone;
  label: string;
  value: React.ReactNode;
  footer?: React.ReactNode;
  delta?: { value: string; positive?: boolean } | null;
  className?: string;
}) {
  return (
    <Card interactive className={cn("flex h-full flex-col p-4", className)}>
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-sm", TONE_BG[tone])}>
            {icon}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">{label}</span>
        </div>
        <span className="mt-0.5 select-none leading-none tracking-widest text-muted-foreground/40" aria-hidden>
          ⋯
        </span>
      </div>

      <div className="mt-3 text-[26px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>

      {(footer || delta) && (
        <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-xs">
          <span className="text-muted-foreground">{footer}</span>
          {delta && (
            <span className={cn("font-medium", delta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
              {delta.positive ? "↗" : "↘"} {delta.value}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
