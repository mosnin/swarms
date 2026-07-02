# Hermes Cloud Commercial Grade Build Prompts

## Purpose

This document contains a phased prompt sequence for building **Hermes Cloud** inside a fresh Next.js repository using Claude Code or Claude Cowork.

Hermes Cloud is a paid execution layer for autonomous agents. The local Hermes agent can call this cloud platform to rent skills, connectors, and sandboxed agent workers. The platform meters execution, enforces budgets and policies, stores audit logs, and charges for usage through x402.

## Core Category

**Agent Capability Cloud**

## Core Loop

```text
Intent enters through an API.
The platform resolves the requested capability.
It checks authorization, budget, payment, and policy.
It creates an execution job.
Workers perform the job in isolated sandboxes.
The platform records logs, cost, outputs, and receipts.
Hermes receives structured results.
```

## Architecture Constraint

Next.js should be the **control plane**, not the untrusted execution layer.

Next.js handles:

1. Dashboard
2. API control plane
3. Auth
4. Billing and payment gate
5. Job creation
6. Job viewing
7. Admin interface

Workers handle:

1. Job execution
2. Skill runtime
3. Connector operations
4. Sandboxed task processing
5. Swarm execution

## Commercial Grade Rules

1. Use TypeScript strict mode.
2. Use Next.js App Router.
3. Use server side authorization on every mutation.
4. Use Postgres as the system of record.
5. Use Drizzle ORM unless the repo already has Prisma.
6. Use Zod for runtime validation.
7. Use a queue abstraction for jobs.
8. Do not execute arbitrary untrusted code inside Next.js request handlers.
9. Do not hardcode secrets.
10. Every important entity needs `createdAt` and `updatedAt`.
11. Every paid action needs an idempotency key.
12. Every execution needs an audit trail.
13. Every external call needs structured error handling.
14. Store money as integer minor units only.
15. Treat sandboxing honestly. A local runner is not a secure production sandbox.

## Recommended Build Order

1. **Phase 1:** Foundation and repo standards
2. **Phase 2:** Data model and database
3. **Phase 3:** Auth, API keys, and permissions
4. **Phase 4:** Skill registry
5. **Phase 5:** Job execution API
6. **Phase 6:** Worker runtime
7. **Phase 7:** x402 payment gate
8. **Phase 8:** Budgets, policies, and connector abstraction
9. **Phase 9:** Swarm orchestration
10. **Phase 10:** SDK and dashboard
11. **Phase 11:** Audit logs and observability
12. **Phase 12:** Security hardening
13. **Phase 13:** Production worker separation
14. **Phase 14:** Sandbox adapter design
15. **Phase 15:** Creator marketplace and payouts
16. **Phase 16:** API docs and commercial readiness

---

# Phase 1: Product Constitution and Repo Standards

## Prompt 1

```text
You are building Hermes Cloud in a fresh Next.js repo.

Product definition:
Hermes Cloud is a paid execution layer for autonomous agents. The local Hermes agent can call this cloud platform to rent skills, connectors, and sandboxed agent workers. The platform meters execution, enforces budgets and policies, stores audit logs, and can charge for usage through x402.

Core category:
Agent Capability Cloud.

Core loop:
Intent enters through an API.
The platform resolves the requested capability.
It checks authorization, budget, payment, and policy.
It creates an execution job.
Workers perform the job in isolated sandboxes.
The platform records logs, cost, outputs, and receipts.
Hermes receives structured results.

Commercial grade constraints:
Use TypeScript strict mode.
Use Next.js App Router.
Use server side authorization on every mutation.
Use Postgres as the system of record.
Use Drizzle ORM unless the repo already has Prisma.
Use Zod for runtime validation.
Use a queue abstraction for jobs.
Do not execute arbitrary untrusted code inside Next.js request handlers.
Do not hardcode secrets.
Do not create toy placeholder architecture unless clearly marked as a local development adapter.
Every important entity needs createdAt and updatedAt.
Every paid action needs an idempotency key.
Every execution needs an audit trail.
Every external call needs structured error handling.

First task:
Inspect the repo.
Create or update a technical plan in docs/ARCHITECTURE.md.
Create docs/PRODUCT_SPEC.md.
Create docs/SECURITY_MODEL.md.
Create docs/IMPLEMENTATION_SEQUENCE.md.

Include:
1. System overview
2. Main modules
3. Data model draft
4. API surface draft
5. Execution lifecycle
6. x402 payment lifecycle
7. Skill lifecycle
8. Connector lifecycle
9. Swarm lifecycle
10. Local dev versus production runtime
11. Security risks
12. Commercial grade acceptance criteria

Do not implement product code yet. Only create the documents and repo standards.
```

