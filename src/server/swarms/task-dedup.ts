/**
 * Lightweight duplicate-task detection for swarm spawning.
 *
 * Exact duplicates (after normalizing whitespace and casing) are flagged
 * immediately. Near-duplicates are detected via simple token overlap — two
 * tasks sharing > NEAR_DUP_THRESHOLD of their token set are considered
 * near-duplicates. This catches copy-paste errors and rephrased repeats
 * without requiring an embedding model.
 *
 * The functions here are pure (no I/O) so they can be called before any DB
 * writes and cheaply tested.
 */

export interface DuplicateWarning {
  kind: "exact" | "near";
  indexA: number;
  indexB: number;
  taskA: string;
  taskB: string;
  /** 1.0 for exact duplicates; Jaccard similarity for near-duplicates. */
  similarity: number;
}

const NEAR_DUP_THRESHOLD = 0.8;

function normalize(task: string): string {
  return task.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(s: string): Set<string> {
  // Split on whitespace and punctuation, drop short tokens (≤2 chars) to
  // reduce noise from articles/prepositions.
  return new Set(s.split(/[\s,.:;!?()[\]{}'"]+/).filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Detect duplicate or near-duplicate tasks in a list.
 * Returns warnings sorted by similarity descending.
 */
export function detectDuplicateTasks(tasks: string[]): DuplicateWarning[] {
  const warnings: DuplicateWarning[] = [];
  const normalized = tasks.map(normalize);
  const tokenSets = normalized.map(tokenize);

  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      if (normalized[i] === normalized[j]) {
        warnings.push({
          kind: "exact",
          indexA: i,
          indexB: j,
          taskA: tasks[i]!,
          taskB: tasks[j]!,
          similarity: 1,
        });
      } else {
        const sim = jaccard(tokenSets[i]!, tokenSets[j]!);
        if (sim >= NEAR_DUP_THRESHOLD) {
          warnings.push({
            kind: "near",
            indexA: i,
            indexB: j,
            taskA: tasks[i]!,
            taskB: tasks[j]!,
            similarity: Math.round(sim * 100) / 100,
          });
        }
      }
    }
  }

  return warnings.sort((a, b) => b.similarity - a.similarity);
}
