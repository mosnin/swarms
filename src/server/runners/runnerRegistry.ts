/**
 * Runner registry. Resolves a {@link RunnerType} to its {@link Runner}
 * implementation. New runner kinds are registered here and nowhere else, so the
 * processor depends only on the registry, not on concrete runners.
 */

import { Errors } from "@/lib/errors";
import { AgentRunner } from "@/server/runners/agentRunner";
import { HttpRunner } from "@/server/runners/httpRunner";
import { LocalWorkerRunner } from "@/server/runners/localWorkerRunner";
import { MockRunner } from "@/server/runners/mockRunner";
import type { Runner, RunnerType } from "@/server/runners/types";

const REGISTRY: Record<RunnerType, Runner> = {
  agent: new AgentRunner(),
  mock: new MockRunner(),
  http: new HttpRunner(),
  local_worker: new LocalWorkerRunner(),
};

export function getRunner(type: RunnerType): Runner {
  const runner = REGISTRY[type];
  if (!runner) throw Errors.capabilityNotFound(`No runner registered for type "${type}"`);
  return runner;
}

export function isRunnerType(value: unknown): value is RunnerType {
  return value === "agent" || value === "mock" || value === "http" || value === "local_worker";
}
