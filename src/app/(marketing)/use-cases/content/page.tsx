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
import { FanOutVisual } from "@/app/(marketing)/_components/visuals";

export const metadata: Metadata = {
  title: "Content pipelines — Swarms",
  description:
    "Draft, edit, fact-check, and localize a launch into eight languages as one pipeline — assembled and consistent before the 11 AM review.",
};

export default function ContentUseCasePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="blue"
          eyebrow="Use case · Content pipelines"
          title={
            <>
              One brief in.
              <br />
              <TitleEm accent="blue">Eleven assets out.</TitleEm>
            </>
          }
          lede="A launch is one message wearing eleven outfits — a post, an email, a changelog, eight translations. Swarms cuts them all from the same fact-checked cloth, at the same time."
        />
      </div>

      <BigStatement accentWords={["copy", "handoffs", "one"]}>
        Every launch asset is a copy of a copy. The email paraphrases the post, the translations paraphrase the email, and by the eighth handoff the product does things it never did. A pipeline has no handoffs — every asset descends from one fact-checked source.
      </BigStatement>

      {/* The story: one launch morning, told hour by hour. */}
      <SceneList>
        <Scene
          accent="blue"
          time="8:12 AM"
          title="The brief lands."
          visual={
            <CodePane label="one request — the whole launch kit">
              {`POST /api/v1/swarms
{
  "objective": "Launch kit for the new audit-log feature",
  "tasks": [
    "Draft the announcement post from the brief",
    "Edit the draft against the style guide",
    "Fact-check every claim against the changelog",
    "Localize the approved copy — de, fr, es, ja,
     pt, it, ko, nl (one worker per language)"
  ],
  "aggregatorTask": "Assemble one launch kit; flag any
    asset that drifts from the source copy",
  "budgetUsd": 3.00
}`}
            </CodePane>
          }
        >
          <p>
            The review is at eleven. A content lead pastes the launch brief and files{" "}
            <Em>one API call instead of eleven briefs to eleven people</Em>. Note the third task:
            one worker exists only to check claims against the changelog — the reviewer that never
            skims.
          </p>
        </Scene>

        <Scene
          accent="blue"
          time="8:14 AM"
          title="Eleven writers, one voice."
          flip
          visual={<FanOutVisual accent="blue" />}
        >
          <p>
            Draft, edit, and fact-check run as a chain. The moment the English copy is approved,{" "}
            <Em>eight localization workers take it simultaneously</Em> — each with the brief, the
            glossary, and the style guide attached. Japanese doesn&apos;t wait for German.
          </p>
          <p>
            The whole run sits under a hard $3.00 ceiling. If any worker wanders, it stops at its
            share of the line — the kit degrades gracefully instead of the bill surprising anyone.
          </p>
        </Scene>

        <Scene
          accent="blue"
          time="8:45 AM"
          title="The kit comes back assembled."
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">launch-kit · 11 assets</p>
              <div className="mt-5 space-y-2.5">
                {[
                  { asset: "announcement post", status: "✓ fact-checked", tone: "text-emerald-600" },
                  { asset: "customer email", status: "✓ consistent", tone: "text-emerald-600" },
                  { asset: "de · fr · es · ja · pt · it · ko · nl", status: "✓ 8 locales", tone: "text-emerald-600" },
                  { asset: "claim: “2× faster exports”", status: "⚑ flagged — not in changelog", tone: "text-blue-600" },
                ].map((r) => (
                  <div key={r.asset} className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-2.5 last:border-0 last:pb-0">
                    <span className="text-[13px] text-neutral-600">{r.asset}</span>
                    <span className={`shrink-0 font-mono text-[11px] font-medium ${r.tone}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            The aggregator merges everything into one kit: post, email, changelog entry, eight
            locales — <Em>every asset built from the same approved English source</Em>, so nothing
            drifted in translation.
          </p>
          <p>
            One flag on top: the draft claimed “2× faster exports,” and the fact-checker couldn&apos;t
            find it in the changelog. The claim is <Em>flagged, not silently shipped</Em>.
          </p>
        </Scene>

        <Scene
          accent="blue"
          time="10:50 AM"
          title="The 11 AM review reviews, instead of writes."
          flip
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">the division of labor</p>
              <div className="mt-5 space-y-3">
                {[
                  { who: "swarm", did: "drafted, edited, fact-checked the source copy", tone: "text-blue-600" },
                  { who: "swarm", did: "localized into 8 languages, in parallel", tone: "text-blue-600" },
                  { who: "you", did: "resolved the flagged claim", tone: "text-neutral-950" },
                  { who: "you", did: "approved the kit before the meeting", tone: "text-neutral-950" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                    <span className={`w-14 font-mono text-[11px] font-semibold ${r.tone}`}>{r.who}</span>
                    <span className="text-[14px] text-neutral-600">{r.did}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            The content lead walks in having done the only part that needed a lead:{" "}
            <Em>killing the unproven claim and sharpening one headline</Em>. The meeting approves a
            finished kit instead of scheduling the work to make one.
          </p>
        </Scene>
      </SceneList>

      <Pull accent="blue" attribution="The uncomfortable math">
        The agency quote for eight locales was $2,400 and ten business days. This pipeline ran 33
        minutes and cost $2.71 — and the fact-checker was the only reviewer who actually read the
        changelog.
      </Pull>

      {/* Numbers strip */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-6 py-12 sm:px-12">
          <RevealGroup className="grid grid-cols-3 gap-6 text-center" stagger={0.08}>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={8} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">languages, localized in one pass</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={33} suffix=" min" />
              </p>
              <p className="mt-2 text-sm text-neutral-500">brief to finished launch kit</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={2.71} prefix="$" decimals={2} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">total, ledgered to the second</p>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Beyond the one story */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The same shape, everywhere</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-neutral-950">
            Anywhere one message needs many faithful versions, a pipeline wins.
          </h2>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-3" stagger={0.06}>
          {[
            ["Weekly newsletters", "Research, draft, edit, and subject-line variants — the same assembly line, every Thursday on a schedule."],
            ["Docs from changelogs", "Every merged release note becomes an updated guide, checked against the actual API surface."],
            ["Social variants", "One announcement cut for five channels — lengths and tones differ, the facts never do."],
            ["SEO refreshes", "A worker per stale page: re-verify claims, update numbers, keep the voice, flag the rewrites."],
            ["Case-study drafts", "Call transcript in; structured draft, pull quotes, and a fact-check against the contract out."],
            ["Style-guide enforcement", "Every outbound asset scored against the guide by an evaluator that never gets tired of it."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[15px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["swarms", "automation", "research"]} />
      <CtaBand />
    </main>
  );
}
