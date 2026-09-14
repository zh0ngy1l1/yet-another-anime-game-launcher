import type { FpsRuntimeResult } from "./fps-runtime";
import {
  startOwnedWineExecution,
  OwnedWineContext,
  OwnedWineExecution,
  OwnedWineRequest,
} from "../../../wine/owned-execution";
import {
  deferred,
  delay,
  observe,
  operationClock,
  OperationClock,
} from "../../../utils/operation";

export type FpsCompanionPlan = NonNullable<
  Extract<FpsRuntimeResult, { ok: true }>["value"]["companion"]
>;

/**
 * Step 7 binds discovery to this launch, never merely a name/shared prefix.
 * Once returned, isAlive observes ONLY that incarnation. Exit is irreversible;
 * a reused PID or a later game must return false. Neither operation may kill.
 * Abort releases observation subscriptions; in-flight requests may settle late.
 * Rejections are errors, including inability to establish identity or liveness.
 */
export interface FpsGameObserver {
  discover(
    signal: AbortSignal
  ): Promise<{ isAlive(signal: AbortSignal): Promise<boolean> } | undefined>;
}

export const FPS_COMPANION_TIMING = Object.freeze({
  discoveryTimeoutMs: 90000,
  initializationMs: 10000,
  restartBackoffMs: 5000,
  pollMs: 1000,
  // Local IPC should be short. These bound observation, never native effects.
  operationTimeoutMs: 10000,
  cleanupTimeoutMs: 10000,
});

export type FpsCompanionTiming = {
  readonly [K in keyof typeof FPS_COMPANION_TIMING]: number;
};

export interface FpsCompanionOutcome {
  readonly reason: "stopped" | "game-exited" | "failed";
  readonly error?: unknown;
  /** Additional execution/observation failures, never restoration failures. */
  readonly observationErrors?: readonly unknown[];
  readonly cleanup: "confirmed" | "failed" | "unresolved";
  readonly cleanupErrors: readonly unknown[];
  readonly retainedDirectories: readonly string[];
}

const cancelled = Symbol("companion cancelled");
const gameExited = Symbol("game exited");

/**
 * Single-use controller; Step 7 supplies its target-bound worker adapter.
 * start() starts once and returns the terminal outcome (not spawn acknowledgement).
 * stop() prevents new work and returns that SAME promise, after a bounded cleanup
 * observation. Stop before start is terminal. Neither public promise rejects.
 * completion observes eventual settlement of every issued operation and cleanup.
 * An unresolved public result stays unresolved; await completion for its eventual
 * result. Native operations are retained, not claimed cancelled by a timeout.
 */
