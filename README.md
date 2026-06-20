# Hermes Cloud

A paid **execution layer** for autonomous agents — an _Agent Capability Cloud_.
The local Hermes agent calls this platform to rent **skills**, **connectors**,
and sandboxed **agent workers (swarms)**. The platform meters execution,
enforces budgets and policies, stores audit logs, and charges for usage through
**x402**.

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — binding technical plan.
- [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — product definition & scope.
- [`docs/SECURITY_MODEL.md`](./docs/SECURITY_MODEL.md) — trust boundaries & risks.
- [`docs/IMPLEMENTATION_SEQUENCE.md`](./docs/IMPLEMENTATION_SEQUENCE.md) — build order.
- [`CLAUDE.md`](./CLAUDE.md) — repository engineering standards.

## Tech stack

Next.js (App Router) · TypeScript (strict) · Tailwind + shadcn/ui · Zod ·
Drizzle ORM + Postgres · Vitest · Playwright · ESLint · Prettier.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL
npm run dev
```

The app **fails fast** at startup if required environment variables (see
`.env.example`) are missing or malformed.

## Scripts

| Command               | Description                 |
| --------------------- | --------------------------- |
| `npm run dev`         | Start the dev server        |
| `npm run build`       | Production build            |
| `npm run start`       | Run the production server   |
| `npm run lint`        | ESLint                      |
| `npm run format`      | Prettier (write)            |
| `npm run typecheck`   | `tsc --noEmit`              |
| `npm run test`        | Vitest unit tests           |
| `npm run test:e2e`    | Playwright end-to-end tests |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate`  | Apply Drizzle migrations    |

## Health & readiness

- `GET /api/health` — liveness (no dependency checks).
- `GET /api/ready` — readiness (verifies Postgres connectivity; 503 when down).

## Foundation primitives (`src/lib`)

`env` (validated config) · `result` (typed `Result<T,E>`) · `errors` (typed
taxonomy) · `logger` (structured + secret redaction) · `authz` (scope checks) ·
`idempotency` (key validation + request hashing) · `money` (integer minor units
only) · `time` (UTC + testable clock).
