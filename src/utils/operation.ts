/** Clock and observation helpers for opt-in lifecycle operations. */
export interface OperationClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export const operationClock: OperationClock = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export type Observed<T> =
  | { kind: "value"; value: T }
  | { kind: "error"; error: unknown }
  | { kind: "timeout" }
  | { kind: "cancelled" };

// One promise continuation per operation, even when a long session polls it.
// Per-observation listeners are removable on timeout/abort.
const observations = new WeakMap<
  Promise<unknown>,
  {
    result?: Observed<unknown>;
    listeners: Set<(result: Observed<unknown>) => void>;
  }
>();

/** Bounds observation only. The caller must retain side-effecting operations. */
export function observe<T>(
  operation: Promise<T>,
  ms: number,
  clock: OperationClock,
  signal?: AbortSignal
): Promise<Observed<T>> {
  let shared = observations.get(operation);
  if (!shared) {
    shared = { listeners: new Set() };
    observations.set(operation, shared);
    const state = shared;
    const settled = (result: Observed<unknown>) => {
      state.result = result;
      for (const listener of state.listeners) listener(result);
      state.listeners.clear();
    };
    operation.then(
      value => settled({ kind: "value", value }),
      error => settled({ kind: "error", error })
    );
  }
  const state = shared;
  return new Promise(resolve => {
    let done = false;
    const finish = (result: Observed<T>) => {
      if (done) return;
      done = true;
      clock.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      state.listeners.delete(listener);
      resolve(result);
    };
    const cancel = () => finish({ kind: "cancelled" });
    const listener = (result: Observed<unknown>) =>
      finish(result as Observed<T>);
    state.listeners.add(listener);
    const timer = clock.setTimeout(() => finish({ kind: "timeout" }), ms);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    else if (state.result) listener(state.result);
  });
}

export function delay(
  ms: number,
  clock: OperationClock,
  signal: AbortSignal
): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      clock.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = clock.setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => (resolve = yes));
  return { promise, resolve };
}
