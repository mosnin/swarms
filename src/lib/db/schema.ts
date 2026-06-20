/**
 * Drizzle schema root. Domain tables are added per the implementation sequence
 * (see docs/IMPLEMENTATION_SEQUENCE.md, Phase 1+). Postgres is the system of
 * record; every entity carries `createdAt`/`updatedAt` and tenant scoping.
 *
 * Intentionally empty in Phase 0 — no product tables are defined yet.
 */

export {};
