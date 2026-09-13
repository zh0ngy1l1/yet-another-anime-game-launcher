import { createSignal } from "solid-js";
import { deferred } from "../utils/operation";

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
    canRetry: false,
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
      canRetry: false,
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
    setState(value => ({ ...value, held: closing, canRetry: false }));
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
    const update = (detail: string, failed: boolean) => {
      if (current === mine)
        setState(value => ({
          ...value,
          detail,
          failed: value.failed || failed,
        }));
    };
    return {
      succeed: (detail: string) => {
        if (current === mine)
          setState(value => ({ ...value, detail, failed: false }));
      },
      phase: (detail: string) => update(detail, false),
      problem: (detail: string) => update(detail, true),
      finish: () => finish(mine),
      async waitForRetry(detail: string) {
        update(detail, true);
        const waiting = deferred<void>();
        retry = () => waiting.resolve();
        setState(value => ({ ...value, canRetry: true }));
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
          detail: "Close cancelled",
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
