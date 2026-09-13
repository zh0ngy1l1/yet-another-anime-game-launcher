import { boundary } from "./fps-integration-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBridgeStatus } from "./fps-bridge";
import { createFpsCompanion } from "./fps-companion";
import { buildFpsRuntimePlan } from "./fps-runtime";
import { validateFpsUnlockDraft } from "./config/fps-unlock-state";
import { createLaunchTransaction } from "./launch-transaction";
import {
  createLaunchOwnership,
  launchOwnership,
} from "../../../launcher/launch-ownership";
import { GLOBAL_onClose } from "../../../utils/neu";
import { deferred } from "../../../utils/operation";

const tick = (ms = 20) => vi.advanceTimersByTimeAsync(ms);
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it("verifies the prepared system32 pair and launches its canonical Windows image", async () => {
  const rig = boundary(true),
    bridge = await rig.prepare();
  // Acquisition occurs before the caller prepares prefix files.
  expect(rig.io.verify).not.toHaveBeenCalled();
  await bridge.boot();
  const selected = "/selected/prefix/drive_c/windows/system32";
  expect(rig.io.verify).toHaveBeenLastCalledWith(bridge.path, selected);
  const request = rig.io.start.mock.calls[0][0];
  expect(request.args[6]).toBe("C:\\windows\\system32\\steam.exe");
  expect(request.args).not.toContain("Z:\\tmp\\request\\steam.exe");
  expect(request.outputLog).toBe("/logs/game.log.wine.log");
  expect(request.environment.WINEDEBUG).toBe(
    "fixme-all,err-unwind,+timestamp,+seh,+loaddll"
  );
  await bridge.launch();
  expect(rig.io.verify).toHaveBeenLastCalledWith(bridge.path, selected);
  rig.exit();
  rig.direct.resolve({ confirmed: true, status: 0 });
  await bridge.release();
  await bridge.dispose();
});

it("direct FPS launch requires no Steam files and retains custom Wine debug channels", async () => {
  const rig = boundary(false);
  Object.assign(rig.wine.environment, { WINEDEBUG: "-all,+timestamp" });
  const bridge = await rig.prepare();
  await bridge.boot();
  expect(rig.io.verify).toHaveBeenLastCalledWith(bridge.path, undefined);
  const request = rig.io.start.mock.calls[0][0];
  expect(request.args).toHaveLength(6);
  expect(request.environment.WINEDEBUG).toBe("-all,+timestamp,+seh,+loaddll");
  await bridge.launch();
  rig.exit();
  rig.direct.resolve({ confirmed: true, status: 0 });
  await bridge.release();
  await bridge.dispose();
});

async function companion(
  rig: ReturnType<typeof boundary>,
  fps = "120",
  initializationMs = 0
) {
  const validated = validateFpsUnlockDraft({ enabled: true, target: fps });
  if (!validated.ok) throw Error("invalid fixture");
  const plan = buildFpsRuntimePlan(
    validated.value,
    { renderBackend: "dxmt" },
    "other=kept;"
  );
  if (!plan.ok || !plan.value.companion) throw Error("invalid plan fixture");
  const bridge = await rig.prepare();
  await bridge.boot();
  await bridge.launch();
  const controller = createFpsCompanion(
    {
      verifiedExecutable: bridge.path,
      companion: plan.value.companion,
      wine: rig.wine,
      game: bridge.game,
    },
    {
      spawn: request => {
        expect(request.args).toEqual([fps]);
        expect(request.environment.DXMT_CONFIG).toBe(
          plan.value.companion?.dxmtConfig
        );
        expect(request.wine).toEqual(rig.wine);
        return bridge.spawnWorker(Number(request.args[0]));
      },
      clock: {
        now: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
      },
      timing: {
        initializationMs,
        pollMs: 10,
        restartBackoffMs: 50,
        operationTimeoutMs: 100,
        cleanupTimeoutMs: 100,
      },
    }
  );
  return { bridge, controller };
}

it.each(["boot", "launch", "restart"])(
  "Steam artifact replacement before %s cannot execute changed bytes",
  async phase => {
    const rig = boundary(true),
      bridge = await rig.prepare();
    if (phase === "boot") {
      rig.replace();
      await expect(bridge.boot()).rejects.toThrow("replaced artifact");
      expect(rig.io.start).not.toHaveBeenCalled();
    } else {
      await bridge.boot();
      if (phase === "launch") {
        rig.replace();
        await expect(bridge.launch()).rejects.toThrow("replaced artifact");
        expect(rig.events).not.toContain("launch");
      } else {
        await bridge.launch();
        const worker = await bridge.spawnWorker(120);
        await tick();
        rig.stopped();
        await tick();
        await worker.completion;
        rig.replace();
        await expect(bridge.spawnWorker(120)).rejects.toThrow(
          "replaced artifact"
        );
        expect(rig.events.filter(event => event === "start")).toHaveLength(1);
        rig.exit();
      }
      rig.direct.resolve({ confirmed: true, status: 0 });
      await bridge.release();
    }
    await bridge.dispose();
  }
);

