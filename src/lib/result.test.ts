import { describe, expect, it } from "vitest";

import {
  andThen,
  err,
  fromPromise,
  fromThrowable,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
} from "@/lib/result";

describe("Result helpers", () => {
  it("constructs and narrows ok values", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("constructs and narrows err values", () => {
    const r = err("boom");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBe("boom");
  });

  it("maps success and leaves failure untouched", () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err<string>("e"), (n: number) => n * 2)).toEqual(err("e"));
  });

  it("maps failure and leaves success untouched", () => {
    expect(mapErr(err("e"), (s) => s.toUpperCase())).toEqual(err("E"));
    expect(mapErr(ok(1), (s: string) => s.toUpperCase())).toEqual(ok(1));
  });

  it("chains with andThen", () => {
    const parse = (s: string) => (Number.isNaN(Number(s)) ? err("nan") : ok(Number(s)));
    expect(andThen(ok("10"), parse)).toEqual(ok(10));
    expect(andThen(ok("x"), parse)).toEqual(err("nan"));
    expect(andThen(err<string>("prev"), parse)).toEqual(err("prev"));
  });

  it("unwraps or falls back", () => {
    expect(unwrap(ok(5))).toBe(5);
    expect(unwrapOr(err("e"), 99)).toBe(99);
    expect(() => unwrap(err(new Error("nope")))).toThrowError(/nope/);
  });

  it("captures throwing functions", () => {
    expect(fromThrowable(() => 1)).toEqual(ok(1));
    const r = fromThrowable(() => {
      throw new Error("x");
    });
    expect(isErr(r)).toBe(true);
  });

  it("captures rejected promises", async () => {
    expect(await fromPromise(Promise.resolve(7))).toEqual(ok(7));
    const r = await fromPromise(Promise.reject(new Error("rejected")));
    expect(isErr(r)).toBe(true);
  });
});
