import { createSignal } from "solid-js";
import { deferred } from "../utils/operation";

export const RUNNING_STATUS = "Game is running. DO NOT QUIT THE LAUNCHER";

export class LaunchFailure extends Error {
  constructor(
    message: string,
    readonly primary?: unknown,
    readonly cleanupErrors: readonly unknown[] = [],
    readonly observationErrors: readonly unknown[] = []
  ) {
    super(message);
    if (primary instanceof LaunchFailure) {
      this.primary = primary.primary ?? primary;
      this.cleanupErrors = [...primary.cleanupErrors, ...cleanupErrors];
      this.observationErrors = [
        ...primary.observationErrors,
        ...observationErrors,
      ];
    }
  }
}

/** Reservation is synchronous; only its claimed transaction can release it. */
export function createLaunchOwnership() {
  const [state, setState] = createSignal({
    held: false,
    detail: "",
    failed: false,
    error: "",
    warning: "",
    running: false,
    canRetry: false,
    retryLabel: "Retry safe cleanup",
  });
  let current:
    | { id: symbol; claimed: boolean; done: ReturnType<typeof deferred<void>> }
    | undefined;
  let retry: (() => void) | undefined;
  let closing = false;
  function reserve() {
    if (current || closing) return undefined;
    const mine = {
      id: Symbol("primary action"),
      claimed: false,
      done: deferred<void>(),
    };
    current = mine;
    setState({
      held: true,
      detail: "Preparing launch",
      failed: false,
      error: "",
      warning: "",
      running: false,
      canRetry: false,
      retryLabel: "Retry safe cleanup",
    });
    return {
      release() {
        if (current === mine && !mine.claimed) finish(mine);
      },
    };
  }
  function finish(mine: NonNullable<typeof current>) {
    if (current !== mine) throw new Error("Stale launch ownership release");
    current = undefined;
    retry = undefined;
    setState(value => ({
      ...value,
      held: closing,
      running: false,
      canRetry: false,
      detail: !value.failed && !value.warning ? "" : value.detail,
    }));
    mine.done.resolve();
  }
  function claim() {
    if (closing) throw new LaunchFailure("The launcher is closing");
    if (!current) reserve();
    const mine = current;
    if (!mine) throw new LaunchFailure("Cannot reserve launch ownership");
    if (mine.claimed)
      throw new LaunchFailure("A launch already owns preparation or cleanup");
    mine.claimed = true;
    let stage: "preparing" | "running" | "cleanup" | "settled" = "preparing";
    const update = (detail: string, failed: boolean) => {
      if (current === mine && stage !== "settled")
        setState(value =>
          failed
            ? { ...value, error: detail, failed: true }
            : stage === "preparing"
            ? { ...value, detail: value.running ? RUNNING_STATUS : detail }
            : value
        );
    };
    return {
      succeed: (detail = "") => {
        if (current === mine) {
          stage = "settled";
          setState(value => ({
            ...value,
            detail,
            running: false,
            error: "",
            failed: false,
          }));
        }
      },
      stopped: () => {
        if (current === mine) {
          stage = "settled";
          setState(value => ({
            ...value,
            running: false,
            detail: "Launch stopped. See the error above.",
          }));
        }
      },
      running: () => {
        if (
          current === mine &&
          (stage === "preparing" || stage === "running")
        ) {
          stage = "running";
          setState(value => ({
            ...value,
            running: true,
            detail: RUNNING_STATUS,
          }));
        }
      },
      ended: () => {
        if (current === mine && stage !== "settled") {
          stage = "cleanup";
          setState(value => ({
            ...value,
            running: false,
            detail: "Game has exited. Finishing cleanup…",
          }));
        }
      },
      warning: (warning: string) => {
        if (current === mine) setState(value => ({ ...value, warning }));
      },
      phase: (detail: string) => update(detail, false),
      problem: (detail: string) => update(detail, true),
      finish: () => finish(mine),
      async waitForRetry(detail: string, retryLabel = "Retry safe cleanup") {
        update(detail, true);
        const waiting = deferred<void>();
        retry = () => waiting.resolve();
        setState(value => ({ ...value, canRetry: true, retryLabel }));
        await waiting.promise;
        retry = undefined;
        setState(value => ({ ...value, canRetry: false }));
      },
    };
  }
  return {
    state,
    async beginShutdown() {
      closing = true; // Reserve close synchronously, even while a launch settles.
      await current?.done.promise;
      setState(value => ({ ...value, held: true, detail: "Closing launcher" }));
    },
    beginClose() {
      if (current || closing) return false;
      closing = true;
      setState(value => ({ ...value, held: true, detail: "Closing launcher" }));
      return true;
    },
    cancelClose() {
      closing = false;
      if (!current)
        setState(value => ({
          ...value,
          held: false,
          detail: value.failed ? value.detail : "",
        }));
    },
    releaseUnclaimed() {
      if (current && !current.claimed) finish(current);
    },
    reserve,
    claim,
    retry: () => retry?.(),
    wait: () => current?.done.promise ?? Promise.resolve(),
  };
}
export const launchOwnership = createLaunchOwnership();