it("stale Steam incarnation and unknown Steam job state retain the same observation", async () => {
  const rig = boundary(true),
    bridge = await rig.prepare();
  await bridge.boot();
  await bridge.launch();
  rig.status.shimPid = 99;
  let observed = false;
  const probe = bridge.probe().then(value => {
    observed = true;
    return value;
  });
  await tick(40);
  expect(observed).toBe(false);
  expect(rig.diagnostic).toHaveBeenCalledWith(
    expect.stringMatching(/incarnation\/lifecycle changed/)
  );
  rig.status.shimPid = 40;
  await tick(20);
  await probe;
  rig.status.primaryExited = 1;
  rig.status.active = 0;
  rig.status.steamActive = 0xffffffff;
  let ended = false;
  const ending = bridge.waitForGameExit().then(() => {
    ended = true;
  });
  await tick(50);
  expect(ended).toBe(false);
  rig.exit();
  await tick(30);
  await ending;
  rig.direct.resolve({ confirmed: true, status: 0 });
  await bridge.release();
  await bridge.dispose();
});

it.each([
  { version: 1 },
  { version: 2 },
  { exitCodeKnown: 2 },
  { exitCode: -1 },
  { exitCodeKnown: 1, primaryExited: 0, pid: 42 },
  { exitCodeKnown: 1, primaryExited: 1, pid: 42, exitCodeError: 5 },
  { exitCodeKnown: 0, exitCode: 1 },
  { steamReady: 2 },
  { shimExited: -1 },
  { steamActive: 1.5 },
  { shimPid: 42, pid: 42 },
  { steamReady: 1, shimPid: 0 },
])("rejects malformed Steam protocol %j", patch => {
  const rig = boundary(true);
  expect(() =>
    parseBridgeStatus(JSON.stringify({ ...rig.status, ...patch }), rig.token)
  ).toThrow();
});

it("reports nonzero game exit before worker initialization while retaining descendant lifetime", async () => {
  const rig = boundary(true);
  const { bridge, controller } = await companion(rig, "120", 10000);
  const terminal = controller.start();
  let ended = false;
  const lifetime = bridge.waitForGameExit().then(() => {
    ended = true;
  });
  await tick(100);
  expect(rig.io.start.mock.calls[0][0].outputLog).toBe(
    "/logs/game.log.wine.log"
  );
  rig.exit();
  rig.status.exitCode = 0xc0000005;
  rig.status.active = 1;
  rig.status.steamActive = 1;
  await tick(100);
  expect(ended).toBe(false);
  expect(rig.events).not.toContain("start");
  expect(rig.status.generation).toBe(0);
  expect(rig.diagnostic).toHaveBeenCalledWith(
    expect.stringContaining("with code 0xc0000005; worker generation 0")
  );
  expect((await terminal).reason).toBe("game-exited");
  rig.status.active = rig.status.steamActive = 0;
  await tick(30);
  await lifetime;
  rig.direct.resolve({ confirmed: true, status: 0 });
  await bridge.release();
  await bridge.dispose();
  expect(rig.diagnostic).toHaveBeenCalledTimes(2); // Exit and the still-active game job.
});

it("does not treat unavailable exit status as a successful game exit", async () => {
  const rig = boundary(true),
    bridge = await rig.prepare();
  await bridge.boot();
  await bridge.launch();
  rig.exit();
  rig.status.exitCodeKnown = 0;
  rig.status.exitCodeError = 5;
  await bridge.waitForGameExit();
  expect(rig.diagnostic).toHaveBeenCalledWith(
    expect.stringContaining("unavailable exit status (error 5)")
  );
  rig.direct.resolve({ confirmed: true, status: 0 });
  await bridge.release();
});

it("rejects a changed exit code from the same retained game", async () => {
  const rig = boundary(),
    bridge = await rig.prepare();
  await bridge.boot();
  await bridge.launch();
  rig.exit();
  rig.status.exitCode = 7;
  await bridge.probe();
  rig.status.exitCode = 0;
  let settled = false;
  const probe = bridge.probe().then(() => {
    settled = true;
  });
  await tick(50);
  expect(settled).toBe(false);
  expect(rig.diagnostic).toHaveBeenCalledWith(
    expect.stringContaining("incarnation/lifecycle changed")
  );
  rig.status.exitCode = 7;
  await tick(30);
  await probe;
  rig.direct.resolve({ confirmed: true, status: 0 });
  await bridge.release();
});

