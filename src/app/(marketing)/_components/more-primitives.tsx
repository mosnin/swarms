import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

const ITEMS = [
  {
    tag: "cron",
    title: "Schedules",
    body: "Turn any agent, swarm, or simulation into a standing job — a UTC cron expression, fired exactly once per occurrence.",
  },
  {
    tag: "judge",
    title: "Evaluations",
    body: "Score a run's output against a weighted rubric with an LLM judge — a pass/fail gate you can wire into a pipeline.",
  },
  {
    tag: "blob",
    title: "Artifacts",
    body: "Reports, transcripts, and exports land in object storage automatically, content-hashed and retention-bound.",
  },
] as const;

export function MorePrimitives() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <Reveal className="max-w-xl">
        <p className="text-sm font-medium tracking-wide text-violet-600">And the rest of the primitives</p>
        <h2 className="mt-3 text-balance text-2xl font-medium tracking-tight text-neutral-950 sm:text-3xl">
          One execution spine, five ways to use it.
        </h2>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-neutral-100 bg-neutral-100 sm:grid-cols-3">
        {ITEMS.map((item) => (
          <div key={item.title} className="group relative bg-white p-7 transition-colors hover:bg-neutral-50">
            <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-300">{item.tag}</span>
            <h3 className="mt-2 text-lg font-medium tracking-tight text-neutral-900">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.body}</p>
            <span className="absolute inset-x-7 bottom-0 h-px origin-left scale-x-0 bg-violet-400 transition-transform duration-300 group-hover:scale-x-100" />
          </div>
        ))}
      </RevealGroup>
    </section>
  );
}
