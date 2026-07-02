# Swarms agent worker (Modal)

The production compute for spawned worker agents. It runs the OpenAI Agents SDK
loop on DeepSeek (via OpenRouter) inside a Modal sandbox, with the parent
agent's inherited resources wired in as real callable tools. The control plane
(`ModalAgentRuntime`) is its only client.

## What it is

- `agent_worker.py` — a Modal app exposing `POST /run`, faithful to the contract
  in `src/server/agents/modalAgentRuntime.ts`.
- Inherited **files** become `read_file` / `list_files` tools; each inherited
  **MCP server** becomes a real proxy tool. Inherited **secrets** are used only
  as tool auth and are never returned.

## Deploy

1. Install Modal and authenticate:
   ```bash
   pip install modal && modal token new
   ```

2. Create the secret the worker needs. `SWARMS_WORKER_TOKEN` is a shared bearer
   the control plane sends; `OPENROUTER_API_KEY` is the model key.
   ```bash
   modal secret create swarms-agent-worker \
     OPENROUTER_API_KEY=sk-or-... \
     OPENROUTER_BASE_URL=https://openrouter.ai/api/v1 \
     SWARMS_WORKER_TOKEN=$(openssl rand -hex 32)
   ```

3. Deploy and note the URL Modal prints:
   ```bash
   modal deploy infra/modal/agent_worker.py
   # -> https://<org>--swarms-agent-worker-fastapi-app.modal.run
   ```

## Wire the control plane

Set these on the control plane + worker (the same `SWARMS_WORKER_TOKEN` you put
in the Modal secret):

```bash
AGENT_RUNTIME=modal
MODAL_RUN_URL=https://<org>--swarms-agent-worker-fastapi-app.modal.run/run
MODAL_TOKEN=<the SWARMS_WORKER_TOKEN value>
```

## Smoke test

```bash
curl -sS "$MODAL_RUN_URL" \
  -H "authorization: Bearer $MODAL_TOKEN" \
  -H "content-type: application/json" \
  -d '{"jobId":"t","organizationId":"t","task":"Say hello in 3 words.","model":"deepseek/deepseek-chat-v4","maxRuntimeMs":60000,"resources":{}}'
# -> {"output": "...", "gpuSeconds": N, "logs": [...]}
```

A 401 means the bearer token doesn't match; a `TOOL_ERROR` in the body means the
agent loop raised (e.g. a bad OpenRouter key) — the control plane maps both to a
structured job failure, never a crash.