export function createFpsCompanion(
  input: {
    /** Caller precondition: resolved Step 4 verified path; no verification here. */
    readonly verifiedExecutable: string;
    readonly companion: FpsCompanionPlan;
    readonly wine: OwnedWineContext;
    readonly game: FpsGameObserver;
  },
  dependencies: {
    spawn?: (
      request: OwnedWineRequest
    ) => OwnedWineExecution | Promise<OwnedWineExecution>;
    clock?: OperationClock;
    timing?: Partial<FpsCompanionTiming>;
  } = {}
) {
  const clock = dependencies.clock ?? operationClock;
  const spawn = dependencies.spawn ?? startOwnedWineExecution;
  const timing = { ...FPS_COMPANION_TIMING, ...dependencies.timing };
  for (const [key, value] of Object.entries(timing)) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (value === 0 && key !== "initializationMs")
    ) {
      throw new Error(`Invalid FPS companion timing: ${key}`);
    }
  }
  const request: OwnedWineRequest = Object.freeze({
    executable: input.verifiedExecutable,
    args: Object.freeze([String(input.companion.fpsArgument)]),
    environment: Object.freeze({ DXMT_CONFIG: input.companion.dxmtConfig }),
    wine: Object.freeze({
      ...input.wine,
      environment: Object.freeze({ ...input.wine.environment }),
    }),
  });
  const game = input.game;
  const cancellation = new AbortController();
  const signal = cancellation.signal;
  const terminal = deferred<FpsCompanionOutcome>();
  const completion = deferred<FpsCompanionOutcome>();
  const pending = new Set<Promise<unknown>>();
  const owned = new Set<OwnedWineExecution>();
  const cleanups = new Map<OwnedWineExecution, Promise<void>>();
  const cleanupErrors: unknown[] = [];
  const retainedDirectories: string[] = [];
  let started = false;
  let reason: FpsCompanionOutcome["reason"] = "stopped";
  let failure: unknown;
  const observationErrors: unknown[] = [];
  function executionFailure(error: unknown) {
    reason = "failed";
    if (failure === undefined) failure = error;
    else if (
      String(error) !== String(failure) &&
      !observationErrors.some(previous => String(previous) === String(error))
    )
      observationErrors.push(error);
  }
  let unconfirmed = false;

  function track<T>(operation: Promise<T>): Promise<T> {
    pending.add(operation);
    // This observer both retains late operations and prevents stray rejections.
    void operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation)
    );
    return operation;
  }

  function cleanup(helper: OwnedWineExecution) {
    const existing = cleanups.get(helper);
    if (existing) return existing;
    const cleaning = Promise.resolve()
      .then(() => helper.stop())
      .then(
        result => {
          if (result.retainedDirectory)
            retainedDirectories.push(result.retainedDirectory);
          if (!result.confirmed) unconfirmed = true;
          // stop() returns the retained execution outcome. A worker failure
          // is still primary even when first observed while stopping. Only
          // cleanupError (or a rejected stop) describes a cleanup operation.
          if (result.error !== undefined) executionFailure(result.error);
          if (result.cleanupError !== undefined)
            cleanupErrors.push(result.cleanupError);
          if (!result.confirmed && result.error === undefined) {
            cleanupErrors.push(
              new Error("Owned helper termination is unconfirmed")
            );
          }
        },
        error => {
          unconfirmed = true;
          cleanupErrors.push(error);
        }
      );
    cleanups.set(helper, cleaning);
    return cleaning;
  }

  async function operation<T>(
    promise: Promise<T>,
    name: string,
    ms = timing.operationTimeoutMs
  ) {
    const result = await observe(track(promise), ms, clock, signal);
    if (result.kind === "cancelled") throw cancelled;
    if (result.kind === "timeout") throw new Error(`${name} timed out`);
    if (result.kind === "error") throw result.error;
    return result.value;
  }

  async function run() {
    try {
      const deadline = clock.now() + timing.discoveryTimeoutMs;
      let identity: Awaited<ReturnType<FpsGameObserver["discover"]>>;
      while (!identity) {
        if (signal.aborted) throw cancelled;
        const left = deadline - clock.now();
        if (left <= 0) throw new Error("Game discovery timed out");
        identity = await operation(
          Promise.resolve().then(() => {
            if (signal.aborted) throw cancelled;
            return game.discover(signal);
          }),
          "Game discovery",
          Math.min(left, timing.operationTimeoutMs)
        );
        if (!identity)
          await delay(
            Math.min(timing.pollMs, deadline - clock.now()),
            clock,
            signal
          );
      }
      const detected = identity;
      const alive = async () => {
        if (signal.aborted) throw cancelled;
        if (
          !(await operation(
            Promise.resolve().then(() => {
              if (signal.aborted) throw cancelled;
              return detected.isAlive(signal);
            }),
            "Game probe"
          ))
        ) {
          throw gameExited;
        }
      };
      const waitWhileAlive = async (ms: number) => {
        const until = clock.now() + ms;
        do {
          await alive();
          if (clock.now() >= until) return;
          await delay(
            Math.min(timing.pollMs, until - clock.now()),
            clock,
            signal
          );
        } while (!signal.aborted);
        throw cancelled;
      };
      await waitWhileAlive(timing.initializationMs);
      const awaitStartup = async <T>(
        promise: Promise<T>,
        name: string
      ): Promise<T> => {
        track(promise);
        const deadline = clock.now() + timing.operationTimeoutMs;
        for (;;) {
          await alive();
          const result = await observe(
            promise,
            Math.min(timing.pollMs, Math.max(0, deadline - clock.now())),
            clock,
            signal
          );
          if (result.kind === "value") return result.value;
          if (result.kind === "error") throw result.error;
          if (result.kind === "cancelled") throw cancelled;
          if (clock.now() >= deadline) throw new Error(`${name} timed out`);
        }
      };
      while (!signal.aborted) {
        await alive(); // Last observation immediately before issuing a spawn.
        const spawning = Promise.resolve()
          .then(() => {
            if (signal.aborted) throw cancelled;
            return spawn(request);
          })
          .then(
            helper => {
              owned.add(helper);
              // Either promise may fail before its lifecycle phase is reached.
              track(helper.started);
              track(helper.completion);
              // Register a late success even after public stop has timed out.
              if (signal.aborted) void cleanup(helper);
              return helper;
            },
            error => {
              if (error !== cancelled && signal.aborted)
                cleanupErrors.push(error);
              throw error;
            }
          );
        const helper = await awaitStartup(spawning, "Helper spawn");
        // Observe game exit even while acknowledgement or completion is pending.
        await awaitStartup(helper.started, "Helper acknowledgement");
        for (;;) {
          await alive();
          const result = await observe(
            helper.completion,
            timing.pollMs,
            clock,
            signal
          );
          if (result.kind === "cancelled") throw cancelled;
          if (result.kind === "error") throw result.error;
          if (result.kind === "value") {
            if (
              !result.value.confirmed ||
              result.value.error !== undefined ||
              result.value.cleanupError !== undefined
            ) {
              throw (
                result.value.error ??
                result.value.cleanupError ??
                new Error("Helper exit unconfirmed")
              );
            }
            owned.delete(helper);
            break;
          }
        }
        await waitWhileAlive(timing.restartBackoffMs);
      }
    } catch (error) {
      if (error === gameExited) reason = "game-exited";
      else if (error !== cancelled) executionFailure(error);
    }
    cancellation.abort();
    // Start cleanup immediately; do not wait for a hung read before stopping.
    for (const helper of owned) void cleanup(helper);
    const finishing = (async (): Promise<FpsCompanionOutcome> => {
      // A pending spawn may register new acknowledgement/completion promises.
      while (pending.size) await Promise.allSettled([...pending]);
      for (const helper of owned) await cleanup(helper);
      owned.clear();
      cleanups.clear();
      return {
        reason,
        ...(failure === undefined ? {} : { error: failure }),
        ...(observationErrors.length
          ? { observationErrors: [...observationErrors] }
          : {}),
        cleanup: unconfirmed || cleanupErrors.length ? "failed" : "confirmed",
        cleanupErrors: [...cleanupErrors],
        retainedDirectories: [...retainedDirectories],
      };
    })();
    void finishing.then(completion.resolve);
    const result = await observe(finishing, timing.cleanupTimeoutMs, clock);
    terminal.resolve(
      result.kind === "value"
        ? result.value
        : {
            reason,
            ...(failure === undefined ? {} : { error: failure }),
            ...(observationErrors.length
              ? { observationErrors: [...observationErrors] }
              : {}),
            cleanup: "unresolved",
            cleanupErrors: [...cleanupErrors],
            retainedDirectories: [...retainedDirectories],
          }
    );
  }

  return {
    completion: completion.promise,
    start() {
      if (!started) {
        started = true;
        void run();
      }
      return terminal.promise;
    },
    stop() {
      cancellation.abort();
      if (!started) {
        started = true;
        void run();
      }
      return terminal.promise;
    },
  };
}