describe("real controller and request bridge protocol", () => {
  it.each(["1", "60", "61", "120", "360"])(
    "binds target %s through the runtime contract and execution boundary",
    async fps => {
      const rig = boundary();
      const { bridge, controller } = await companion(rig, fps);
      const terminal = controller.start();
      await tick(50);
      expect(rig.events).toContain(`fps:${fps}`);
      const request = rig.io.start.mock.calls[0][0] as unknown as {
        wine: unknown;
        executable: string;
        args: string[];
      };
      expect(request.executable).toBe(bridge.path);
      expect(request.wine).toEqual(rig.wine);
      expect(request.args.slice(0, 4)).toEqual([
        "Z:\\tmp\\request",
        rig.token,
        "Z:\\game\\GenshinImpact.exe",
        "Z:\\game",
      ]);
      rig.exit();
      await tick(50);
      expect((await terminal).reason).toBe("game-exited");
      expect((await controller.completion).cleanup).toBe("confirmed");
      rig.direct.resolve({ confirmed: true });
      await bridge.release();
      await bridge.dispose();
      expect(rig.io.remove).toHaveBeenCalledOnce();
    }
  );
  it("continues lifetime observation after the foreground Wine request completes", async () => {
    const rig = boundary();
    const { bridge, controller } = await companion(rig);
    const running = controller.start();
    await tick(30);
    rig.direct.resolve({ confirmed: true });
    await tick();
    let ended = false;
    const lifetime = bridge.waitForGameExit().then(() => {
      ended = true;
    });
    await tick(50);
    expect(ended).toBe(false);
    expect(rig.events).not.toContain("stop");
    rig.exit();
    await tick(50);
    await lifetime;
    await running;
    await controller.completion;
    await bridge.release();
  });
  it("rejects replaced staged bytes on initial worker start", async () => {
    const rig = boundary();
    const { bridge, controller } = await companion(rig);
    rig.replace();
    const running = controller.start();
    await tick(50);
    expect((await running).reason).toBe("failed");
    expect(rig.events).not.toContain("start");
    rig.exit();
    const exited = bridge.waitForGameExit();
    await tick(30);
    await exited;
    rig.direct.resolve({ confirmed: true });
    await bridge.release();
  });
  it("rechecks bytes before a controller restart and never silently falls back", async () => {
    const rig = boundary();
    const { bridge, controller } = await companion(rig);
    const running = controller.start();
    let outcome: unknown;
    void running.then(value => {
      outcome = value;
    });
    await tick(30);
    rig.stopped();
    await tick(20);
    rig.replace();
    await tick(300);
    expect({ outcome, status: rig.status, events: rig.events }).toMatchObject({
      outcome: { reason: "failed" },
    });
    expect((await running).reason).toBe("failed");
    expect(rig.events.filter(x => x === "start")).toHaveLength(1);
    rig.exit();
    const exited = bridge.waitForGameExit();
    await tick(30);
    await exited;
    rig.direct.resolve({ confirmed: true });
    await bridge.release();
  });
  it("keeps malformed/stale protocol liveness unknown until the same request recovers", async () => {
    const rig = boundary();
    const bridge = await rig.prepare();
    await bridge.boot();
    await bridge.launch();
    rig.corrupt(true);
    let ended = false;
    const lifetime = bridge.waitForGameExit().then(() => {
      ended = true;
    });
    await tick(100);
    expect(ended).toBe(false);
    expect(rig.diagnostic).toHaveBeenCalled();
    rig.exit();
    rig.corrupt(false);
    await tick(20);
    await lifetime;
    rig.direct.resolve({ confirmed: true });
    await bridge.release();
  });
  it("rejects PID replacement even if the replacement claims to have exited", async () => {
    const rig = boundary();
    const bridge = await rig.prepare();
    await bridge.boot();
    await bridge.launch();
    rig.status.pid = 43;
    rig.exit();
    let ended = false;
    const lifetime = bridge.waitForGameExit().then(() => {
      ended = true;
    });
    await tick(100);
    expect(ended).toBe(false);
    rig.status.pid = 42;
    await tick();
    await lifetime;
    rig.direct.resolve({ confirmed: true });
    await bridge.release();
  });
});

