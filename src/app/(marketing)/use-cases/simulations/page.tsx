import type { Metadata } from "next";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { Counter } from "@/app/(marketing)/_components/counter";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { RelatedStrip } from "@/app/(marketing)/_components/related-strip";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import {
  BigStatement,
  CodePane,
  Em,
  Pull,
  Scene,
  SceneList,
  StoryHero,
  TitleEm,
} from "@/app/(marketing)/_components/story";
import { CeilingVisual, PersonasVisual } from "@/app/(marketing)/_components/visuals";

export const metadata: Metadata = {
  title: "Market simulation — Swarms",
  description:
    "Test a pricing change against a 32-persona synthetic focus group before it ships — segment by segment, including the objection nobody predicted.",
};

export default function SimulationsUseCasePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="rose"
          eyebrow="Use case · Market simulation"
          title={
            <>
              Meet the backlash
              <br />
              <TitleEm accent="rose">before you ship it.</TitleEm>
            </>
          }
          lede="A pricing change is a bet you usually settle in production. A 32-persona synthetic focus group lets you settle it in a conference room, fourteen minutes before the meeting."
        />
      </div>

      <BigStatement accentWords={["production", "thirty-two", "before"]}>
        Every pricing debate ends the same way — somebody&apos;s gut wins, and the market grades the decision in production. A synthetic focus group flips the order: thirty-two customers react before the change ships, while being wrong still costs nothing.
      </BigStatement>

      {/* The story: one pricing decision, told hour by hour. */}
      <SceneList>
        <Scene
          accent="rose"
          time="2:10 PM"
          title="The debate that had no data."
          visual={
            <CodePane label="one request — a focus group on demand">
              {`POST /api/v1/simulations
{
  "scenario": "Pro moves $19 → $24/mo; annual saves 20%;
    billing becomes per active seat",
  "artifact": "pricing-page-v2.html",
  "personas": 32,
  "segments": ["freelancers", "agencies",
               "startups", "enterprise"],
  "questions": [
    "Stay, downgrade, or churn — and why?",
    "What would make the increase acceptable?"
  ],
  "budgetUsd": 2.50
}`}
            </CodePane>
          }
        >
          <p>
            The pricing review is at three. The thread arguing about it is forty messages deep and
            has produced two opinions and zero evidence. A PM attaches the actual redesigned
            pricing page and <Em>orders a focus group the way you&apos;d order a build</Em>.
          </p>
        </Scene>

        <Scene
          accent="rose"
          time="2:11 PM"
          title="Thirty-two customers walk in."
          flip
          visual={<PersonasVisual accent="rose" />}
        >
          <p>
            Each persona is a worker with a coherent backstory — plan, tenure, team size, price
            sensitivity — <Em>reading the real page, not a summary of it</Em>. Eight per segment,
            all reacting at once.
          </p>
          <p>
            They aren&apos;t asked to be nice. They&apos;re asked whether they&apos;d stay, downgrade, or
            churn — <Em>and to argue for it in their own voice</Em>.
          </p>
        </Scene>

        <Scene
          accent="rose"
          time="2:24 PM"
          title="The objection nobody predicted."
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">verdicts by segment · 32 personas</p>
              <div className="mt-5 space-y-2.5">
                {[
                  { seg: "freelancers", verdict: "6 stay · 2 downgrade — want a trial of the new tier" },
                  { seg: "startups", verdict: "8 stay — “$5 is noise next to the API”" },
                  { seg: "enterprise", verdict: "7 stay · 1 conditions on SSO timeline" },
                  { seg: "agencies", verdict: "5 of 8 balk — at the seat clause, not the price" },
                ].map((r, i) => (
                  <div key={r.seg} className="flex items-start gap-3 border-b border-neutral-100 pb-2.5 last:border-0 last:pb-0">
                    <span className={`w-24 shrink-0 font-mono text-[11px] font-semibold ${i === 3 ? "text-rose-600" : "text-neutral-950"}`}>{r.seg}</span>
                    <span className="text-[13px] text-neutral-600">{r.verdict}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            The merged readout lands segment by segment. Freelancers grumble about $24 but mostly
            stay. Startups shrug. The surprise is the agencies: <Em>they don&apos;t object to the
            price at all — they object to “per active seat”</Em>, because their contractors rotate
            monthly and the clause reads like a variable bill.
          </p>
          <p>
            Nobody in the forty-message thread had raised it once.
          </p>
        </Scene>

        <Scene
          accent="rose"
          time="2:47 PM"
          title="Being wrong twice more, cheaply."
          flip
          visual={<CeilingVisual accent="rose" />}
        >
          <p>
            The PM rewrites the seat clause two ways and <Em>reruns the agencies segment against
            both variants</Em> — each run under the same hard budget ceiling. The quarterly-average
            wording flips the segment to 7 of 8 staying.
          </p>
          <p>
            At three o&apos;clock the meeting reviews reactions instead of trading predictions. The
            price ships at $24 — <Em>with a seat definition that survived contact with the
            market</Em> before the market ever saw it.
          </p>
        </Scene>
      </SceneList>

      <Pull accent="rose" attribution="The uncomfortable math">
        A recruited focus group costs about $6,000, takes three weeks, and seats eight people. This
        one seated thirty-two, reported by segment in 14 minutes, and cost $1.87 — and it caught the
        seat clause before support tickets did.
      </Pull>

      {/* Numbers strip */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-rose-50 via-white to-orange-50 px-6 py-12 sm:px-12">
          <RevealGroup className="grid grid-cols-3 gap-6 text-center" stagger={0.08}>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={32} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">personas, across four segments</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={14} suffix=" min" />
              </p>
              <p className="mt-2 text-sm text-neutral-500">question to segment-level readout</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={1.87} prefix="$" decimals={2} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">total, under a $2.50 hard cap</p>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Beyond the one story */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The same shape, everywhere</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-neutral-950">
            Anywhere you&apos;d rather rehearse than gamble, a simulation wins.
          </h2>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-3" stagger={0.06}>
          {[
            ["Feature reception", "Show the announcement to every segment before the announcement shows itself to Twitter."],
            ["Onboarding walkthroughs", "Thirty-two first-time users narrate exactly where the setup flow loses them."],
            ["Ad and copy testing", "Five headlines against every persona — ranked by segment, with the objections attached."],
            ["Churn interviews", "Personas built from real cancellation reasons stress-test the win-back offer first."],
            ["Support-policy changes", "A new refund policy read by your angriest synthetic customers before your real ones."],
            ["Packaging and naming", "Tier names and bundle lines tested for what buyers assume they include — and don't."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[15px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["swarms", "budgets", "research"]} />
      <CtaBand />
    </main>
  );
}