---

# Phase 2: Foundation and Quality Gates

## Prompt 2

```text
Implement the base project foundation for Hermes Cloud.

Use:
Next.js App Router
TypeScript strict mode
Tailwind
shadcn/ui if not already installed
Zod
Drizzle ORM
Postgres
Vitest for unit tests
Playwright for end to end tests if practical
ESLint
Prettier
A clean environment variable validation layer

Create:
src/lib/env.ts
src/lib/result.ts
src/lib/errors.ts
src/lib/logger.ts
src/lib/authz.ts
src/lib/idempotency.ts
src/lib/time.ts
src/lib/money.ts

Requirements:
1. env.ts validates all required environment variables with Zod
2. result.ts provides typed success and failure helpers
3. errors.ts defines typed application errors
4. logger.ts supports structured logs without leaking secrets
5. authz.ts provides permission checking primitives
6. idempotency.ts defines idempotency key validation helpers
7. money.ts represents money in integer minor units only
8. Add a health endpoint at app/api/health/route.ts
9. Add a readiness endpoint at app/api/ready/route.ts
10. Add tests for env, money, result, and idempotency helpers

Acceptance criteria:
npm run build passes.
npm run lint passes.
npm run test passes.
The app fails fast when required env vars are missing.
No money calculation uses floating point numbers.
```

---

# Phase 3: Database Schema for the Control Plane

## Prompt 3

```text
Build the database schema for Hermes Cloud.

Create Drizzle schema and migrations for these entities:

users
organizations
organization_members
api_keys
wallets
skills
skill_versions
skill_permissions
connectors
connector_accounts
connector_permissions
jobs
job_steps
worker_runs
execution_logs
audit_events
usage_ledger_entries
x402_payment_attempts
x402_payment_receipts
budgets
policy_rules
swarm_templates
swarm_runs
swarm_agents

Design rules:
1. IDs should be stable public IDs, not sequential integers exposed to clients.
2. Every org scoped table must include organizationId.
3. Jobs must support statuses: queued, running, awaiting_payment, awaiting_approval, succeeded, failed, cancelled.
4. Skills must support visibility: private, unlisted, public.
5. Skill versions must be immutable after publish.
6. Connector accounts must never store raw secrets directly unless encrypted.
7. Ledger entries must be append only.
8. Payment attempts and receipts must be linked to jobs where relevant.
9. Audit events must be append only.
10. Store money as integer minor units plus currency.

Create seed data:
1. One demo organization
2. One demo user
3. Three demo skills
4. Two demo connectors
5. One demo budget
6. One demo swarm template

Create a docs/DATA_MODEL.md file explaining relationships.

Acceptance criteria:
Migrations run cleanly.
Seed runs cleanly.
There are tests proving skill versions are immutable at the service layer.
There are tests proving ledger entries are append only at the service layer.
```

---

# Phase 4: Auth, Organizations, API Keys, and Permissions

## Prompt 4

