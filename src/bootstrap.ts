import { setBootstrapClock } from "./bootstrap-clock";

export type BootstrapPhase = "starting" | "ready" | "failed" | "cancelled";
export interface BootstrapStatus {
  phase: BootstrapPhase;
  message?: string;
}
export type BootstrapNative = (input: {
  op: "begin" | "wait" | "ready" | "fail" | "cancel";
  milliseconds?: number;
  message?: string;
}) => Promise<BootstrapStatus>;

export class BootstrapSession {
  private phase: BootstrapPhase = "starting";
  private pendingSpawns = new Set<Promise<unknown>>();
  private unknownSpawns: unknown[] = [];
  private rejectFailure!: (error: Error) => void;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private readonly readiness = new Promise<void>((resolve, reject) => {
    this.resolveReady = resolve;
    this.rejectReady = reject;
  });
  readonly failure = new Promise<never>((_, reject) => {
    this.rejectFailure = reject;
  });

  constructor(readonly native: BootstrapNative) {
    // Cancellation may arrive before createApp has begun awaiting this promise.
    void this.failure.catch(() => undefined);
    void this.readiness.catch(() => undefined);
  }

  isStarting() {
    return this.phase === "starting";
  }

  isReady() {
    return this.phase === "ready";
  }

  assertActive() {
    if (!this.isStarting()) throw Error("Launcher startup has stopped");
  }

  whenReady() {
    return this.readiness;
  }

  stop(message: string, cancelled = false) {
    if (!this.isStarting()) return;
    this.phase = cancelled ? "cancelled" : "failed";
    this.rejectFailure(Error(message));
    this.rejectReady(Error(message));
  }

  async wait(milliseconds: number) {
    this.assertActive();
    const status = await this.native({ op: "wait", milliseconds });
    if (status.phase === "ready") throw Error("Bootstrap wait released");
    if (status.phase !== "starting") {
      this.stop(status.message || "Launcher startup has stopped");
    }
    this.assertActive();
    return milliseconds;
  }

  async trackSpawn<T>(operation: () => Promise<T>): Promise<T> {
    this.assertActive();
    const pending = operation();
    this.pendingSpawns.add(pending);
    try {
      return await pending;
    } catch (error) {
      // An issued native RPC may have created its child before its response or
      // cleanup-hook registration failed. Rejection is not proof of no child.
      this.unknownSpawns.push(error);
      throw error;
    } finally {
      this.pendingSpawns.delete(pending);
    }
  }

  async drainSpawns() {
    await Promise.allSettled([...this.pendingSpawns]);
    if (this.unknownSpawns.length) {
      throw Error(
        `Sidecar creation acknowledgement remains unresolved (${
          this.unknownSpawns.length
        }); keep the launcher and logs for review. ${String(
          this.unknownSpawns[0]
        )}`
      );
    }
  }

  async ready() {
    this.assertActive();
    const status = await this.native({ op: "ready" });
    if (status.phase !== "ready") {
      throw Error(status.message || "Native startup deadline expired");
    }
    this.assertActive();
    this.phase = "ready";
    setBootstrapClock(undefined);
    this.resolveReady();
  }
}

export async function startBootstrap<T>(options: {
  session: BootstrapSession;
  create: () => Promise<T>;
  render: (ui: T) => void;
  failure: (error: unknown) => void;
}) {
  const { session } = options;
  setBootstrapClock(session);
  try {
    const status = await session.native({ op: "begin" });
    if (status.phase !== "starting") {
      throw Error(status.message || "Native startup is unavailable");
    }
    session.assertActive();
    const ui = await Promise.race([options.create(), session.failure]);
    session.assertActive();
    // Solid's render installs the DOM synchronously. Paint/rAF is neither
    // required nor awaited: a hidden WKWebView may never produce a frame.
    options.render(ui);
    await session.ready();
  } catch (error) {
    session.stop(String(error));
    options.failure(error);
    await session.native({ op: "fail", message: String(error) });
  }
}
