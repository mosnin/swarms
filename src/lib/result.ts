/**
 * A typed `Result<T, E>` — an explicit success/failure value used instead of
 * throwing for expected, recoverable outcomes. Throwing is reserved for truly
 * exceptional conditions.
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Construct a success result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Construct a failure result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard: the result is a success. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard: the result is a failure. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Map the success value, leaving failures untouched. */
export function map<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Map the failure value, leaving successes untouched. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Chain a fallible operation onto a success. */
export function andThen<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Return the success value or throw the error. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error instanceof Error
    ? result.error
    : new Error(`Called unwrap on an Err: ${String(result.error)}`);
}

/** Return the success value or a fallback. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Run a throwing function and capture the outcome as a `Result`. Use
 * {@link fromPromise} for async functions.
 */
export function fromThrowable<T>(fn: () => T): Result<T, unknown> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error);
  }
}

/** Await a promise and capture the outcome as a `Result`. */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, unknown>> {
  try {
    return ok(await promise);
  } catch (error) {
    return err(error);
  }
}
