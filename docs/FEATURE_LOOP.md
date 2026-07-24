# /goal — Swarms feature loop (world-class, Jobs lens)

Branch: claude/practical-wozniak-92w5kj (from origin/main). Model: Opus.

## Iron rule (learned the hard way)
COMMIT + PUSH after EVERY lane completes. Never batch uncommitted work — the
container is ephemeral and reclaims wipe the working tree. A lane isn't done
until it's on origin.

## Immediate: rebuild the expansion batch lost to a container reclaim
Each item lands as its own commit the moment it verifies:
- [x] R1 hosted-agent recurring billing (standby ticks, suspend/resume) + worker wiring + tests — d062383
- [x] R2 agent-reply webhooks (agent.replied / agent.wake_failed fan-out) + keyset-paginated GET messages + tests
- [x] R3 admin spend/jobs timeseries API + SVG chart on /admin — metrics module, guarded route, PlatformChart, dense-series tests
- [x] R4b scripts/grant-platform-admin.ts bootstrap (first-admin break-glass)
- [x] R4a richer demo seed (3 hosted agents + thread, 14d of historical jobs, ledger-reconciled spend, 2 budgets, credit, webhook endpoint) + idempotency tests
- [x] R5 service-layer input bounds on createAgentInstance (security) + deny-path tests
- [x] R6 /changelog + /status marketing pages + footer links
- [x] R7 epoch-token primitive (short-TTL HMAC agent token, epoch revocation, constant-time verify, env secret + prod gate) + 9 unit tests
- [x] R8 SDK hosted-agent methods (create/list/get/pause/resume/terminate/sendMessage/listMessages w/ cursor) + schemas + 6 tests
- [x] R9 Playwright marketing smoke suite (7 specs: home/pricing/docs/changelog/status/feature/footer-nav) + config browser-path override — verified green against live server
- [ ] R10 multi-page docs (agents/swarms/billing/webhooks/errors)

## Then: net-new features (Jobs lens — what makes it insanely great)
Pick ONE per loop, ship it whole, commit, move on. Do NOT re-loop a shipped item.
Candidates (refine each cycle by what most raises the product):
- Agent detail: live-streaming wake console (SSE) so you watch it think
- One-click "clone this agent" + shareable agent templates gallery
- Spend guardrails UX: real-time budget burn-down with projected runway
- Approvals: mobile-first inbox with one-tap approve + reason
- "Explain this run" — plain-English trace of what an agent did and why it cost that
- Onboarding: 60-second first-spawn flow that feels like magic

## Cadence
Hourly durable Routine fires this loop. Each fire: read last state, pick the next
unstarted item, build it, verify (typecheck/lint/targeted tests), commit+push,
update this doc, stop. One shippable increment per fire.
