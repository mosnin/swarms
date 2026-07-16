import { Counter } from "@/app/(marketing)/_components/counter";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

const STATS: { value: number; prefix?: string; suffix?: string; decimals?: number; label: string }[] = [
  { value: 16, label: "workers fanned out per swarm — parallel, sequential, or a DAG" },
  { value: 32, suffix: "", label: "personas per simulation, one CrewAI crew in a single sandbox" },
  { value: 0.02, prefix: "$", decimals: 2, label: "default price per GPU-second — you set the ceiling" },
  { value: 100, suffix: "%", label: "of runs metered, audited, and reconciled to the cent" },
];

export function MetricsBand() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-50 via-white to-blue-50 px-8 py-14 sm:px-14">
        <Reveal className="mx-auto max-w-lg text-center">
          <h2 className="text-balance text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">
            Infrastructure numbers, not marketing numbers.
          </h2>
        </Reveal>

        <RevealGroup
          className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4"
          stagger={0.1}
        >
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={s.value} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals} />
              </div>
              <p className="mx-auto mt-3 max-w-[14rem] text-sm leading-snug text-neutral-500">{s.label}</p>
            </div>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