```text
Implement the identity and authorization layer.

This platform needs two access modes:
1. Human dashboard access
2. Agent API access through API keys

Implement:
1. User session abstraction
2. Organization membership roles
3. Role based permissions
4. API key creation
5. API key hashing
6. API key last used timestamp
7. API key scoped permissions
8. Organization scoped access control
9. Server side guards for all mutations

Roles:
owner
admin
developer
operator
viewer
agent

Permissions:
org.read
org.manage
api_keys.manage
skills.read
skills.create
skills.publish
skills.execute
connectors.read
connectors.manage
jobs.read
jobs.create
jobs.cancel
billing.read
billing.manage
policies.manage
audit.read

Create dashboard pages:
app/(dashboard)/dashboard
app/(dashboard)/settings/api-keys
app/(dashboard)/settings/members

Create API endpoints:
POST /api/api-keys
GET /api/api-keys
DELETE /api/api-keys/[id]

Acceptance criteria:
API keys are never stored in plaintext.
Only the key prefix is visible after creation.
Every org scoped query checks organization access.
Every mutation uses server side permission checks.
Tests cover owner, viewer, and agent access.
```

---

# Phase 5: Skill Registry MVP

## Prompt 5

```text
Implement the skill registry.

A skill is a capability package that Hermes can discover and execute.

Skill fields:
name
slug
description
visibility
creatorOrganizationId
defaultPriceMinor
currency
requiredPermissions
riskLevel
tags
status

Skill version fields:
skillId
version
manifestJson
inputSchemaJson
outputSchemaJson
runnerType
runnerConfigJson
checksum
status

Runner types:
mock
http
local_worker

Manifest must include:
name
version
description
inputSchema
outputSchema
permissions
riskLevel
estimatedCostMinor
estimatedDurationMs
maxRuntimeMs
supportsParallelism

Implement:
1. Create skill
2. Create draft version
3. Publish version
4. List public skills
5. List org private skills
6. Read skill detail
7. Validate manifests with Zod
8. Prevent mutation of published versions
9. Skill search by tag and text
10. Pricing display in integer minor units

Create dashboard pages:
app/(dashboard)/skills
app/(dashboard)/skills/new
app/(dashboard)/skills/[skillId]
app/(dashboard)/skills/[skillId]/versions/[versionId]

Create API endpoints:
GET /api/skills
POST /api/skills
GET /api/skills/[id]
POST /api/skills/[id]/versions
POST /api/skills/[id]/versions/[versionId]/publish

Acceptance criteria:
Invalid manifests are rejected.
Published versions cannot be edited.
Private skills are only visible to the owning org.
Public skills are visible to all authenticated orgs.
Tests cover manifest validation and visibility.
```

---

# Phase 6: Job Execution API for Hermes

## Prompt 6

```text
Implement the Hermes agent execution API.

The local Hermes agent should be able to call this platform with an API key and request a skill execution.

Create endpoint:
POST /api/v1/execute

Request body:
organizationId
skillSlug
skillVersion optional
input
idempotencyKey
budgetMinor
currency
callbackUrl optional
metadata optional

Response:
jobId
status
paymentRequired boolean
estimatedCostMinor
currency
executionUrl
createdAt

Rules:
1. Validate API key.
2. Validate organization access.
3. Validate skill exists.
4. Validate skill input against skill input schema.
5. Validate budget.
6. Create a job.
7. Create initial job step.
8. Return structured response.
9. Support idempotency key replay.
10. Do not run the job directly inside the request handler.
11. Enqueue the job through a queue abstraction.

Implement queue abstraction:
src/server/queue/queue.ts
src/server/queue/localQueue.ts
src/server/queue/types.ts

Local queue can process synchronously in development, but the API must be written as if production uses an external worker.

Create endpoints:
GET /api/v1/jobs/[jobId]
GET /api/v1/jobs/[jobId]/logs
POST /api/v1/jobs/[jobId]/cancel

Acceptance criteria:
Repeated requests with the same idempotency key return the same job.
Invalid input schema returns a clear structured error.
Job creation writes audit events.
Job creation writes a usage ledger reservation if budget is reserved.
Tests cover auth, validation, idempotency, and job state.
```

---

# Phase 7: Worker Runtime Abstraction

## Prompt 7

