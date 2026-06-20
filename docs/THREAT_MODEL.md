# Threat Model

Scope: the Hermes Cloud control plane (Next.js), the worker, Postgres, the x402
payment path, connectors, and the (future) sandbox. Below, each actor/threat
lists the mitigation and its status, with evidence.

## 1. Malicious agent client (holds a valid API key)

- **Cross-org access** → `requireOrganization` on every org-scoped read/mutation;
  org id from the body is verified, never trusted. Evidence:
  `access-control.ts`, `tests/security/authz.test.ts`,
  `tests/security/org-isolation.test.ts`. **Mitigated.**
- **Privilege escalation via API key scopes** → `assertScopesGrantable` (key
  scopes ⊆ creator's). Evidence: `authz.test.ts`. **Mitigated.**
- **Budget draining** → hard-stop budget check before enqueue; reservations
  count against limits. Evidence: `checkBudget.ts`, `budgetMath.ts`,
  `tests/security/policy-budget.test.ts`. **Mitigated** (per-key/day budget types
  are modeled but org/period enforcement is the active path — see KNOWN_RISKS).
- **Endpoint abuse / DoS** → ❌ no rate limiting yet. **Open (KNOWN_RISKS).**

## 2. Malicious skill creator

- **Mutating a paid, published version** → published versions are immutable
  (content frozen; only lifecycle advances). Evidence: `skill-version-service.ts`,
  `skill-version-service.test.ts`. **Mitigated.**
- **Cross-org discovery of private skills** → visibility rules; private hidden
  from other orgs. Evidence: `visibility.ts`, `org-isolation.test.ts`.
  **Mitigated.**
- **Shipping malicious executable code** → not currently possible: only
  first-party `mock`/`http` runners execute; no untrusted code path. A real
  sandbox + creator review are required before this changes.
  Evidence: `docs/SANDBOX_RUNTIME.md`. **Mitigated by absence; blocks marketplace.**

## 3. Malicious connector / connector data (prompt injection)

- **Calling un-granted tools** → least-privilege check on every call. Evidence:
  `permissionCheck.ts`, `tests/security/connectors.test.ts`. **Mitigated.**
- **Unapproved external writes** → external-write/destructive tools require
  approval. Evidence: `connectors.test.ts`. **Mitigated.**
- **Prompt injection via tool output** → connector output is treated as
  untrusted data, never as policy. Policy/permission decisions are made
  server-side from the principal + rules, not from tool/connector text; external
  data cannot grant itself permissions. **Mitigated by design** (no LLM planner
  consumes tool output to make auth decisions today).
- **Secret exfiltration** → connector secrets are stored by reference/encrypted
  and never returned to clients or mounted into the (future) sandbox; access is
  brokered. **Mitigated** (broker is design-level until a real sandbox exists).

## 4. Payment replay / abuse

- **Reusing one payment for many jobs** → unique `(org, txRef)`; settlement ref
  funds one binding. **Mitigated.** Evidence: `payment-service.ts`,
  `tests/security/payments.test.ts`.
- **Double charge on retry** → idempotent settle returns the same receipt.
  **Mitigated.**
- **Forged "payment verified"** → the server verifies via the provider; client
  cannot assert verification. Real on-chain verification requires the gated real
  adapter (currently mock/testnet). **Mitigated for testnet; mainnet gated.**

## 5. Cross-organization data leak

- Tenant guards + visibility rules + per-org queries throughout. Evidence:
  `org-isolation.test.ts`, `authz.test.ts`. **Mitigated.**

## 6. Worker / sandbox escape (future risk)

- Today no untrusted code runs, so there is no escape surface. When a real
  sandbox is added, escape is the primary risk; requirements (network deny-all,
  no host secrets, limits, broker-only connectors) are specified in
  `docs/SANDBOX_RUNTIME.md`. **Open until a real sandbox exists; marketplace
  blocked.**

## 7. Secret exposure in logs/audit

- Redaction utility masks sensitive keys and secret-shaped values. Evidence:
  `redaction.ts`, `tests/security/redaction.test.ts`. **Mitigated.**

## Residual risks

Tracked in [`KNOWN_RISKS.md`](./KNOWN_RISKS.md): rate limiting, multi-worker
claiming, real sandbox, mainnet hardening, automated backups, abuse handling.
