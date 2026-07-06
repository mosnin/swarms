"""
Swarms agent worker — the compute that runs a spawned worker agent inside a
Modal sandbox.

This is the production counterpart of the control plane's `ModalAgentRuntime`
(src/server/agents/modalAgentRuntime.ts). The control plane POSTs a run spec
here; this service runs the OpenAI Agents SDK loop on a DeepSeek model served
through OpenRouter, with the parent agent's inherited resources wired in as REAL
callable tools (file access + MCP proxying — faithful to the TS resourceToolset),
and returns the result plus metered seconds.

Trust boundary: the worker and every secret-touching tool call run here, in a
Modal container, never in the control plane's process. Inherited secrets
(`resources.env`) are used only as tool auth and are never returned to the model
or the caller.

Deploy:  modal deploy infra/modal/agent_worker.py   (see README.md)
Contract (must match modalAgentRuntime.ts):
  POST <url>/run   Authorization: Bearer $SWARMS_WORKER_TOKEN
  body:  { jobId, organizationId, task, model, maxRuntimeMs, resources }
  200:   { output, gpuSeconds, logs[] }
  4xx/5xx or { error: { code, message } } on failure
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import modal

app = modal.App("swarms-agent-worker")

image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "openai-agents>=0.1.0",
    "openai>=1.40.0",
    "httpx>=0.27.0",
    "fastapi[standard]>=0.115.0",
)

# Secrets are provisioned out-of-band (see README): the OpenRouter key the
# harness uses for the model, and the shared bearer token the control plane
# authenticates with.
secrets = [modal.Secret.from_name("swarms-agent-worker")]


def _build_tools(resources: dict[str, Any]):
    """Turn the inherited resource bundle into real callable function tools.

    Mirrors src/server/agents/resourceToolset.ts: file access plus one proxy
    per inherited MCP server. Secrets are applied only as transport auth.
    """
    import httpx
    from agents import function_tool

    files: dict[str, str] = resources.get("files") or {}
    tools = []

    if files:

        def list_files() -> str:
            return json.dumps({"files": list(files.keys())})

        def read_file(path: str) -> str:
            if path not in files:
                return json.dumps({"error": f"No such file: {path}. Use list_files."})
            return json.dumps({"path": path, "contents": files[path]})

        tools.append(
            function_tool(
                list_files,
                name_override="list_files",
                description_override="List the inherited file paths.",
            )
        )
        tools.append(
            function_tool(
                read_file,
                name_override="read_file",
                description_override="Read an inherited file by its exact path.",
            )
        )

    for server in resources.get("mcpServers") or []:
        name = server.get("name", "server")
        url = server.get("url")
        token = server.get("token")
        slug = "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_") or "server"

        def make_proxy(url: str, token: str | None):
            def proxy(tool: str, arguments: dict | None = None) -> str:
                if not tool:
                    return json.dumps({"error": "Missing 'tool'."})
                headers = {
                    "content-type": "application/json",
                    "accept": "application/json, text/event-stream",
                }
                if token:
                    headers["authorization"] = f"Bearer {token}"
                body = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": tool, "arguments": arguments or {}},
                }
                try:
                    resp = httpx.post(url, json=body, headers=headers, timeout=20.0)
                    if resp.status_code >= 400:
                        return json.dumps({"error": f"MCP server returned {resp.status_code}"})
                    data = resp.json()
                    if data.get("error"):
                        return json.dumps({"error": data["error"].get("message", "MCP error")})
                    return json.dumps(data.get("result", {}).get("content"))
                except Exception as exc:  # noqa: BLE001 — surface as tool error, never crash the loop
                    return json.dumps({"error": f"MCP call failed: {exc}"})

            return proxy

        tools.append(
            function_tool(
                make_proxy(url, token),
                name_override=f"mcp_{slug}",
                description_override=f'Call a tool on the inherited MCP server "{name}".',
            )
        )

    return tools


async def _run_agent(spec: dict[str, Any]) -> dict[str, Any]:
    from agents import (
        Agent,
        OpenAIChatCompletionsModel,
        Runner,
        set_default_openai_api,
        set_default_openai_client,
        set_tracing_disabled,
    )
    from openai import AsyncOpenAI

    resources = spec.get("resources") or {}
    model = spec.get("model") or "deepseek/deepseek-chat-v4"
    task = spec.get("task") or ""

    client = AsyncOpenAI(
        base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    set_default_openai_client(client)
    set_default_openai_api("chat_completions")
    set_tracing_disabled(True)

    tools = _build_tools(resources)
    tool_names = [t.name for t in tools]
    context = resources.get("context")
    system = "\n\n".join(
        part
        for part in [
            "You are a spawned worker agent doing a focused task for a parent agent.",
            f"Context from the parent agent:\n{context}" if context else "",
            (
                f"You can call these inherited tools to get what you need: {', '.join(tool_names)}. "
                "Use them rather than guessing."
            )
            if tool_names
            else "",
            "Do the task and return a concise, structured result.",
        ]
        if part
    )

    start = time.time()
    # Pass an explicit model bound to the OpenRouter client. A bare model string
    # containing "/" (e.g. "deepseek/deepseek-chat-v4") is otherwise parsed by the
    # SDK's multi-provider as a "<provider>/..." prefix → "Unknown prefix: deepseek".
    agent = Agent(
        name="swarm-worker",
        instructions=system,
        model=OpenAIChatCompletionsModel(model=model, openai_client=client),
        tools=tools,
    )
    result = await Runner.run(agent, task, max_turns=8)
    elapsed = time.time() - start

    output = result.final_output
    text = output if isinstance(output, str) else json.dumps(output)
    # Metering parity with the mock/local runtimes: output tokens + wall seconds.
    output_tokens = max(1, len(text) // 4)
    gpu_seconds = max(1, output_tokens // 50 + round(elapsed))
    return {
        "output": output,
        "gpuSeconds": gpu_seconds,
        "logs": [{"level": "info", "message": f"agent completed on {model} via Modal"}],
    }


def _web():
    from typing import Any, Dict

    from fastapi import Body, FastAPI, Header, HTTPException

    web_app = FastAPI()

    @web_app.post("/run")
    async def run(spec: Dict[str, Any] = Body(...), authorization: str = Header(default="")):
        # Take the JSON body as an explicit Body param rather than injecting the
        # raw `Request`: some FastAPI/starlette combinations fail to recognize a
        # bare `request: Request` annotation and mis-treat it as a required query
        # param, 422-ing every call before auth. An explicit body is unambiguous.
        expected = os.environ.get("SWARMS_WORKER_TOKEN", "")
        if not expected or authorization != f"Bearer {expected}":
            raise HTTPException(status_code=401, detail="unauthorized")
        try:
            return await _run_agent(spec)
        except Exception as exc:  # noqa: BLE001 — map to the typed error shape the runtime expects
            return {"output": None, "gpuSeconds": 1, "error": {"code": "TOOL_ERROR", "message": str(exc)}}

    return web_app


@app.function(image=image, secrets=secrets, timeout=900, max_containers=20)
@modal.asgi_app()
def fastapi_app():
    return _web()
