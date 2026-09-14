import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFpsCompanion, FPS_COMPANION_TIMING } from "./fps-companion";
import { buildFpsRuntimePlan } from "./fps-runtime";
import { validateFpsUnlockDraft } from "./config/fps-unlock-state";
import type { OperationClock } from "../../../utils/operation";
import type {
  OwnedExecutionOutcome,
  OwnedWineExecution,
} from "../../../wine/owned-execution";

vi.mock("./fps-unlocker", () => {
  throw new Error("Acquisition imported");
});
vi.mock("./program-launch-game", () => {
  throw new Error("Launcher imported");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const clock: OperationClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const timing = {
  discoveryTimeoutMs: 90,
  initializationMs: 10,
  restartBackoffMs: 5,
  pollMs: 1,
  operationTimeoutMs: 20,
  cleanupTimeoutMs: 10,
};

function plan(target: number) {
  const config = validateFpsUnlockDraft({
    enabled: true,
    target: String(target),
  });
  if (!config.ok) throw new Error("Test target invalid");
  const result = buildFpsRuntimePlan(
    config.value,
    { renderBackend: "dxmt" },
    "unrelated=kept;"
  );
  if (!result.ok || !result.value.companion)
    throw new Error("Test plan invalid");
  return result.value.companion;
}
function helper() {
  const exit = deferred<OwnedExecutionOutcome>();
  const started = deferred<void>();
  started.resolve();
  const value: OwnedWineExecution = {
    started: started.promise,
    completion: exit.promise,
    stop: vi.fn(() => {
      exit.resolve({ confirmed: true, status: 15 });
      return exit.promise;
    }),
  };
  return { value, exit, started };
}
function harness(target = 150) {
  let alive = true;
  let visible = true;
  const isAlive = vi.fn(async () => alive);
  const identity = { isAlive };
  const discover = vi.fn(async () => (visible ? identity : undefined));
  const helpers: ReturnType<typeof helper>[] = [];
  const spawn = vi.fn((): OwnedWineExecution | Promise<OwnedWineExecution> => {
    const next = helper();
    helpers.push(next);
    return next.value;
  });
  const input = Object.freeze({
    verifiedExecutable: "/verified cache/it's $fps/unlockfps.exe",
    companion: plan(target),
    wine: Object.freeze({
      loader: "/Wine Root/bin/wine64",
      prefix: "/Launch Prefix",
      environment: Object.freeze({
        KEEP: "yes",
        EMPTY: "",
        DXMT_CONFIG: "old=1;",
      }),
    }),
    game: { discover },
  });
  const controller = createFpsCompanion(input, { spawn, clock, timing });
  return {
    controller,
    input,
    helpers,
    spawn,
    discover,
    isAlive,
    hide: () => {
      visible = false;
    },
    show: () => {
      visible = true;
    },
    exitGame: () => {
      alive = false;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FPS companion discovery and initialization", () => {
  it("uses the legacy timing defaults", () => {
    expect(FPS_COMPANION_TIMING).toMatchObject({
      discoveryTimeoutMs: 90000,
      initializationMs: 10000,
      restartBackoffMs: 5000,
    });
  });
  it("times out without a game and never spawns", async () => {
    const h = harness();
    h.hide();
    const result = h.controller.start();
    await tick(90);
    expect(await result).toMatchObject({
      reason: "failed",
      error: new Error("Game discovery timed out"),
      cleanup: "confirmed",
    });
    expect(h.spawn).not.toHaveBeenCalled();
  });
  it.each([0, 4])(
    "finds the game after %i ms and respects initialization",
    async discoveredAt => {
      const h = harness();
      h.hide();
      h.controller.start();
      await tick(discoveredAt);
      h.show();
      await tick(1);
      await tick(9);
      expect(h.spawn).not.toHaveBeenCalled();
      await tick(1);
      expect(h.spawn).toHaveBeenCalledTimes(1);
      expect((await h.controller.stop()).cleanup).toBe("confirmed");
    }
  );
  it("detects immediate appearance without an initial polling sleep", async () => {
    const h = harness();
    h.controller.start();
    await tick();
    expect(h.discover).toHaveBeenCalledTimes(1);
    await tick(9);
    expect(h.spawn).not.toHaveBeenCalled();
    await tick(1);
    expect(h.spawn).toHaveBeenCalledTimes(1);
    await h.controller.stop();
  });
  it("exits normally during initialization", async () => {
    const h = harness();
    const result = h.controller.start();
    await tick(5);
    h.exitGame();
    await tick(1);
    expect(await result).toMatchObject({
      reason: "game-exited",
      cleanup: "confirmed",
    });
    expect(h.spawn).not.toHaveBeenCalled();
  });
  it.each(["before", "discovery", "initialization"])(
    "stops during %s",
    async phase => {
      const h = harness();
      if (phase === "discovery") h.hide();
      if (phase !== "before") {
        h.controller.start();
        await tick(2);
      }
      const stopped = h.controller.stop();
      expect(h.controller.start()).toBe(stopped);
      expect(h.controller.stop()).toBe(stopped);
      expect(await stopped).toMatchObject({
        reason: "stopped",
        cleanup: "confirmed",
      });
      expect(h.spawn).not.toHaveBeenCalled();
      if (phase === "before") expect(h.discover).not.toHaveBeenCalled();
    }
  );
  it.each(["discovery", "initialization", "running"])(
    "surfaces %s probe failure",
    async phase => {
      const h = harness();
      const error = new Error("probe failed");
      if (phase === "discovery") h.discover.mockRejectedValueOnce(error);
      else if (phase === "initialization")
        h.isAlive.mockRejectedValueOnce(error);
      const result = h.controller.start();
      if (phase === "running") {
        await tick(10);
        h.isAlive.mockRejectedValueOnce(error);
        await tick(1);
      }
      await tick();
      expect(await result).toMatchObject({
        reason: "failed",
        error,
        cleanup: "confirmed",
      });
    }
  );
  it("retains a hung discovery probe after timeout until it settles", async () => {
    const h = harness();
    const probe = deferred<undefined>();
    h.discover.mockReturnValue(probe.promise);
    const result = h.controller.start();
    await tick(30);
    expect(await result).toMatchObject({
      reason: "failed",
      error: new Error("Game discovery timed out"),
      cleanup: "unresolved",
    });
    probe.resolve(undefined);
    await tick();
    expect((await h.controller.completion).cleanup).toBe("confirmed");
    expect(h.spawn).not.toHaveBeenCalled();
  });
});

describe("FPS companion running and restart", () => {
  it("coalesces start/stop and cleans the owned helper", async () => {
    const h = harness();
    const result = h.controller.start();
    expect(h.controller.start()).toBe(result);
    await tick(10);
    const stopped = h.controller.stop();
    expect(stopped).toBe(result);
    expect(h.controller.stop()).toBe(stopped);
    expect(await stopped).toMatchObject({
      reason: "stopped",
      cleanup: "confirmed",
    });
    expect(h.helpers[0].value.stop).toHaveBeenCalledTimes(1);
    expect(h.controller.start()).toBe(result);
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });
  it("restarts once after backoff and never signals an exited incarnation", async () => {
    const h = harness();
    h.controller.start();
    await tick(10);
    h.helpers[0].exit.resolve({ confirmed: true, status: 256 });
    await tick();
    await tick(4);
    expect(h.spawn).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(h.spawn).toHaveBeenCalledTimes(2);
    await h.controller.stop();
    expect(h.helpers[0].value.stop).not.toHaveBeenCalled();
    expect(h.helpers[1].value.stop).toHaveBeenCalledTimes(1);
  });
  it("immediate exits always pay backoff", async () => {
    const h = harness();
    h.spawn.mockImplementation(() => {
      const next = helper();
      next.exit.resolve({ confirmed: true, status: 0 });
      return next.value;
    });
    h.controller.start();
    await tick(30);
    expect(h.spawn).toHaveBeenCalledTimes(5);
    await h.controller.stop();
  });
  it.each([0, 2, 4])(
    "does not restart when the game exits %i ms into backoff",
    async at => {
      const h = harness();
      const result = h.controller.start();
      await tick(10);
      h.helpers[0].exit.resolve({ confirmed: true });
      await tick(at);
      h.exitGame();
      await tick(5);
      expect((await result).reason).toBe("game-exited");
      expect(h.spawn).toHaveBeenCalledTimes(1);
    }
  );
  it("stops a running helper when the game exits", async () => {
    const h = harness();
    const result = h.controller.start();
    await tick(10);
    h.exitGame();
    await tick(1);
    expect(await result).toMatchObject({
      reason: "game-exited",
      cleanup: "confirmed",
    });
    expect(h.helpers[0].value.stop).toHaveBeenCalledTimes(1);
  });
  it("stops during restart backoff", async () => {
    const h = harness();
    h.controller.start();
    await tick(10);
    h.helpers[0].exit.resolve({ confirmed: true });
    await tick(2);
    await h.controller.stop();
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    "makes spawn rejection terminal (restart=%s)",
    async restart => {
      const h = harness();
      const error = new Error("spawn failed");
      if (!restart) h.spawn.mockRejectedValueOnce(error);
      const result = h.controller.start();
      await tick(10);
      if (restart) {
        h.spawn.mockRejectedValueOnce(error);
        h.helpers[0].exit.resolve({ confirmed: true });
        await tick(5);
      }
      expect(await result).toMatchObject({ reason: "failed", error });
      expect(h.spawn).toHaveBeenCalledTimes(restart ? 2 : 1);
    }
  );
  it("surfaces acknowledgement failure and cleans", async () => {
    const h = harness();
    const error = new Error("exec failed");
    const next = helper();
    const execution = { ...next.value, started: Promise.reject(error) };
    void execution.started.catch(() => undefined);
    h.spawn.mockReturnValue(execution);
    const result = h.controller.start();
    await tick(10);
    expect(await result).toMatchObject({ reason: "failed", error });
    expect(next.value.stop).toHaveBeenCalledTimes(1);
  });
  it("surfaces exit-observation failure and attempts cleanup", async () => {
    const h = harness();
    const error = new Error("exit observation failed");
    const result = h.controller.start();
    await tick(10);
    vi.mocked(h.helpers[0].value.stop).mockResolvedValue({ confirmed: true });
    h.helpers[0].exit.reject(error);
    await tick();
    expect(await result).toMatchObject({ reason: "failed", error });
    expect(h.helpers[0].value.stop).toHaveBeenCalledTimes(1);
  });
});

describe("FPS companion races and unresolved cleanup", () => {
  it.each(["stop", "game-exited"])(
    "cleans late spawn after %s while spawn is pending",
    async trigger => {
      const h = harness();
      const spawning = deferred<OwnedWineExecution>();
      h.spawn.mockReturnValue(spawning.promise);
      const result = h.controller.start();
      await tick(10);
      if (trigger === "stop") h.controller.stop();
      else {
        h.exitGame();
        await tick(1);
      }
      await tick(10);
      expect(await result).toMatchObject({
        reason: trigger === "stop" ? "stopped" : trigger,
        cleanup: "unresolved",
      });
      const late = helper();
      spawning.resolve(late.value);
      await tick();
      expect(late.value.stop).toHaveBeenCalledTimes(1);
      expect((await h.controller.completion).cleanup).toBe("confirmed");
      expect(h.spawn).toHaveBeenCalledTimes(1);
    }
  );
  it("observes late spawn rejection after public stop timeout", async () => {
    const h = harness();
    const spawning = deferred<OwnedWineExecution>();
    h.spawn.mockReturnValue(spawning.promise);
    h.controller.start();
    await tick(10);
    const result = h.controller.stop();
    await tick(10);
    expect((await result).cleanup).toBe("unresolved");
    const error = new Error("late spawn failure");
    spawning.reject(error);
    await tick();
    expect(await h.controller.completion).toMatchObject({
      cleanup: "failed",
      cleanupErrors: [error],
    });
  });
  it.each(["stop", "game-exited"])(
    "observes %s during a pending acknowledgement",
    async trigger => {
      const h = harness();
      const next = helper();
      const ack = deferred<void>();
      const execution = { ...next.value, started: ack.promise };
      execution.stop = vi.fn(() => {
        ack.reject(new Error("cancelled acknowledgement"));
        next.exit.resolve({ confirmed: true });
        return next.exit.promise;
      });
      h.spawn.mockReturnValue(execution);
      const result = h.controller.start();
      await tick(10);
      if (trigger === "stop") h.controller.stop();
      else {
        h.exitGame();
        await tick(1);
      }
      expect(await result).toMatchObject({
        reason: trigger === "stop" ? "stopped" : trigger,
        cleanup: "confirmed",
      });
      expect(execution.stop).toHaveBeenCalledTimes(1);
    }
  );
  it("times out helper acknowledgement and retains it until cleanup settles", async () => {
    const h = harness();
    const ack = deferred<void>();
    const next = helper();
    const execution = { ...next.value, started: ack.promise };
    h.spawn.mockReturnValue(execution);
    const result = h.controller.start();
    await tick(40);
    expect(await result).toMatchObject({
      reason: "failed",
      error: new Error("Helper acknowledgement timed out"),
      cleanup: "unresolved",
    });
    ack.reject(new Error("late failure"));
    await tick();
    expect((await h.controller.completion).cleanup).toBe("confirmed");
  });
  it("game exit immediately before spawn prevents execution", async () => {
    const h = harness();
    const result = h.controller.start();
    await tick(9);
    h.exitGame();
    await tick(1);
    expect((await result).reason).toBe("game-exited");
    expect(h.spawn).not.toHaveBeenCalled();
  });
  it("helper exit racing stop cannot restart or stop a later process", async () => {
    const h = harness();
    h.controller.start();
    await tick(10);
    h.helpers[0].exit.resolve({ confirmed: true });
    await h.controller.stop();
    // Duplicate notification cannot change the settled request or revive the loop.
    h.helpers[0].exit.resolve({ confirmed: true });
    await tick(20);
    expect(h.spawn).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(h.helpers[0].value.stop).mock.calls.length
    ).toBeLessThanOrEqual(1);
  });
  it("uses retained game identity despite a later process with reused PID", async () => {
    const h = harness();
    const result = h.controller.start();
    await tick(10);
    h.discover.mockResolvedValue({ isAlive: vi.fn(async () => true) });
    h.exitGame();
    await tick(1);
    expect((await result).reason).toBe("game-exited");
    expect(h.discover).toHaveBeenCalledTimes(1);
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });
  it("preserves original failure when cleanup also fails", async () => {
    const h = harness();
    const result = h.controller.start();
    await tick(10);
    const original = new Error("game probe");
    const cleanup = new Error("stop denied");
    h.isAlive.mockRejectedValueOnce(original);
    vi.mocked(h.helpers[0].value.stop).mockRejectedValue(cleanup);
    await tick(1);
    h.helpers[0].exit.resolve({ confirmed: false });
    await tick();
    expect(await result).toMatchObject({
      reason: "failed",
      error: original,
      cleanup: "failed",
      cleanupErrors: [cleanup],
    });
    h.helpers[0].exit.resolve({ confirmed: false });
  });
  it("reports unconfirmed termination and auxiliary cleanup failure", async () => {
    const h = harness();
    h.controller.start();
    await tick(10);
    const error = new Error("mailbox removal failed");
    vi.mocked(h.helpers[0].value.stop).mockResolvedValue({
      confirmed: false,
      cleanupError: error,
    });
    const result = h.controller.stop();
    h.helpers[0].exit.resolve({ confirmed: false });
    expect(await result).toMatchObject({
      cleanup: "failed",
      cleanupErrors: [error, expect.any(Error)],
    });
  });
  it("public timeout retains cleanup; eventual success is separately observable", async () => {
    const h = harness();
    h.controller.start();
    await tick(10);
    vi.mocked(h.helpers[0].value.stop).mockReturnValue(
      h.helpers[0].exit.promise
    );
    const stopped = h.controller.stop();
    await tick(10);
    expect((await stopped).cleanup).toBe("unresolved");
    expect(h.controller.stop()).toBe(stopped);
    h.helpers[0].exit.resolve({ confirmed: true });
    await tick();
    expect((await h.controller.completion).cleanup).toBe("confirmed");
    expect((await stopped).cleanup).toBe("unresolved");
    expect(h.helpers[0].value.stop).toHaveBeenCalledTimes(1);
  });
});

describe("FPS companion contract propagation", () => {
  it.each([1, 60, 61, 150, 360])(
    "passes verified path and authoritative target %i unchanged",
    async target => {
      const h = harness(target);
      const snapshot = JSON.stringify(h.input);
      h.controller.start();
      await tick(10);
      expect(h.spawn).toHaveBeenCalledWith({
        executable: h.input.verifiedExecutable,
        args: [String(target)],
        environment: {
          DXMT_CONFIG: `unrelated=kept;d3d11.preferredMaxFrameRate=${target};`,
        },
        wine: h.input.wine,
      });
      await h.controller.stop();
      expect(JSON.stringify(h.input)).toBe(snapshot);
    }
  );
  it("rejects timing that could busy-spin or never expire", () => {
    const h = harness();
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() =>
        createFpsCompanion(h.input, { timing: { restartBackoffMs: value } })
      ).toThrow("timing");
    }
  });
});

describe("FPS companion cancellation boundaries", () => {
  it("immediate stop suppresses queued discovery work", async () => {
    const h = harness();
    h.controller.start();
    await h.controller.stop();
    expect(h.discover).not.toHaveBeenCalled();
  });
  it("stops an owned helper before waiting for a hung game probe", async () => {
    const h = harness();
    h.controller.start();
    await tick(10);
    const probe = deferred<boolean>();
    h.isAlive.mockReturnValueOnce(probe.promise);
    await tick(1);
    const result = h.controller.stop();
    await tick();
    expect(h.helpers[0].value.stop).toHaveBeenCalledTimes(1);
    await tick(10);
    expect((await result).cleanup).toBe("unresolved");
    probe.resolve(false);
    await tick();
    expect((await h.controller.completion).cleanup).toBe("confirmed");
  });
  it("times out a spawn and safely stops a later result", async () => {
    const h = harness();
    const spawn = deferred<OwnedWineExecution>();
    h.spawn.mockReturnValue(spawn.promise);
    const result = h.controller.start();
    await tick(40);
    expect(await result).toMatchObject({
      reason: "failed",
      error: new Error("Helper spawn timed out"),
      cleanup: "unresolved",
    });
    const late = helper();
    spawn.resolve(late.value);
    await tick();
    expect(late.value.stop).toHaveBeenCalledTimes(1);
    expect((await h.controller.completion).cleanup).toBe("confirmed");
  });
  it("retains acknowledgement registered by a late spawn until it too settles", async () => {
    const h = harness();
    const spawn = deferred<OwnedWineExecution>();
    h.spawn.mockReturnValue(spawn.promise);
    h.controller.start();
    await tick(10);
    const result = h.controller.stop();
    await tick(10);
    expect((await result).cleanup).toBe("unresolved");
    const ack = deferred<void>();
    const late = helper();
    spawn.resolve({ ...late.value, started: ack.promise });
    await tick();
    let finished = false;
    void h.controller.completion.then(() => {
      finished = true;
    });
    await tick();
    expect(finished).toBe(false);
    ack.reject(new Error("late acknowledgement after stop"));
    await tick();
    expect((await h.controller.completion).cleanup).toBe("confirmed");
  });
  it("propagates retained mailbox paths when native cleanup cannot be confirmed", async () => {
    const h = harness();
    h.controller.start();
    await tick(10);
    const result = {
      confirmed: false,
      error: new Error("native response lost"),
      retainedDirectory: "/owned/mailbox",
    };
    vi.mocked(h.helpers[0].value.stop).mockResolvedValue(result);
    const stopped = h.controller.stop();
    h.helpers[0].exit.resolve(result);
    expect(await stopped).toMatchObject({
      cleanup: "failed",
      retainedDirectories: ["/owned/mailbox"],
    });
  });
  it("aborts the launch observer subscription and never invokes its termination method", async () => {
    const h = harness();
    const subscribed = new Set<AbortSignal>();
    const terminate = vi.fn();
    const game = {
      async discover(signal: AbortSignal) {
        subscribed.add(signal);
        signal.addEventListener("abort", () => subscribed.delete(signal), {
          once: true,
        });
        return { isAlive: async () => true, terminate };
      },
    };
    const controller = createFpsCompanion(
      { ...h.input, game },
      { spawn: h.spawn, clock, timing }
    );
    controller.start();
    await tick(10);
    expect(subscribed.size).toBe(1);
    await controller.stop();
    expect(subscribed.size).toBe(0);
    expect(terminate).not.toHaveBeenCalled();
  });
});

describe("execution failures remain separate from cleanup outcomes", () => {
  it.each(["worker-first", "stop-first"])(
    "preserves a confirmed worker error observed %s",
    async order => {
      const h = harness();
      const terminal = h.controller.start();
      await tick(10);
      const error = new Error("FPS target scan/write failed: 87");
      if (order === "stop-first") {
        vi.mocked(h.helpers[0].value.stop).mockImplementation(
          () => h.helpers[0].exit.promise
        );
        h.controller.stop();
      }
      h.helpers[0].exit.resolve({ confirmed: true, error });
      await tick(2);
      expect(await terminal).toMatchObject({
        reason: "failed",
        error,
        cleanup: "confirmed",
        cleanupErrors: [],
      });
      expect(h.helpers[0].value.stop).toHaveBeenCalledOnce();
      expect(h.spawn).toHaveBeenCalledOnce();
    }
  );
  it("retains separate primary, late worker and actual cleanup failures", async () => {
    const h = harness();
    const terminal = h.controller.start();
    await tick(10);
    const primary = new Error("game observation failed");
    const worker = new Error("FPS target scan/write failed: 87");
    const cleanup = new Error("mailbox cleanup failed");
    h.isAlive.mockRejectedValueOnce(primary);
    vi.mocked(h.helpers[0].value.stop).mockImplementation(
      () => h.helpers[0].exit.promise
    );
    await tick(1);
    h.helpers[0].exit.resolve({
      confirmed: true,
      error: worker,
      cleanupError: cleanup,
    });
    await tick(1);
    expect(await terminal).toMatchObject({
      reason: "failed",
      error: primary,
      observationErrors: [worker],
      cleanup: "failed",
      cleanupErrors: [cleanup],
    });
  });
});
