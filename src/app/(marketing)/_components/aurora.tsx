/**
 * Soft, slow-drifting gradient blooms behind hero/CTA content — the light-mode
 * counterpart to the dark "glow behind a floating panel" look. Purely
 * decorative: absolutely positioned, blurred, low-opacity, non-interactive.
 */
export function Aurora({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`} aria-hidden="true">
      <div className="animate-aurora absolute left-1/2 top-[-10%] h-[36rem] w-[36rem] -translate-x-[60%] rounded-full bg-violet-300/50 blur-[110px]" />
      <div
        className="animate-aurora absolute right-[-10%] top-[10%] h-[30rem] w-[30rem] rounded-full bg-blue-300/40 blur-[110px]"
        style={{ animationDelay: "-6s" }}
      />
      <div
        className="animate-aurora absolute left-[-10%] top-[30%] h-[28rem] w-[28rem] rounded-full bg-emerald-200/40 blur-[110px]"
        style={{ animationDelay: "-11s" }}
      />
    </div>
  );
}