```text
Implement the worker runtime abstraction.

Important:
Do not execute arbitrary untrusted code inside Next.js request handlers.
This implementation should support local development now and production workers later.

Create:
src/server/runners/types.ts
src/server/runners/mockRunner.ts
src/server/runners/httpRunner.ts
src/server/runners/localWorkerRunner.ts
src/server/runners/runnerRegistry.ts
src/server/jobs/processJob.ts
src/server/jobs/stateMachine.ts

Job state machine:
queued to running
running to succeeded
running to failed
running to awaiting_approval
running to cancelled
awaiting_approval to queued
awaiting_payment to queued
any non terminal to cancelled

WorkerRun fields should record:
jobId
skillVersionId
runnerType
startedAt
finishedAt
status
inputJson
outputJson
errorJson
durationMs
costMinor
currency

Execution logs:
timestamp
level
message
metadataJson
stepId optional
workerRunId optional

Implement:
1. Mock runner that returns deterministic demo output
2. HTTP runner that calls an external capability endpoint
3. Local worker runner stub that is safe and disabled unless explicitly enabled
4. Process job service
5. State transitions with validation
6. Execution logs
7. Cost recording
8. Failure handling
9. Retry policy fields, but do not build full retry engine yet

Acceptance criteria:
A demo skill can execute end to end.
Job status updates correctly.
Worker run is recorded.
Execution logs are visible.
Failed runner produces structured failure.
Tests cover valid and invalid state transitions.
```

---

# Phase 8: x402 Payment Gate

## Prompt 8

```text
Implement x402 payment gating for paid capability execution.

Use the official x402 Next.js packages where appropriate:
@x402/next
@x402/evm
@x402/core

Important:
Start with testnet configuration.
Production facilitator, network, and wallet settings must come from validated environment variables.
Never hardcode receiving wallet addresses.

Implement:
1. Payment configuration module
2. x402 protected route for paid execution
3. Payment attempt table writes
4. Payment receipt table writes
5. Payment to job binding
6. Payment to idempotency key binding
7. Replay protection
8. Duplicate payment detection
9. Clear response when payment is required
10. Clear response when payment succeeds
11. Clear response when payment verification fails

Create endpoint:
POST /api/v1/execute-paid

Flow:
1. Hermes calls execute paid.
2. Server validates requested skill and price.
3. If payment is missing or invalid, return x402 payment requirements.
4. If payment is valid, create or resume the job.
5. Bind receipt to job.
6. Enqueue job.
7. Return job response.

Security rules:
1. A payment must be bound to exact skill version.
2. A payment must be bound to organization.
3. A payment must be bound to idempotency key.
4. A payment must be bound to requested price.
5. A payment cannot be reused for a different job.
6. Store enough metadata to audit disputes.
7. Do not include sensitive user data in payment metadata.

Acceptance criteria:
Paid execution cannot run without valid payment.
Same payment cannot execute two different jobs.
Same idempotency key does not double charge.
Tests cover unpaid, invalid payment, valid payment, replay, and duplicate payment scenarios.
```

---

# Phase 9: Budget and Policy Engine

## Prompt 9

```text
Implement budget and policy controls.

This is the safety layer that prevents runaway agents.

Budget types:
organization_monthly
api_key_daily
skill_execution_max
swarm_run_max
connector_daily
user_daily

Policy rule fields:
organizationId
name
description
scope
effect
conditionsJson
priority
enabled

Policy effects:
allow
deny
require_approval

Policy conditions should support:
skillRiskLevel
maxCostMinor
connectorName
operationType
apiKeyId
walletId
timeWindow
swarmSize
requiresExternalWrite
requiresEmailSend
requiresPayment

Implement:
src/server/policy/evaluatePolicy.ts
src/server/budget/checkBudget.ts
src/server/budget/reserveBudget.ts
src/server/budget/commitBudget.ts
src/server/budget/releaseBudget.ts

Execution flow changes:
1. Before creating a job, evaluate policy.
2. Before enqueueing a job, check budget.
3. If approval is required, create job with awaiting_approval.
4. If denied, reject with structured error.
5. If allowed, reserve budget.
6. On success, commit usage.
7. On failure or cancellation, release unused reservation.

Dashboard:
app/(dashboard)/settings/budgets
app/(dashboard)/settings/policies
app/(dashboard)/approvals

Acceptance criteria:
High risk skills can require approval.
Budget overage blocks execution.
Cancelled jobs release reserved budget.
Successful jobs commit usage.
Tests cover allow, deny, approval, reserve, commit, and release.
```

