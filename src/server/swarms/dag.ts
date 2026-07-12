/**
 * DAG validation + scheduling for step-graph swarms. Pure and deterministic:
 * validates that named steps form a proper DAG (unique names, known
 * dependencies, no cycles) and computes topological "waves" — groups of step
 * indices whose dependencies are all satisfied by earlier waves, so each wave
 * can run in parallel while waves run in order (Kahn's algorithm by levels).
 */

import { Errors } from "@/lib/errors";

export interface DagStep {
  name: string;
  dependsOn?: readonly string[];
}

/** Validate the step graph; throws a typed validation error on any defect. */
export function validateDag(steps: readonly DagStep[]): void {
  if (steps.length === 0) throw Errors.validation("At least one step is required");

  const names = new Set<string>();
  for (const step of steps) {
    if (!step.name || step.name.trim().length === 0) {
      throw Errors.validation("Every step needs a non-empty name");
    }
    if (names.has(step.name)) {
      throw Errors.validation(`Duplicate step name: "${step.name}"`);
    }
    names.add(step.name);
  }
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (dep === step.name) {
        throw Errors.validation(`Step "${step.name}" cannot depend on itself`);
      }
      if (!names.has(dep)) {
        throw Errors.validation(`Step "${step.name}" depends on unknown step "${dep}"`);
      }
    }
  }
  // Cycle check falls out of wave computation: if Kahn's algorithm cannot place
  // every step, a cycle exists.
  const waves = computeWavesUnchecked(steps);
  const placed = waves.reduce((acc, w) => acc + w.length, 0);
  if (placed !== steps.length) {
    const inWaves = new Set(waves.flat());
    const cyclic = steps
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !inWaves.has(i))
      .map(({ s }) => s.name);
    throw Errors.validation(`Step graph contains a cycle involving: ${cyclic.join(", ")}`);
  }
}

/**
 * Topological waves: `waves[k]` holds the indices of steps whose dependencies
 * all resolved in waves `< k`. Assumes a valid DAG (call {@link validateDag}
 * first); on a cyclic graph the unplaced steps are simply omitted.
 */
export function topologicalWaves(steps: readonly DagStep[]): number[][] {
  return computeWavesUnchecked(steps);
}

function computeWavesUnchecked(steps: readonly DagStep[]): number[][] {
  const indexByName = new Map(steps.map((s, i) => [s.name, i]));
  const done = new Set<number>();
  const waves: number[][] = [];

  while (done.size < steps.length) {
    const wave: number[] = [];
    for (let i = 0; i < steps.length; i += 1) {
      if (done.has(i)) continue;
      const deps = steps[i]!.dependsOn ?? [];
      const ready = deps.every((d) => {
        const di = indexByName.get(d);
        return di !== undefined && done.has(di);
      });
      if (ready) wave.push(i);
    }
    if (wave.length === 0) break; // cycle — remaining steps can never run
    for (const i of wave) done.add(i);
    waves.push(wave);
  }
  return waves;
}
