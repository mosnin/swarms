# Swarms — Hosted Agents (one-click paid Hermes agent deployment)

> Status: Researched proposal v0.1 — synthesis of a five-lane research pass
> (platform landscape, Hermes economics, billing design, security/reliability,
> codebase gap audit). Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md) and
> [`SECURITY_MODEL.md`](./SECURITY_MODEL.md); nothing here relaxes either.

## 1. The product

**One click → a persistent, paid, securely hosted agent.** The launch
template is the **Nous Research Hermes Agent** (MIT-licensed, ~216k-star OSS
agent runtime): a user picks the template, fills one config form (name,
channels, budget ceiling, optional BYO keys), pays, and gets a always-available
agent with a message endpoint, channel connections, durable memory, spend
metering, and a full audit trail.

This generalizes: "Hermes Agent" is template #1 in an agent-template catalog
(the Railway model — manifest-driven templates, secrets prompted at deploy
time, 15–25% usage rev-share to template authors to seed the catalog).

## 2. The one architectural decision

**Make the agent durable, keep the process disposable.**

Every serious platform independently converged here (Cloudflare Durable
Objects/Agents SDK, AWS Bedrock AgentCore, LangGraph Cloud, Letta, E2B
pause/resume): the *agent identity* is long-lived; the *process* is not.
Substrate limits don't even permit the daemon model (Modal sandboxes cap at
24h; AgentCore recycles at 8h). So:

- A hosted agent is **rows in Postgres**: identity, config, versioned
  encrypted memory/state, checkpoints, message inbox, wallet linkage.
- Execution happens in **bounded sandbox epochs**: launched on a wake event
  (inbound message, cron tick, webhook), rehydrated from Postgres, checkpointed
  after every step, recycled at ≤24h mandatory. Idle agents cost ~nothing.
- Epoch recycling is itself a security control: forced re-image (patching),
  forced attacker eviction, forced secret re-lease.

This is the only shape that preserves our invariants unchanged: Postgres stays
the system of record; sandboxes stay ephemeral and credential-free; every wake
is a discrete, authz-gated, priceable, idempotency-keyed job; the hard budget
ceiling stays structurally enforceable (an agent may occupy `running` only
while covered by an unexpired funded reservation).

## 3. Hermes specifics (unit economics)

- The Hermes Agent **runtime is CPU-only** (1 vCPU / 2–4 GB; models consumed
  via API) and already supports **Modal as a first-class backend** with
  persistent volumes + filesystem snapshots. Hosting cost per active hour is
  cents; idle ~zero with scale-to-zero.
- **Proxy inference; do not self-host GPUs at launch.** Hermes 4 70B via
  OpenRouter→Nebius is $0.13/$0.40 per 1M tokens; best-case self-hosting on
  Modal (2×H100 at $7.90/h) is $0.55–1.10/1M at *full* utilization — 3–7×
  worse, 15–100× worse at realistic early utilization. Revisit only at
  sustained >70% replica utilization (then: Hermes 4.3 36B, Apache-2.0, 1×H100).
- Default brain: Hermes 4 70B. Premium tier: Hermes 4 405B ($1/$3 per 1M).
  Budget fallback: deepseek (already wired). Risk: Hermes 4 has
  **single-provider inference depth (Nebius)** — multi-model fallback is a
  reliability requirement, not a nice-to-have.
- **Do not resell Nous Portal** (undisclosed commercial terms; consumer OAuth
  design). Support BYO-Portal login as an option.
- A moderately active agent (~50M blended tokens/mo) costs ~$8–10/mo in
  inference → healthy margin inside a $29–49/mo plan.

## 4. Billing design (preserves every money rule)

**Rolling reservation + tick capture** — today's job billing tiled through time:

1. `agent.reservation.hold` — 24h window, idempotency key
   `agent:{id}:window:{windowStartHour}`. Debit `wallet:available`, credit
   `wallet:held` for standby + configured active-compute budget. Hold fails ⇒
   agent may not enter/remain `running`. Ceiling checked at hold time.
2. `agent.tick.capture` — hourly, key `agent:{id}:tick:{tickHour}`: standby
   rate + metered actuals (GPU-seconds, tokens) from `wallet:held` →
   `platform:revenue`. Integer minor units; remainder carried as integer
   sub-unit accumulator.
3. `agent.reservation.renew` at T-6h — the dunning runway: auto-reload capture
   or a fresh x402 challenge. Failure ⇒ alert, retry with backoff.
4. Window ends unfunded ⇒ **suspend** (state snapshotted, process stopped),
   72h grace, then terminate-with-export. Top-up auto-resumes (Railway
   pattern). `agent.reservation.release` returns un-captured remainder.

Worst-case monthly spend is knowable at hold time (30 × window amount) — the
"never surprised" guarantee generalizes to always-on. Per-wake execution
continues to use the existing per-job reserve→run→commit path, preserving the
one-charge-per-job DB constraint.

x402 note: the core protocol is strictly per-request settlement — recurring
billing lives in **our ledger**, with x402 as the funding rail per renewal.
Adopt the emerging `upto` (authorize-max/settle-actual) and deferred/batch
schemes when they stabilize; that unlocks agents funding their own renewals.

