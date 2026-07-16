import Link from "next/link";

import { Reveal } from "@/app/(marketing)/_components/reveal";

export function CtaBand() {
  return (
    <section className="px-6 py-8">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-[32px] bg-neutral-950 px-8 py-16 text-center sm:px-16 sm:py-20">
          {/* ambient glow */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div
              className="animate-aurora absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: "radial-gradient(closest-side, rgb(124 58 237 / 0.3), transparent 72%)",
                willChange: "transform",
              }}
            />
          </div>

          <div className="relative">
            <h2 className="text-balance text-3xl font-medium tracking-tight text-white sm:text-4xl">
              Give your agent a workforce.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-neutral-400">
              Start free. Spawn your first swarm in minutes. Pay only for the GPU-seconds you use.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/login"
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-950 shadow-sm transition-transform active:scale-[0.97]"
              >
                Get started free
              </Link>
              <Link
                href="/pricing"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5 active:scale-[0.97]"
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