---

# Phase 10: Connector Registry and MCP Compatible Abstraction

## Prompt 10

```text
Implement the connector registry.

Connectors expose external tools to skills and workers. Design the abstraction to be MCP compatible without requiring full MCP server implementation yet.

Connector fields:
name
slug
description
authType
capabilitiesJson
riskLevel
status

Connector account fields:
organizationId
connectorId
displayName
status
encryptedSecretsJson
scopesJson
createdByUserId

Connector tool fields should be represented in capabilitiesJson:
toolName
description
inputSchema
outputSchema
operationType
riskLevel
requiresApproval
externalWrite boolean

Implement:
src/server/connectors/types.ts
src/server/connectors/connectorRegistry.ts
src/server/connectors/mockConnector.ts
src/server/connectors/mcpAdapter.ts
src/server/connectors/permissionCheck.ts

Build mock connectors:
1. web_search_mock
2. crm_mock
3. gmail_draft_mock

Rules:
1. Workers receive only connector capabilities explicitly granted to the job.
2. Connector operations are logged.
3. Destructive or external write operations can require approval.
4. Connector secrets are never sent to the client.
5. MCP adapter should define interfaces for listTools and callTool.
6. Do not implement real Gmail, CRM, or web search yet.

Dashboard:
app/(dashboard)/connectors
app/(dashboard)/connectors/[connectorId]

API:
GET /api/connectors
POST /api/connectors/[id]/accounts
GET /api/connector-accounts
POST /api/v1/connectors/call

Acceptance criteria:
Skill execution can request mock connector access.
Unauthorized connector calls fail.
Connector calls produce audit logs.
External write mock operation can require approval.
Tests cover connector permission checks.
```

---

# Phase 11: Swarm Orchestration MVP

## Prompt 11

```text
Implement swarm orchestration.

A swarm is a group of scoped worker agents executing subtasks in parallel or sequence under one parent objective.

Swarm template fields:
name
description
organizationId
visibility
defaultBudgetMinor
currency
maxAgents
agentRolesJson
mergeStrategy
status

Swarm run fields:
organizationId
templateId
objective
status
budgetMinor
currency
startedAt
finishedAt
resultJson
errorJson

Swarm agent fields:
swarmRunId
role
instructions
skillSlug optional
connectorScopesJson
status
jobId optional
resultJson
errorJson

Implement:
src/server/swarms/createSwarmRun.ts
src/server/swarms/planSwarm.ts
src/server/swarms/executeSwarm.ts
src/server/swarms/mergeSwarmResults.ts

MVP swarm behavior:
1. Accept an objective.
2. Use a deterministic planner, not an LLM yet.
3. Break objective into roles from template.
4. Create child jobs for each role.
5. Execute child jobs through existing job system.
6. Merge outputs into one structured result.
7. Record cost by child job and parent swarm run.
8. Respect maxAgents and budget.
9. Allow parallel execution through Promise based local adapter, but keep queue abstraction ready for production.

Endpoint:
POST /api/v1/swarms/run
GET /api/v1/swarms/[swarmRunId]
GET /api/v1/swarms/[swarmRunId]/logs

Create demo swarm template:
Competitor research swarm
Roles:
researcher
pricing analyst
positioning analyst
synthesis auditor

Acceptance criteria:
A demo swarm run creates child jobs.
Child jobs execute.
Parent swarm aggregates results.
Budget caps are enforced.
Logs show parent and child execution.
Tests cover successful swarm, budget failure, and child job failure.
```

---

# Phase 12: Hermes Agent Client SDK

## Prompt 12

