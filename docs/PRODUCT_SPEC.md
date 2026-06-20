# Hermes Cloud — Product Specification

> Status: Draft v0.1. Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md),
> [`SECURITY_MODEL.md`](./SECURITY_MODEL.md), and
> [`IMPLEMENTATION_SEQUENCE.md`](./IMPLEMENTATION_SEQUENCE.md).

## 1. Product definition

**Hermes Cloud is a paid execution layer for autonomous agents.** The local
Hermes agent calls this cloud platform to **rent skills, connectors, and
sandboxed agent workers**. The platform:

- **Meters** execution (per-call, per-token, per-resource).
- **Enforces** budgets and policies before cost is incurred.
- **Stores** audit logs and receipts.
- **Charges** for usage through **x402**.

**Core category:** *Agent Capability Cloud.*

In one line: Hermes Cloud is the place an agent goes when it needs a capability
it doesn't have locally, and is willing to pay for it under enforced budgets.

## 2. Who it is for

| Persona             | Need                                                         |
| ------------------- | ------------------------------------------------------------ |
| Local Hermes agent  | Programmatic API to rent capabilities and get typed results. |
| Agent operator/owner| Budgets, policies, audit trail, predictable billing.         |
| Skill/connector author | Publish, version, and price capabilities; get paid.       |
| Platform operator   | Observability, isolation, reconciliation, incident response. |

## 3. Core loop (product view)

1. **Intent enters through an API.** Hermes sends a signed request: *"do X with
   these inputs, within this budget."*
2. **The platform resolves the requested capability** to a concrete, pinned,
   priced version (skill / connector / swarm).
3. **It checks authorization, budget, payment, and policy** — fail-closed.
4. **It creates an execution job** — durable and idempotent.
5. **Workers perform the job in isolated sandboxes.**
6. **The platform records logs, cost, outputs, and receipts.**
7. **Hermes receives structured results** — typed output + cost + receipt id.

## 4. Capabilities offered

### 4.1 Skills
A single, priced, versioned capability with declared input/output schemas.
Callers resolve by slug + semver. See ARCHITECTURE §7.

### 4.2 Connectors
Bindings to external systems, authorized per principal with **secret
references** (never raw secrets). Skills and swarms consume connectors under
least-privilege scopes. See ARCHITECTURE §8.

### 4.3 Swarms (sandboxed agent workers)
Coordinated sets of sandboxed workers executing a topology as one billable
capability, with per-member metering. See ARCHITECTURE §9.

## 5. Metering, budgets, and payment

- **Metering:** every job emits append-only `metering_events` (calls, tokens,
  compute time, connector use). Pricing is declared on the capability version.
- **Budgets:** orgs set budgets (once/daily/monthly, hard or soft). Jobs reserve
  funds (a **hold**) before running and fail closed when a hard budget is hit.
- **Payment via x402:** callers without prepaid balance receive an HTTP `402`
  challenge, pay, and retry with the same idempotency key. Receipts are issued
  for every charge. See ARCHITECTURE §6.

## 6. What Hermes receives back

A structured result envelope:

```jsonc
{
  "data": { /* output validated against the skill's outputSchema */ },
  "job": { "id": "...", "state": "succeeded", "costMinor": 1234,
           "currency": "USD" },
  "receiptId": "...",
  "auditRef": "...",
  "requestId": "..."
}
```

## 7. Explicit non-goals (v1)

- Not a general-purpose IaaS/FaaS — execution is mediated through capabilities.
- No marketplace payouts/settlement to authors in v1 (charge + receipt only).
- No public unauthenticated execution — every call is authenticated.
- No inline/eval execution of caller-supplied code in the control plane, ever.

## 8. Product-level acceptance criteria

The product is "commercial grade" when:

- [ ] An agent can submit an intent and receive a typed result or a typed,
      actionable error — never an unstructured 500.
- [ ] No paid action can double-charge under client retries (idempotent).
- [ ] No job runs without passing authorization, budget, and policy checks.
- [ ] Every charge has a retrievable receipt and a reconciling ledger trail.
- [ ] Every execution has a complete, queryable audit trail.
- [ ] Operators can set budgets/policies that are enforced server-side.
- [ ] Capability authors can publish immutable, versioned, priced capabilities.

(See [`IMPLEMENTATION_SEQUENCE.md`](./IMPLEMENTATION_SEQUENCE.md) for the
engineering acceptance gates.)
