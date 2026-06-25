# Go live — turning Swarms on

What it takes to go from green tests to a working product: an external agent
calls `POST /api/v1/swarms`, real worker agents run on Modal (DeepSeek via
OpenRouter), use the inherited resources, return results, and get charged.

The control plane is done. These are the steps that need real credentials.

## 1. Postgres (system of record)

Provision Postgres and point the app at it, then apply migrations:

```bash
export DATABASE_URL=postgres://USER:PASS@HOST:5432/swarms
npm run db:migrate
```

## 2. Deploy the Modal worker (the compute)

Follow `infra/modal/README.md`:

```bash
modal secret create swarms-agent-worker \
  OPENROUTER_API_KEY=sk-or-... \
  SWARMS_WORKER_TOKEN=$(openssl rand -hex 32)
modal deploy infra/modal/agent_worker.py    # prints the worker URL
```

## 3. Configure the control plane + worker

Set the production env (see `.env.example` for the full list):

```bash
AGENT_RUNTIME=modal
MODAL_RUN_URL=https://<org>--swarms-agent-worker-fastapi-app.modal.run/run
MODAL_TOKEN=<the SWARMS_WORKER_TOKEN from step 2>
CONNECTOR_ENCRYPTION_KEY=$(openssl rand -base64 32)
WEBHOOK_SIGNING_SECRET=$(openssl rand -hex 32)
```

`AGENT_RUNTIME=modal` fails closed if `MODAL_RUN_URL`/`MODAL_TOKEN` are unset, so
a misconfiguration can't silently fall back to the mock.

## 4. Run the control plane and the worker

```bash
npm run build && npm run start          # the Next.js control plane
node apps/worker/index.js               # the queue worker (processes jobs)
```

## 5. Smoke test the real path

Create an API key in the dashboard (Settings → API keys), then spawn a workforce:

```bash
curl -sS https://YOUR_APP/api/v1/swarms \
  -H "authorization: Bearer hk_live_..." \
  -H "content-type: application/json" \
  -d '{
    "tasks": ["Summarize the attached spec", "List three risks"],
    "objective": "Prep the launch review",
    "resources": { "files": { "spec.md": "Launch is in Q4. Scope: ..." } },
    "budgetMinor": 400,
    "idempotencyKey": "live-smoke-0001"
  }'
```

Expect a `swarmRunId` with one succeeded worker per task. Poll
`GET /api/v1/swarms/{swarmRunId}` for results and per-worker cost. The aggregate
charge will be on the org's usage ledger, capped by `budgetMinor`.

## Definition of done

- [ ] `POST /api/v1/swarms` returns a run with N succeeded workers
- [ ] A worker's output reflects an inherited file/MCP tool call (not a guess)
- [ ] The usage ledger shows a charge ≤ `budgetMinor`
- [ ] `AGENT_RUNTIME=modal` with missing Modal config refuses to start the runtime
