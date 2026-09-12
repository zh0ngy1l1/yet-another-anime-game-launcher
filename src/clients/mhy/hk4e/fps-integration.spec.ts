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

async function companion(rig: ReturnType<typeof boundary>, fps = "120") {
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
        initializationMs: 0,
        pollMs: 10,
        restartBackoffMs: 50,
        operationTimeoutMs: 100,
        cleanupTimeoutMs: 100,
      },
    }
  );
  return { bridge, controller };
}

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
  it("holds admission after game exit through worker, direct child, Wine wait and restoration", async () => {
    const rig = boundary();
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
  });
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
        cleanup: async () =>
          ++attempts === 1 ? [new Error("secondary restore failure")] : [],
      },
      own.claim()
    );
    await tick();
    expect(own.state().canRetry).toBe(true);
    expect(own.reserve()).toBeUndefined();
    own.retry();
    await tick();
    const error = await transaction.completion;
    if (!error) throw Error("Missing launch error");
    expect(error.primary).toEqual(new Error("primary setup failure"));
    expect(error.cleanupErrors).toEqual([
      new Error("secondary restore failure"),
    ]);
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
