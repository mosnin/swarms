# Swarms — Repository Standards

Swarms is a paid **execution layer** for autonomous agents (an *Agent
Capability Cloud*). Read the design docs before changing anything:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — binding technical plan.
- [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — what & why.
- [`docs/SECURITY_MODEL.md`](./docs/SECURITY_MODEL.md) — trust boundaries.
- [`docs/IMPLEMENTATION_SEQUENCE.md`](./docs/IMPLEMENTATION_SEQUENCE.md) — build order.

## Engineering rules (non-negotiable)

- **TypeScript strict mode.** No `any` at module boundaries.
- **Next.js App Router.** The control plane authorizes/validates/persists/enqueues.
- **Server-side authorization on every mutation** via the single `authz` choke point.
- **Postgres is the system of record.** Queue/cache/object-storage are derived.
- **Drizzle ORM** for schema + migrations (no Prisma in this repo).
- **Zod** validates every API boundary and every external response.
- **Queue abstraction** for jobs (`JobQueue` port + adapters).
- **Never execute arbitrary untrusted code inside a Next.js request handler.**
  Use the `SandboxRuntime` port — including in local dev.
- **No hardcoded secrets.** Config is Zod-validated at boot and fails fast.
- **No toy placeholder architecture** unless explicitly marked `// LOCAL DEV ADAPTER`.

## Data & money rules

- Every important entity has `createdAt` and `updatedAt`.
- Every paid action requires an idempotency key; charging is exactly-once.
- Every execution produces an append-only audit trail.
- Money is integer **minor units** + currency code. **Floating point is banned**
  for monetary math.
- Ledger, receipts, audit, and event tables are **append-only**.

## External calls

Every external call has timeouts, bounded retries with exponential backoff, and
maps failures to the typed error taxonomy in `src/lib/errors.ts`.

## Layout

See `ARCHITECTURE.md §2`. Domain modules under `src/modules/*`, shared
primitives under `src/lib/*`, the worker under `src/worker/` (not Next.js).

## Commands

- `npm run dev` — local dev server.
- `npm run build` — production build (must pass).
- `npm run lint` — ESLint (must pass).
- `npm run test` — Vitest unit tests (must pass).
- `npm run test:e2e` — Playwright (when present).
- `npm run format` — Prettier.