```text
Create a TypeScript client SDK inside the repo so external Hermes agents can call Hermes Cloud cleanly.

Package location:
packages/hermes-cloud-sdk

SDK features:
1. Configure baseUrl and apiKey
2. executeSkill
3. executePaidSkill
4. getJob
5. streamJobLogs placeholder
6. cancelJob
7. runSwarm
8. getSwarmRun
9. typed errors
10. idempotency key generation helper
11. budget helper
12. x402 payment integration placeholder or adapter interface

SDK design:
No browser secrets.
Node first.
Typed request and response schemas with Zod.
Clean error messages.
No leaking API keys in logs.

Also create examples:
examples/node-execute-skill
examples/node-run-swarm
examples/node-paid-execute

Acceptance criteria:
SDK builds independently.
SDK tests pass.
Examples compile.
API types match server schemas.
```

---

# Phase 13: Dashboard UI for Commercial Demo

## Prompt 13

```text
Build the commercial demo dashboard.

Pages:
1. Overview
2. Skills
3. Skill detail
4. New skill
5. Jobs
6. Job detail
7. Swarms
8. Swarm detail
9. Connectors
10. Budgets
11. Policies
12. API keys
13. Audit logs
14. Usage ledger
15. Payments

UI requirements:
1. Clean dark SaaS interface
2. Clear left sidebar navigation
3. Top organization switcher placeholder
4. Status badges
5. Empty states
6. Loading states
7. Error states
8. Tables with search and filters where useful
9. Detail pages with timeline views
10. Copy API key once after creation
11. Never expose secrets after creation
12. Usage metrics on overview

Overview cards:
Total jobs
Successful jobs
Failed jobs
Spend this month
Active skills
Active connectors
Pending approvals
Recent audit events

Job detail should show:
Status
Input
Output
Logs
Worker runs
Ledger entries
Payment receipt if present
Audit timeline

Acceptance criteria:
Dashboard is usable with seed data.
No page crashes on empty data.
All mutations use server side auth.
Build passes.
```

---

# Phase 14: Audit Logs, Observability, and Admin Diagnostics

## Prompt 14

```text
Implement production grade audit and diagnostics.

Audit event structure:
organizationId
actorType
actorId
action
resourceType
resourceId
ipAddress optional
userAgent optional
metadataJson
createdAt

Actor types:
user
api_key
system
worker
payment_facilitator

Actions:
api_key.created
api_key.deleted
skill.created
skill.version_published
job.created
job.started
job.succeeded
job.failed
job.cancelled
payment.required
payment.verified
payment.failed
connector.called
policy.denied
policy.approval_required
budget.reserved
budget.committed
budget.released

Implement:
1. Audit writer service
2. Audit query service
3. Dashboard audit log page
4. Structured request logging middleware where possible
5. Request ID propagation
6. Error boundary pages
7. Admin diagnostics endpoint protected by owner permission
8. Redaction utility for secrets and tokens
9. Tests for redaction

Acceptance criteria:
Every major mutation writes audit events.
Secrets are redacted from logs.
Errors return structured JSON in API routes.
Dashboard can filter audit logs by action and resource.
```

---

# Phase 15: Security Hardening Pass

## Prompt 15

```text
Perform a security hardening pass over the entire Hermes Cloud repo.

Review and implement fixes for:
1. Missing server side authorization
2. Organization access leaks
3. API key plaintext exposure
4. Secret exposure in logs
5. Missing input validation
6. Missing output validation
7. Missing idempotency on paid endpoints
8. Payment replay risk
9. Budget bypass risk
10. Connector permission bypass
11. Skill visibility leaks
12. Unsafe local worker execution
13. Server action exposure
14. Error messages leaking internals
15. Missing rate controls
16. Missing audit events

Add:
1. SECURITY.md
2. docs/THREAT_MODEL.md
3. tests/security/authz.test.ts
4. tests/security/payments.test.ts
5. tests/security/connectors.test.ts
6. tests/security/redaction.test.ts

Threat model must cover:
1. Malicious agent client
2. Malicious skill creator
3. Malicious connector
4. Payment replay
5. Budget draining
6. Prompt injection through connector data
7. Cross organization data leak
8. Worker sandbox escape as future production risk

Acceptance criteria:
Document every risk that is not fully solved.
Mark local runner as development only.
All security tests pass.
No TODO can hide a critical vulnerability without a GitHub issue style note in docs/KNOWN_RISKS.md.
```

