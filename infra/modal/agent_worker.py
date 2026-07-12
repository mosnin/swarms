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

The same app also serves `/simulate` (see _run_simulation): a CrewAI crew of
personas running in one sandbox for the simulations feature.

Deploy:  modal deploy infra/modal/agent_worker.py   (see README.md)
Contract (must match modalAgentRuntime.ts):
  POST <url>/run   Authorization: Bearer $SWARMS_WORKER_TOKEN
  body:  { jobId, organizationId, task, model, maxRuntimeMs, resources }
  200:   { output, gpuSeconds, logs[] }
  4xx/5xx or { error: { code, message } } on failure
Simulation contract (must match simulationRuntime.ts):
  POST <url>/simulate   Authorization: Bearer $SWARMS_WORKER_TOKEN
  body:  { simulationRunId, mode, objective, model, agents[], scenario?,
           aggregatorTask?, maxGpuSeconds, maxRuntimeMs, resources }
  200:   { output, transcript?, byPersona[], aggregatorOutput?, gpuSeconds, logs[] }
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
    # CrewAI powers the /simulate endpoint (crew of personas in one sandbox).
    "crewai>=0.80.0",
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


def _crew_llm(model: str):
    """Build a CrewAI LLM bound to OpenRouter (OpenAI-compatible via LiteLLM).

    CrewAI routes models through LiteLLM; the `openrouter/` prefix selects the
    OpenRouter provider, and the key/base come from the inherited env. A bare
    "deepseek/deepseek-chat-v4" is normalized to "openrouter/deepseek/...".
    """
    from crewai import LLM

    normalized = model if model.startswith("openrouter/") else f"openrouter/{model}"
    return LLM(
        model=normalized,
        base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=os.environ["OPENROUTER_API_KEY"],
    )