Packaging: launch with metered wallet billing; layer subscription tiers
(base standby fee + included usage) once metering is proven.

Anti-abuse (freejacking/mining/proxy-exit are industrial-scale problems):
payment before any persistent agent provisions (no free always-on tier);
egress budgets inside the hard ceiling; CPU/egress anomaly detection (exists:
cost anomaly detector); trust-tier ramps on agent count + concurrency;
x402/crypto settlement is chargeback-proof, an advantage here.

## 5. Security architecture (nothing relaxes)

- **Secrets never enter the sandbox.** A control-plane **tokenizing egress
  proxy** injects tenant credentials into outbound requests to approved hosts;
  the epoch holds only a short-TTL (≤15 min) signed token identifying
  (tenant, agent, epoch). Solves scoping, rotation-without-restart,
  exfiltration (leaked placeholder is worthless), and audit in one mechanism.
  Nothing secret exists to be captured in a snapshot.
- **Per-agent deny-by-default egress allowlists** at the network layer (Modal
  natively supports `outbound_domain_allowlist` / `block_network`).
- **Memory hygiene** (OWASP ASI06 memory poisoning is the persistent-agent
  attack): agent memory is **append-only + versioned with provenance** (source
  event, tool, timestamp) in Postgres — poisoning becomes auditable and
  reversible. Write-time filtering + retrieval-time checks. Never let the
  in-sandbox copy be the only copy.
- **Single-writer lease** per agent (Postgres lease row) — exactly one epoch
  runs an agent at a time.
- One sandbox per agent per tenant; per-tenant wake rate limits.
- Isolation substrate: Modal sandboxes (gVisor) acceptable given bounded,
  credential-free epochs; migration path to Firecracker-backed substrate if
  compliance later demands hardware isolation.
- The OpenClaw crisis (21k+ exposed instances, leaked keys, malicious skills
  marketplace) is the cautionary reference: persistence + credentials + weak
  boundaries. Our answers: no ambient credentials, control-plane authz on
  every wake/tool call, no trusted third-party skill code outside sandboxes.
- SOC 2 posture: append-only audit of every wake/tool-call/secret-use/memory
  write (we already have the audit spine); quarterly access reviews of
  credential paths; per-tenant isolation as a documented, test-proven control;
  Modal/OpenRouter as reviewed subprocessors. SLA 99.9% on agent endpoint +
  state durability, upstream model availability carved out with multi-model
  fallback.

## 6. What we already have vs what's new (codebase audit)

Reusable as-is (~80%): job claim/settle/charge loop, runner registry, reapers,
schedules with CAS exactly-once firing, encrypted resource bundles + injection,
artifacts/object store, append-only double-entry ledger with hold→capture,
hard-stop budgets, auto-reload worker, x402 flow, policy engine + approvals,
scoped API keys + agent principals, cost anomaly detection, audit trail.

Genuinely new:

| Piece | Shape |
|---|---|
| `agent_instances` | Composite identity: apiKeyId + state pointer + budget scope + connector grants + channels + status (running/suspended/terminated) |
| `agent_messages` | Append-only per-agent inbox; the missing inbound surface |
| `POST /api/v1/agents/:id/messages` | Authenticated inbound trigger → enqueue wake |
| Event wakes | Extend schedule machinery beyond cron to inbox-driven wakes |
| State write-back | Versioned encrypted state blob written after each wake (CAS on version — no clobber) |
| Recurring biller | Worker-tick reservation/tick/renew loop cloned from the auto-reload FOR-UPDATE pattern |
| Epoch supervisor | Heartbeats in Postgres + watchdog relaunch; single-writer lease |
| Deploy UX | Template manifest → config form → pay → provisioning status → instance page (status, logs, memory browser, pause/delete) |

## 7. Build sequence

- **Phase 1 — spine (MVP):** `agent_instances` + versioned state write-back;
  wake-loop via extended schedules; each wake = normal charged job; API-only
  channel (`/agents/:id/messages` + signed outbound webhooks); Hermes Agent
  image on Modal with volume-backed `~/.hermes`; deploy form + instance page.
- **Phase 2 — always-on billing + hardening:** reservation windows + hourly
  ticks + T-6h renewal + suspend/grace/resume; tokenizing egress proxy;
  per-agent egress allowlists; epoch supervisor + 24h recycle; memory
  provenance.
- **Phase 3 — product surface:** template catalog + author rev-share; Telegram/
  Discord/Slack channels (the Hermes gateway already speaks them); premium
  405B tier; BYO Nous Portal; trust tiers; SOC 2 evidence automation.

## 8. Open questions

1. Hermes Agent release churn (fast-moving upstream, governance noise) — pin
   versions per template release; upstream updates offered as opt-in upgrades
   (Railway-style PR pattern), never auto-applied.
2. `upto`/deferred x402 schemes are not yet stable specs — track, don't build on.
3. Channel credentials (Telegram bot tokens etc.) are long-lived by nature —
   they go through the tokenizing proxy like everything else, but rotation UX
   needs design.
4. Multi-region/latency for chat channels — out of scope for Phase 1.
