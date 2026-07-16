/**
 * Seamless infinite marquee: the track is duplicated once and the whole thing
 * slides exactly 50% (one copy's width) via a pure-CSS keyframe, so the loop
 * never stutters and there's no JS animation loop to jank. Pauses on hover and
 * respects prefers-reduced-motion (handled globally in globals.css).
 */
export function Marquee({
  children,
  durationSeconds = 32,
  reverse = false,
  className = "",
}: {
  children: React.ReactNode;
  durationSeconds?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={`pause-on-hover group relative overflow-hidden fade-edges-x ${className}`}>
      <div
        className={`flex w-max items-center gap-12 ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
        style={{ "--marquee-duration": `${durationSeconds}s` } as React.CSSProperties}
      >
        <div className="flex shrink-0 items-center gap-12" aria-hidden={false}>
          {children}
        </div>
        <div className="flex shrink-0 items-center gap-12" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