def _run_simulation(spec: dict[str, Any]) -> dict[str, Any]:
    """Run a crew of personas in ONE sandbox and return the crew result.

    Contract (must match simulationRuntime.ts ModalSimulationRuntime):
      body: { simulationRunId, organizationId, mode, objective, model, agents[],
              scenario?, aggregatorTask?, maxGpuSeconds, maxRuntimeMs, resources }
      200:  { output, transcript, byPersona[], aggregatorOutput?, gpuSeconds, logs[] }
    """
    from crewai import Agent, Crew, Process, Task

    mode = spec.get("mode") or "parallel"
    objective = spec.get("objective") or ""
    default_model = spec.get("model") or "deepseek/deepseek-chat-v4"
    personas = spec.get("agents") or []
    scenario = spec.get("scenario") or {}
    aggregator_task = spec.get("aggregatorTask")
    resources = spec.get("resources") or {}
    context = resources.get("context")

    if not personas:
        return {"output": None, "gpuSeconds": 1, "error": {"code": "INVALID_CONFIG", "message": "no personas"}}

    # collaborative → hierarchical/sequential collaboration; parallel → independent tasks.
    proc_name = (scenario.get("process") if mode == "collaborative" else "sequential") or "sequential"
    process = Process.hierarchical if proc_name == "hierarchical" else Process.sequential
    collaborative = mode == "collaborative"

    start = time.time()
    agents = []
    tasks = []
    for p in personas:
        name = p.get("name") or "Persona"
        role = p.get("role") or name
        p_objective = p.get("objective") or objective or "Contribute to the objective."
        attrs = p.get("attributes") or {}
        backstory_parts = [f"You are {name}."]
        if role:
            backstory_parts.append(f"Role: {role}.")
        if attrs:
            backstory_parts.append(f"Attributes: {json.dumps(attrs)}.")
        if context:
            backstory_parts.append(f"Shared context: {context}")

        agent = Agent(
            role=role,
            goal=p_objective,
            backstory=" ".join(backstory_parts),
            llm=_crew_llm(p.get("model") or default_model),
            allow_delegation=collaborative,
            verbose=False,
        )
        agents.append((name, role, agent))

        # parallel: each persona runs its own task; collaborative: each reacts to
        # the objective and may delegate to peers.
        task_desc = p.get("task") or objective or p_objective
        if collaborative:
            task_desc = (
                f"{objective}\n\nAs {name} ({role}), engage with the other personas, voice your perspective, "
                f"and work toward: {p_objective}"
            )
        tasks.append(
            Task(
                description=task_desc,
                expected_output="A concise, structured response reflecting this persona's perspective.",
                agent=agent,
            )
        )

    crew_kwargs: dict[str, Any] = {"agents": [a for _, _, a in agents], "tasks": tasks, "process": process, "verbose": False}
    if process == Process.hierarchical:
        crew_kwargs["manager_llm"] = _crew_llm(scenario.get("managerModel") or default_model)

    crew = Crew(**crew_kwargs)
    result = crew.kickoff()
    elapsed = time.time() - start

    # Per-persona outputs from each task's result.
    by_persona = []
    task_outputs = getattr(result, "tasks_output", None) or []
    for i, (name, role, _agent) in enumerate(agents):
        out = None
        if i < len(task_outputs):
            to = task_outputs[i]
            out = getattr(to, "raw", None) or str(to)
        by_persona.append({"personaName": name, "role": role, "status": "succeeded", "output": out})

    final = getattr(result, "raw", None) or str(result)
    aggregator_output = None
    if aggregator_task:
        # A lightweight synthesis pass over the crew's final output.
        synth_agent = Agent(
            role="Synthesizer",
            goal="Synthesize the crew's outputs.",
            backstory="You merge multiple persona outputs into one coherent result.",
            llm=_crew_llm(default_model),
            verbose=False,
        )
        synth_task = Task(
            description=f"{aggregator_task}\n\nCrew output:\n{final}",
            expected_output="A single synthesized result.",
            agent=synth_agent,
        )
        synth_crew = Crew(agents=[synth_agent], tasks=[synth_task], process=Process.sequential, verbose=False)
        aggregator_output = str(synth_crew.kickoff())

    transcript = None
    if collaborative:
        transcript = [
            {"persona": bp["personaName"], "message": bp["output"]} for bp in by_persona if bp.get("output")
        ]

    # Metering parity with the agent path: bound by wall seconds; the control
    # plane clamps to maxGpuSeconds so the charge never exceeds the reservation.
    text = final if isinstance(final, str) else json.dumps(final)
    output_tokens = max(1, len(text) // 4)
    gpu_seconds = max(1, output_tokens // 50 + round(elapsed))

    return {
        "output": {"mode": mode, "findings": final},
        "transcript": transcript,
        "byPersona": by_persona,
        "aggregatorOutput": aggregator_output,
        "gpuSeconds": gpu_seconds,
        "logs": [{"level": "info", "message": f"simulation completed: {len(personas)} personas, {mode}"}],
    }


def _web():
    from typing import Any, Dict

    from fastapi import Body, FastAPI, Header, HTTPException

    web_app = FastAPI()

    def _authorized(authorization: str) -> bool:
        expected = os.environ.get("SWARMS_WORKER_TOKEN", "")
        return bool(expected) and authorization == f"Bearer {expected}"

    @web_app.post("/run")
    async def run(spec: Dict[str, Any] = Body(...), authorization: str = Header(default="")):
        # Take the JSON body as an explicit Body param rather than injecting the
        # raw `Request`: some FastAPI/starlette combinations fail to recognize a
        # bare `request: Request` annotation and mis-treat it as a required query
        # param, 422-ing every call before auth. An explicit body is unambiguous.
        if not _authorized(authorization):
            raise HTTPException(status_code=401, detail="unauthorized")
        try:
            return await _run_agent(spec)
        except Exception as exc:  # noqa: BLE001 — map to the typed error shape the runtime expects
            return {"output": None, "gpuSeconds": 1, "error": {"code": "TOOL_ERROR", "message": str(exc)}}

    @web_app.post("/simulate")
    def simulate(spec: Dict[str, Any] = Body(...), authorization: str = Header(default="")):
        if not _authorized(authorization):
            raise HTTPException(status_code=401, detail="unauthorized")
        try:
            return _run_simulation(spec)
        except Exception as exc:  # noqa: BLE001 — typed error shape the runtime expects
            return {"output": None, "gpuSeconds": 1, "error": {"code": "SIMULATION_ERROR", "message": str(exc)}}

    return web_app


@app.function(image=image, secrets=secrets, timeout=900, max_containers=20)
@modal.asgi_app()
def fastapi_app():
    return _web()
