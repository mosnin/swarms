/**
 * Soft, slow-drifting gradient blooms behind hero/CTA content.
 *
 * Performance note: these are radial-gradient fills, NOT `filter: blur()`
 * layers. A transform animation on a blurred element forces the browser to
 * re-rasterize the blur every frame (four ~500px blur(110px) layers made the
 * whole site visibly lag). A pre-faded radial gradient looks identical here
 * and composites for free; `will-change: transform` keeps each bloom on its
 * own GPU layer.
 */

const bloom = (color: string): React.CSSProperties => ({
  background: `radial-gradient(closest-side, ${color}, transparent 72%)`,
  willChange: "transform",
});

export function Aurora({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`} aria-hidden="true">
      <div
        className="animate-aurora absolute left-1/2 top-[-10%] h-[36rem] w-[36rem] -translate-x-[60%] rounded-full"
        style={bloom("rgb(196 181 253 / 0.5)")}
      />
      <div
        className="animate-aurora absolute right-[-10%] top-[10%] h-[30rem] w-[30rem] rounded-full"
        style={{ ...bloom("rgb(147 197 253 / 0.4)"), animationDelay: "-6s" }}
      />
      <div
        className="animate-aurora absolute left-[-10%] top-[30%] h-[28rem] w-[28rem] rounded-full"
        style={{ ...bloom("rgb(167 243 208 / 0.4)"), animationDelay: "-11s" }}
      />
    </div>
  );
}
