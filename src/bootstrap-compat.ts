import type { BootstrapNative, BootstrapStatus } from "./bootstrap";
import { errorMessage } from "./utils/errors";

const STOCK_CHANNELS = [
  "bh3glb",
  "hkrpgcn",
  "hkrpgos",
  "cbjq",
  "cbjqcn",
  "napcn",
  "napos",
];
const STARTUP_TIMEOUT = 90000;
const DEADLINE_MESSAGE =
  "Startup did not finish within 90 seconds. See neutralinojs.log.";

// Legacy channels ship upstream Neutralino. Show their WebView before using
// its JS clock; HK4E still requires the native clock and owned runtime.
export function createBootstrapAdapter(options: {
  channel: string | undefined;
  native: BootstrapNative | undefined;
  show: () => Promise<unknown>;
  failure: (message: string) => void;
}): BootstrapNative {
  if (options.native) return options.native;
  if (!STOCK_CHANNELS.includes(options.channel ?? "")) {
    return async () => {
      throw Error(
        "Yaagl OS requires the matching local native runtime (bootstrap API missing)."
      );
    };
  }

  let status: BootstrapStatus = { phase: "starting" };
  let began: Promise<void> | undefined;
  let deadline: number | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let releaseBegin!: () => void;
  const stopped = new Promise<void>(resolve => {
    releaseBegin = resolve;
  });
  const waits = new Map<
    ReturnType<typeof setTimeout>,
    (status: BootstrapStatus) => void
  >();
  const snapshot = () => ({ ...status });
  function finish(next: BootstrapStatus) {
    if (status.phase !== "starting") return;
    status = next;
    clearTimeout(watchdog);
    releaseBegin();
    for (const [timer, resolve] of waits) {
      clearTimeout(timer);
      resolve(snapshot());
    }
    waits.clear();
  }
  function expire() {
    if (
      status.phase === "starting" &&
      deadline !== undefined &&
      Date.now() >= deadline
    ) {
      finish({ phase: "failed", message: DEADLINE_MESSAGE });
      options.failure(DEADLINE_MESSAGE);
    }
  }

  return async input => {
    expire();
    if (input.op === "begin" && status.phase === "starting") {
      if (!began) {
        deadline = Date.now() + STARTUP_TIMEOUT;
        watchdog = setTimeout(expire, STARTUP_TIMEOUT);
        began = options.show().then(
          () => undefined,
          error => {
            finish({ phase: "failed", message: errorMessage(error) });
          }
        );
      }
      await Promise.race([began, stopped]);
      expire();
    } else if (input.op === "wait" && status.phase === "starting") {
      const milliseconds = input.milliseconds;
      if (
        milliseconds === undefined ||
        !Number.isInteger(milliseconds) ||
        milliseconds < 1 ||
        milliseconds > STARTUP_TIMEOUT
      ) {
        throw Error("Bootstrap wait outside bounds");
      }
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          waits.delete(timer);
          expire();
          resolve(snapshot());
        }, milliseconds);
        waits.set(timer, resolve);
      });
    } else if (input.op === "ready") {
      finish({ phase: "ready" });
    } else if (input.op === "fail") {
      finish({ phase: "failed", message: input.message });
    } else if (input.op === "cancel") {
      finish({ phase: "cancelled", message: input.message });
    }
    return snapshot();
  };
}
