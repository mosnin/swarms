import { Marquee } from "@/app/(marketing)/_components/marquee";
import { Reveal } from "@/app/(marketing)/_components/reveal";

/**
 * What Swarms is actually built on / speaks to — not customer logos (we make
 * no claims about who uses this), but the real integration surface: model
 * routing, compute, storage, and the open protocols (MCP, x402) the API
 * itself implements. Rendered as clean wordmarks, not fabricated brand marks.
 */
const STACK = [
  "OpenRouter",
  "Anthropic",
  "DeepSeek",
  "Modal",
  "PostgreSQL",
  "Cloudflare R2",
  "GitHub OAuth",
  "MCP",
  "x402",
];

export function LogoCloud() {
  return (
    <section className="px-6 py-16">
      <Reveal className="mx-auto max-w-5xl">
        <p className="text-center text-sm font-medium tracking-wide text-neutral-400">
          Runs on the infrastructure and open protocols you already trust
        </p>
      </Reveal>
      {/* Two counter-scrolling rows: more texture, same calm. */}
      <div className="mt-8 space-y-5">
        <Marquee durationSeconds={30}>
          {STACK.slice(0, 5).map((name) => (
            <span
              key={name}
              className="shrink-0 select-none whitespace-nowrap font-display text-xl font-medium tracking-tight text-neutral-300 transition-colors hover:text-neutral-500 sm:text-2xl"
            >
              {name}
            </span>
          ))}
        </Marquee>
        <Marquee durationSeconds={38} reverse>
          {STACK.slice(5).map((name) => (
            <span
              key={name}
              className="shrink-0 select-none whitespace-nowrap font-display text-xl font-medium tracking-tight text-neutral-300 transition-colors hover:text-neutral-500 sm:text-2xl"
            >
              {name}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
