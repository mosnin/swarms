import { describe, expect, it } from "vitest";

import {
  assertTransition,
  canTransition,
  isTerminal,
  nextStates,
} from "@/server/jobs/stateMachine";

describe("job state machine", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "succeeded")).toBe(true);
    expect(canTransition("running", "failed")).toBe(true);
    expect(canTransition("running", "awaiting_approval")).toBe(true);
    expect(canTransition("awaiting_approval", "queued")).toBe(true);
    expect(canTransition("awaiting_payment", "queued")).toBe(true);
    expect(canTransition("queued", "cancelled")).toBe(true);
    // Retry requeue: a transiently-failed running job returns to the queue.
    expect(canTransition("running", "queued")).toBe(true);
  });

  it("forbids illegal transitions", () => {
    expect(canTransition("succeeded", "running")).toBe(false);
    expect(canTransition("failed", "queued")).toBe(false);
    expect(canTransition("cancelled", "running")).toBe(false);
    expect(canTransition("succeeded", "queued")).toBe(false);
  });

  it("treats success/failure/cancellation as terminal", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("queued")).toBe(false);
    expect(nextStates("succeeded")).toEqual([]);
  });

  it("assertTransition throws CONFLICT on an illegal jump", () => {
    expect(() => assertTransition("succeeded", "running")).toThrowError();
    try {
      assertTransition("cancelled", "running");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFLICT");
    }
  });

  it("assertTransition is silent on a legal transition", () => {
    expect(() => assertTransition("queued", "running")).not.toThrow();
  });
});