---

# Phase 16: Production Queue and Worker Package Boundary

## Prompt 16

```text
Refactor the repo so production execution can run outside the Next.js app.

Create package or app:
apps/worker

The worker should:
1. Read queued jobs
2. Process jobs using existing runner services
3. Write worker runs
4. Write execution logs
5. Update job state
6. Commit or release budget
7. Handle graceful shutdown
8. Support local development mode

Keep the Next.js app as:
1. Dashboard
2. API control plane
3. Auth
4. Billing and payment gate
5. Job creation
6. Job viewing
7. Admin interface

Create:
docs/WORKER_RUNTIME.md
docs/DEPLOYMENT_TOPOLOGY.md

Production topology document:
1. Web app
2. Postgres
3. Queue
4. Worker fleet
5. Object storage
6. Sandbox runtime
7. x402 facilitator
8. Observability provider

Acceptance criteria:
Web app can enqueue a job.
Worker can process a job.
Local development can run web and worker separately.
Worker has no dependency on browser or dashboard code.
Build and tests pass.
```

---

# Phase 17: Real Sandbox Adapter Design

## Prompt 17

```text
Design the real sandbox adapter, but only implement a safe interface and local stub unless the repo already has a secure container runtime available.

Create:
src/server/sandbox/types.ts
src/server/sandbox/sandboxProvider.ts
src/server/sandbox/localStubSandboxProvider.ts
docs/SANDBOX_RUNTIME.md

Sandbox provider interface:
createSandbox
uploadSkillBundle
runCommand
readFile
writeFile
collectArtifacts
terminateSandbox

Security requirements:
1. Network policy per job
2. Filesystem isolation
3. CPU limit
4. Memory limit
5. Runtime timeout
6. No host secret access
7. Connector access through broker only
8. Output size limit
9. Artifact scanning placeholder
10. Full audit trail

Production adapter should be documented for future implementations:
Firecracker style microVM
container worker
remote secure execution provider

The local stub must not claim to be secure. It should be clearly labeled development only.

Acceptance criteria:
The codebase has a clean sandbox abstraction.
No production path uses local stub unless explicitly enabled.
Docs explain what must be true before arbitrary third party skills can run.
```

---

# Phase 18: Creator Marketplace and Payouts Ledger

## Prompt 18

```text
Implement the first version of the skill marketplace economics.

Features:
1. Public skill listing
2. Private skill listing
3. Creator profile placeholder
4. Skill pricing
5. Platform fee configuration
6. Creator revenue ledger
7. Organization usage ledger
8. Payout account placeholder
9. Revenue dashboard for skill creators
10. Admin view of marketplace activity

Ledger rules:
1. Append only
2. Money in integer minor units
3. Every revenue event links to skill version and job
4. Platform fee is recorded separately
5. Creator earning is recorded separately
6. Refund and reversal are separate entries, never destructive edits

Dashboard pages:
app/(dashboard)/marketplace
app/(dashboard)/marketplace/[skillId]
app/(dashboard)/creator/revenue

Acceptance criteria:
Executing a paid public skill creates usage ledger entry.
Platform fee is calculated deterministically.
Creator revenue is recorded.
Ledger entries cannot be mutated.
Tests cover fee calculations and ledger append only behavior.
```

---

# Phase 19: Public API Documentation and OpenAPI Spec

## Prompt 19