describe("transaction admission, queue lifetime and normal close", () => {
  it.each([false, true])(
    "holds global close/admission after game exit through worker, child, Wine and restoration (Steam=%s)",
    async steam => {
      const rig = boundary(steam);
      const { bridge, controller } = await companion(rig);
      rig.delayStop();
      const wineWait = deferred<void>(),
        registry = deferred<void>(),
        restoration = deferred<void>();
      const owner = launchOwnership.claim();
      const transaction = createLaunchTransaction(
        {
          prepare: async () => undefined,
          launch: async () => undefined,
          gameExit: () => bridge.waitForGameExit(),
          companion: () => controller,
          async cleanup(phase) {
            phase("bridge");
            await bridge.release();
            phase("wine");
            await wineWait.promise;
            phase("registry");
            await registry.promise;
            phase("restore");
            await restoration.promise;
            await bridge.dispose();
            return [];
          },
        },
        owner
      );
      await tick(40);
      const guarded = async () => {
        expect(launchOwnership.reserve()).toBeUndefined();
        expect(await GLOBAL_onClose(false)).toBe(false);
        expect(launchOwnership.state().detail).not.toContain(
          "Cleanup completed"
        );
      };
      await guarded();
      rig.exit();
      await tick(40);
      await guarded();
      expect(rig.events).toContain("stop");
      await tick(150);
      expect(launchOwnership.state().failed).toBe(true);
      await guarded();
      rig.stopped();
      await tick(30);
      await guarded();
      expect(rig.events).toContain("release");
      rig.direct.resolve({ confirmed: true });
      await tick();
      await guarded();
      wineWait.resolve();
      await tick();
      await guarded();
      registry.resolve();
      await tick();
      await guarded();
      restoration.resolve();
      await tick();
      await transaction.completion;
      expect(await GLOBAL_onClose(false)).toBe(true);
      launchOwnership.cancelClose();
      const next = launchOwnership.reserve();
      expect(next).toBeDefined();
      if (!next) throw Error("Missing fresh admission");
      next.release();
    }
  );
  it("attempts safe cleanup, preserves primary/secondary errors and retries while guarded", async () => {
    const own = createLaunchOwnership();
    let attempts = 0;
    const transaction = createLaunchTransaction(
      {
        prepare: async () => {
          throw new Error("primary setup failure");
        },
        launch: async () => {
          throw Error("must not launch");
        },
        gameExit: async () => {
          throw Error("must not observe unissued launch");
        },
        companion: () => {
          throw Error("must not start");
        },
        reportedErrors: () => [
          new Error("primary setup failure"),
          new Error("additional observation"),
          new Error("additional observation"),
          new Error("secondary restore failure"),
        ],
        cleanup: async () =>
          ++attempts === 1 ? [new Error("secondary restore failure")] : [],
      },
      own.claim()
    );
    await tick();
    expect(own.state().canRetry).toBe(true);
    expect(own.reserve()).toBeUndefined();
    expect(own.state().detail).not.toContain("Cleanup completed");
    own.retry();
    await tick();
    const error = await transaction.completion;
    if (!error) throw Error("Missing launch error");
    expect(error.primary).toEqual(new Error("primary setup failure"));
    expect(error.cleanupErrors).toEqual([
      new Error("secondary restore failure"),
    ]);
    expect(error.observationErrors).toEqual([
      new Error("additional observation"),
    ]);
    expect(error.message).toBe(
      "Launch finished with errors: Error: primary setup failure; Error: additional observation. Cleanup completed. Earlier cleanup errors: Error: secondary restore failure"
    );
    expect(own.state().detail).toBe(error.message);
    expect(own.state().held).toBe(false);
  });
  it("generator early return cannot abandon background preparation or cleanup", async () => {
    const own = createLaunchOwnership(),
      preparation = deferred<void>(),
      cleanup = deferred<void>();
    let launched = false;
    const transaction = createLaunchTransaction(
      {
        async prepare(_signal, progress) {
          progress(["setUndeterminedProgress"]);
          await preparation.promise;
        },
        launch: async () => {
          launched = true;
        },
        gameExit: async () => undefined,
        companion: () => {
          throw Error("must not start");
        },
        cleanup: async () => {
          await cleanup.promise;
          return [];
        },
      },
      own.claim()
    );
    const generator = transaction.program();
    await generator.next();
    const returned = generator.return();
    await tick();
    expect(own.state().held).toBe(true);
    preparation.resolve();
    await tick();
    expect(launched).toBe(false);
    expect(own.state().held).toBe(true);
    cleanup.resolve();
    await returned;
    expect(own.state().held).toBe(false);
  });
});

it.each([
  undefined,
  null,
  {},
  { version: 1, token: "other" },
  { version: 1, token: "b".repeat(64), sequence: -1 },
])("rejects malformed protocol %j", input => {
  expect(() =>
    parseBridgeStatus(JSON.stringify(input) as string, "b".repeat(64))
  ).toThrow();
});