```text
Create commercial grade API documentation.

Create:
docs/API.md
docs/HERMES_AGENT_INTEGRATION.md
docs/X402_PAYMENT_INTEGRATION.md
docs/ERRORS.md
docs/WEBHOOKS.md
openapi.json or openapi.yaml

Document:
1. Authentication
2. API keys
3. Skill discovery
4. Skill execution
5. Paid skill execution
6. Job status
7. Job logs
8. Swarm runs
9. Connector calls
10. Budgets
11. Error format
12. Idempotency
13. Rate and budget limits
14. x402 payment flow
15. Webhooks placeholder

Add example requests and responses:
1. Execute free skill
2. Execute paid skill
3. Run swarm
4. Get job logs
5. Cancel job
6. Handle payment required
7. Retry with same idempotency key

Acceptance criteria:
Docs match implemented endpoints.
OpenAPI validates.
Examples are accurate.
SDK examples link to docs.
```

---

# Phase 20: Final Commercial Readiness Pass

## Prompt 20

```text
Do a commercial readiness pass on Hermes Cloud.

Create a final report:
docs/COMMERCIAL_READINESS_REPORT.md

Evaluate:
1. Architecture quality
2. Security posture
3. Payment correctness
4. Budget correctness
5. Worker separation
6. Test coverage
7. Dashboard usability
8. API clarity
9. SDK usability
10. Deployment readiness
11. Known risks
12. Missing features for beta launch

Then fix the highest leverage issues you find.

Beta launch bar:
1. A developer can create an API key.
2. A developer can create or use a skill.
3. Hermes can call executeSkill through SDK.
4. A job is created.
5. A worker processes it.
6. Logs are visible.
7. Usage is recorded.
8. Paid endpoint is gated with x402 testnet.
9. A demo swarm can run.
10. Security docs are honest about current sandbox limitations.

Run:
build
lint
unit tests
integration tests
seed
local demo flow

Acceptance criteria:
Produce a short list of what is beta ready.
Produce a short list of what is not production safe yet.
Fix any broken build or failing tests.
Do not hide failures.
```

---

# MVP That Matters

The first sellable version is not the full marketplace.

The first sellable version is:

```text
Hermes can call a paid cloud skill, pay through x402, spawn a controlled job, receive logs and structured output, and enforce budget plus policy limits.
```

## Minimum Demo Flow

1. Create org.
2. Create API key.
3. Publish demo skill.
4. Hermes SDK calls `/api/v1/execute`.
5. Job is created.
6. Worker processes job.
7. Logs are visible.
8. Usage ledger records cost.
9. Paid skill requires x402 payment.
10. Valid x402 payment unlocks job execution.
11. Demo swarm launches multiple child jobs.
12. Parent swarm merges results.

## Do Not Build First

Avoid these until the core paid execution loop works:

1. Full marketplace discovery
2. Real third party arbitrary skill uploads
3. Real Gmail sending
4. Real CRM writes
5. Real browser automation at scale
6. Arbitrary container execution
7. Complex LLM based swarm planning
8. Enterprise SSO
9. Full payout automation
10. Public developer marketplace

## Technical Moat

The moat is not just x402.

The moat is:

1. Payment to task binding
2. Idempotent paid execution
3. Budget controlled agent labor
4. Permissioned connector access
5. Verifiable execution logs
6. Safe worker isolation
7. Skill version immutability
8. Append only usage ledger
9. Creator revenue ledger
10. Hermes native SDK

## Product Positioning

Use this language:

```text
Hermes Cloud is the paid execution layer for autonomous agents.
```

Or:

```text
Hermes Cloud lets agents rent skills, connectors, and sandboxed worker swarms on demand.
```

Or:

```text
The Agent Capability Cloud for usage based autonomous work.
```

## Developer Pitch

```text
Give your agent temporary access to paid capabilities without managing accounts, API keys, connectors, or infrastructure.
```

## Creator Pitch

```text
Upload a skill once. Get paid every time an agent uses it.
```

## User Pitch

```text
Tell Hermes what you want done. Hermes buys only the tools and workers needed to finish it.
```

## Strategic Path

```text
Skill market → execution cloud → swarm cloud → autonomous company infrastructure
```
