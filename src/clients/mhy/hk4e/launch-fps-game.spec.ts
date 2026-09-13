import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { launchFpsGame } from "./launch-fps-game";
import { prepareFpsBridge } from "./fps-bridge";
import { boundary } from "./fps-integration-fixture";
import { validateFpsUnlockDraft } from "./config/fps-unlock-state";
import { buildFpsRuntimePlan } from "./fps-runtime";
import { createLaunchOwnership } from "../../../launcher/launch-ownership";
import { deferred } from "../../../utils/operation";
import type { Config } from "../../../config";
import type { Wine } from "../../../wine";
import type { Server } from "../../../constants";

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { NL_CWD: "/app", NL_PATH: "." });
  vi.stubGlobal("Neutralino", {
    debug: { log: async () => undefined },
    storage: {
      getData: async () => {
        throw { code: "NE_ST_NOSTKEX" };
      },
      setData: vi.fn(async () => undefined),
    },
    os: { execCommand: async () => ({ exitCode: 0, stdOut: "", stdErr: "" }) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function launch(target = "120", steamPatch = false) {
  const native = boundary(steamPatch),
    ownership = createLaunchOwnership();
  const value = validateFpsUnlockDraft({ enabled: true, target });
  if (!value.ok) throw Error("fixture target");
  const result = buildFpsRuntimePlan(
    value.value,
    { renderBackend: "dxmt" },
    "other=kept;d3d11.preferredMaxFrameRate=60;"
  );
  if (!result.ok || !result.value.companion || !result.value.gameDxmtConfig)
    throw Error("fixture plan");
  const wait = vi.fn(async () => {
    native.events.push("wine-wait");
    return { exitCode: 0, stdOut: "", stdErr: "", pid: 1 };
  });
  const journal = {
    capture: vi.fn(async () => undefined),
    restore: vi.fn(async (): Promise<unknown[]> => {
      native.events.push("files-restored");
      return [];
    }),
    dispose: vi.fn(async () => undefined),
  };
  const resources = vi.fn(async function* (_enabledFps?: boolean) {
    yield ["setUndeterminedProgress"] as ["setUndeterminedProgress"];
  });
  const setup = vi.fn(async () => {
    native.events.push("setup");
  });
  const config = { hk4eEnableHDR: true, resolutionCustom: true } as Config;
  const input = {
    admitted: {
      steamPatch,
      executable: "/game/GenshinImpact.exe",
      gameDirectory: "/game",
      wine: native.wine,
      plan: {
        ...result.value,
        companion: result.value.companion,
        gameDxmtConfig: result.value.gameDxmtConfig,
      },
    },
    wine: { waitUntilServerOff: wait } as unknown as Wine,
    server: { id: "hk4e_global" } as Server,
    config,
    registryResolution: true,
    environment: { KEEP: "kept", HTTP_PROXY: "localhost:8080" },
    resources,
    setup,
  };
  const start = () =>
    launchFpsGame(input, ownership.claim(), {
      bridge: input => prepareFpsBridge(input, native.io),
      journal: () => journal,
      companion: {
        clock: {
          now: () => Date.now(),
          setTimeout: (callback, ms) => setTimeout(callback, ms),
          clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
        },
      },
    });
  async function finish(transaction: ReturnType<typeof start>) {
    native.exit();
    native.stopped();
    native.direct.resolve({ confirmed: true, status: 0 });
    await tick(2000);
    return transaction.completion;
  }
  return {
    native,
    ownership,
    wait,
    journal,
    setup,
    resources,
    input,
    start,
    finish,
  };
}
it.each(["1", "60", "61", "120", "360"])(
  "assembles target %s through actual acquisition boundary, controller, registry and file cleanup",
  async target => {
    const rig = launch(target),
      transaction = rig.start();
    await tick(11000);
    expect(rig.resources).toHaveBeenCalledWith(true);
    expect(rig.native.events).toContain(`fps:${target}`);
    const requestCall = rig.native.io.start.mock.calls.find(
      ([request]) => request.args[0] !== "--registry"
    );
    if (!requestCall) throw Error("Missing bridge request");
    const request = requestCall[0];
    expect(request.executable).toBe("/tmp/request/fps-bridge.exe");
    expect(request.wine.loader).toBe("/selected/wine64");
    expect(request.wine.prefix).toBe("/selected/prefix");
    expect(request.wine.environment).toMatchObject({
      KEEP: "kept",
      HTTP_PROXY: "localhost:8080",
      DXMT_CONFIG: `other=kept;d3d11.preferredMaxFrameRate=${target};`,
    });
    expect(request.args[4]).toBe(
      `other=kept;d3d11.preferredMaxFrameRate=${
        Number(target) <= 60 ? target : 0
      };`
    );
    expect(await rig.finish(transaction)).toBeUndefined();
    const events = rig.native.events;
    expect(events.indexOf("registry:save")).toBeLessThan(
      events.indexOf("setup")
    );
    expect(events.indexOf("release")).toBeLessThan(
      events.indexOf("registry:restore")
    );
    expect(events.indexOf("registry:restore")).toBeLessThan(
      events.indexOf("files-restored")
    );
    expect(rig.ownership.state().held).toBe(false);
  }
);
it.each(["60", "61", "120"])(
  "Steam target %s propagates signed route, context and plan through the real controller",
  async target => {
    const rig = launch(target, true),
      transaction = rig.start();
    await tick(11000);
    expect(rig.native.io.stage).toHaveBeenCalledWith("/tmp/request", true);
    expect(rig.native.io.verify).toHaveBeenCalledWith(
      "/tmp/request/fps-bridge.exe",
      true
    );
    const request = rig.native.io.start.mock.calls.find(
      ([request]) => request.args[0] !== "--registry"
    )?.[0];
    expect(request?.args).toEqual([
      "Z:\\tmp\\request",
      rig.native.token,
      "Z:\\game\\GenshinImpact.exe",
      "Z:\\game",
      `other=kept;d3d11.preferredMaxFrameRate=${
        Number(target) <= 60 ? target : 0
      };`,
      expect.stringMatching(/^Z:\\app\\logs\\game_/),
      "Z:\\tmp\\request\\steam.exe",
    ]);
    expect(request?.wine.environment).toMatchObject({
      KEEP: "kept",
      HTTP_PROXY: "localhost:8080",
      DXMT_CONFIG: `other=kept;d3d11.preferredMaxFrameRate=${target};`,
    });
    expect(rig.native.status.pid).not.toBe(rig.native.status.shimPid);
    expect(rig.native.events).toContain(`fps:${target}`);
    expect(await rig.finish(transaction)).toBeUndefined();
  }
);

it("Steam game exit retains close/admission through relay, worker, supervisor, Wine, registry and files", async () => {
  const rig = launch("61", true),
    transaction = rig.start();
  await tick(11000);
  const guarded = () => {
    expect(rig.ownership.state().held).toBe(true);
    expect(rig.ownership.reserve()).toBeUndefined();
    expect(rig.ownership.beginClose()).toBe(false);
  };
  guarded();
  rig.native.delayStop();
  rig.native.status.primaryExited = 1;
  rig.native.status.exitCodeKnown = 1;
  rig.native.status.active = 0;
  await tick(2000);
  guarded();
  expect(rig.journal.restore).not.toHaveBeenCalled();
  // A living relay/shim cannot be mistaken for a game descendant or exit.
  expect(rig.ownership.state().failed).toBe(false);
  rig.native.status.shimExited = 1;
  rig.native.status.steamActive = 0;
  await tick(30);
  guarded();
  rig.native.stopped();
  await tick(2000);
  guarded();
  expect(rig.native.events).toContain("release");
  const wine = deferred<Awaited<ReturnType<typeof rig.wait>>>();
  rig.wait.mockReturnValueOnce(wine.promise);
  const registry = deferred<{ confirmed: boolean; status: number }>();
  rig.native.io.start.mockImplementation(request =>
    request.args[0] === "--registry" && request.args[1] === "restore"
      ? {
          started: Promise.resolve(),
          completion: registry.promise,
          stop: () => registry.promise,
        }
      : rig.native.start(request)
  );
  const files = deferred<unknown[]>();
  rig.journal.restore.mockReturnValueOnce(files.promise);
  rig.native.direct.resolve({ confirmed: true, status: 0 });
  await tick(30);
  guarded();
  wine.resolve({ exitCode: 0, stdOut: "", stdErr: "", pid: 1 });
  await tick(30);
  guarded();
  expect(rig.journal.restore).not.toHaveBeenCalled();
  registry.resolve({ confirmed: true, status: 0 });
  await tick(30);
  guarded();
  expect(rig.journal.restore).toHaveBeenCalledOnce();
  files.resolve([]);
  await tick(30);
  expect(await transaction.completion).toBeUndefined();
  expect(rig.ownership.beginClose()).toBe(true);
  rig.ownership.cancelClose();
  const next = rig.ownership.reserve();
  expect(next).toBeDefined();
  next?.release();
});

it("retains a pre-worker game failure after otherwise successful Steam cleanup", async () => {
  const rig = launch("120", true),
    transaction = rig.start();
  await tick(100);
  expect(rig.native.events).toContain("launch");
  expect(rig.native.events).not.toContain("start");
  rig.native.status.exitCode = 0xc0000005;
  const failure = await rig.finish(transaction);
  expect(String(failure)).toContain(
    "with code 0xc0000005; worker generation 0"
  );
  expect(rig.native.events).not.toContain("start");
  expect(rig.native.events).toContain("registry:restore");
  expect(rig.native.events).toContain("files-restored");
  expect(rig.ownership.state()).toMatchObject({ held: false, failed: true });
});

it("unconfirmed Steam cleanup remains visibly failed and guarded until later confirmed completion", async () => {
  const rig = launch("60", true),
    transaction = rig.start();
  await tick(11000);
  rig.native.status.primaryExited = 1;
  rig.native.status.active = 0;
  await tick(32000);
  expect(rig.ownership.state()).toMatchObject({ held: true, failed: true });
  expect(rig.ownership.state().detail).toMatch(
    /Steam shim\/relay job completion remains pending/
  );
  expect(rig.ownership.beginClose()).toBe(false);
  expect(rig.ownership.reserve()).toBeUndefined();
  expect(rig.journal.restore).not.toHaveBeenCalled();
  const result = await rig.finish(transaction);
  expect(
    result?.cleanupErrors.some(error =>
      String(error).includes("Steam shim/relay")
    )
  ).toBe(true);
  expect(rig.ownership.state()).toMatchObject({ held: false, failed: true });
});

it("early Steam exit fails observation without retargeting or restoring a living game", async () => {
  const rig = launch("120", true),
    transaction = rig.start();
  await tick(11000);
  rig.native.status.shimExited = 1;
  rig.native.status.steamActive = 1;
  await tick(2000);
  expect(rig.ownership.state()).toMatchObject({ held: true, failed: true });
  expect(rig.native.status.pid).toBe(42);
  expect(rig.journal.restore).not.toHaveBeenCalled();
  expect(await rig.finish(transaction)).toBeInstanceOf(Error);
});

it("cancellation during a pending Steam rendezvous accounts for late game creation", async () => {
  const rig = launch("60", true),
    handoff = deferred<void>();
  rig.native.io.command.mockImplementation(async (directory, text) => {
    if (text.includes(" launch ")) await handoff.promise;
    await rig.native.command(directory, text);
  });
  const transaction = rig.start();
  await tick(30);
  transaction.cancel();
  await tick(30);
  expect(rig.ownership.beginClose()).toBe(false);
  expect(rig.ownership.reserve()).toBeUndefined();
  expect(rig.native.status.launched).toBe(0);
  handoff.resolve();
  await tick(2000);
  expect(rig.native.status.launched).toBe(1);
  expect(rig.native.status.steamReady).toBe(1);
  expect(rig.native.events).not.toContain("start");
  expect(rig.journal.restore).not.toHaveBeenCalled();
  expect(rig.ownership.beginClose()).toBe(false);
  await rig.finish(transaction);
  expect(rig.ownership.state().held).toBe(false);
});
it("a nonzero native registry snapshot exit prevents preparation and game launch", async () => {
  const rig = launch();
  rig.native.failRegistry("save");
  const transaction = rig.start();
  await tick(50);
  expect((await transaction.completion)?.primary).toBeInstanceOf(Error);
  expect(rig.setup).not.toHaveBeenCalled();
  expect(rig.native.events).not.toContain("launch");
  expect(rig.ownership.state().held).toBe(false);
});
it("partial setup failure restores only its journal without issuing game creation", async () => {
  const rig = launch();
  rig.setup.mockRejectedValueOnce(new Error("partial setup"));
  const transaction = rig.start();
  await tick(50);
  expect((await transaction.completion)?.primary).toEqual(
    new Error("partial setup")
  );
  expect(rig.native.events).not.toContain("launch");
  expect(rig.native.events).toContain("registry:restore");
  expect(rig.journal.restore).toHaveBeenCalledOnce();
});
it("independent registry and file failures remain guarded and recover through retry", async () => {
  const rig = launch();
  const transaction = rig.start();
  await tick(11000);
  rig.native.failRegistry("restore");
  rig.journal.restore.mockResolvedValueOnce([new Error("file restore denied")]);
  rig.native.exit();
  rig.native.stopped();
  rig.native.direct.resolve({ confirmed: true, status: 0 });
  await tick(2000);
  expect(rig.journal.restore).toHaveBeenCalledOnce();
  expect(rig.ownership.state()).toMatchObject({
    held: true,
    failed: true,
    canRetry: true,
  });
  expect(rig.ownership.reserve()).toBeUndefined();
  rig.native.failRegistry();
  rig.ownership.retry();
  await tick(50);
  const error = await transaction.completion;
  expect(error?.cleanupErrors).toHaveLength(2);
  expect(rig.ownership.state().held).toBe(false);
});
it("a failed post-registry Wine wait must be retried before restoring Wine/game files", async () => {
  const rig = launch(),
    pendingWait = deferred<Awaited<ReturnType<typeof rig.wait>>>();
  const transaction = rig.start();
  await tick(11000);
  // First wait was preparation. Cleanup's first wait succeeds, its registry wait fails.
  rig.wait
    .mockResolvedValueOnce({ exitCode: 0, stdOut: "", stdErr: "", pid: 1 })
    .mockRejectedValueOnce(new Error("post-registry wait failed"))
    .mockReturnValueOnce(pendingWait.promise);
  rig.native.exit();
  rig.native.stopped();
  rig.native.direct.resolve({ confirmed: true, status: 0 });
  await tick(2000);
  expect(rig.journal.restore).not.toHaveBeenCalled();
  expect(rig.ownership.state().canRetry).toBe(true);
  rig.ownership.retry();
  await tick();
  expect(rig.journal.restore).not.toHaveBeenCalled();
  expect(rig.ownership.state().held).toBe(true);
  pendingWait.resolve({ exitCode: 0, stdOut: "", stdErr: "", pid: 1 });
  await tick(30);
  expect((await transaction.completion)?.cleanupErrors).toHaveLength(1);
  expect(rig.journal.restore).toHaveBeenCalledOnce();
});
it("cancellation during initialization leaves the game observed and prevents a worker spawn", async () => {
  const rig = launch(),
    transaction = rig.start();
  await tick(2000);
  transaction.cancel();
  await tick(2000);
  expect(rig.native.events).not.toContain("start");
  expect(rig.ownership.state().held).toBe(true);
  await rig.finish(transaction);
  expect(rig.ownership.state().held).toBe(false);
});
it("acquisition failure has no setup or Wine effects", async () => {
  const rig = launch();
  rig.native.io.stage.mockRejectedValueOnce(new Error("acquisition integrity"));
  const transaction = rig.start();
  await tick();
  expect((await transaction.completion)?.primary).toEqual(
    new Error("acquisition integrity")
  );
  expect(rig.wait).not.toHaveBeenCalled();
  expect(rig.setup).not.toHaveBeenCalled();
  expect(rig.native.io.start).not.toHaveBeenCalled();
});

it("retains admission and the exact recovery operation after acquisition cleanup fails", async () => {
  const rig = launch();
  rig.native.io.stage.mockRejectedValueOnce(Error("bad artifact"));
  rig.native.io.remove
    .mockRejectedValueOnce(Error("stage cleanup denied"))
    .mockRejectedValueOnce(Error("still denied"));
  const transaction = rig.start();
  await tick();
  expect(rig.ownership.state()).toMatchObject({
    held: true,
    failed: true,
    canRetry: true,
  });
  expect(rig.native.io.start).not.toHaveBeenCalled();
  expect(rig.setup).not.toHaveBeenCalled();
  rig.ownership.retry();
  await tick();
  const error = await transaction.completion;
  expect(error?.message).toContain("retained /tmp/request");
  expect(rig.ownership.state().held).toBe(false);
});
it("unconfirmed registry execution never reaches Wine waiting, files restoration or release", async () => {
  const rig = launch();
  const nativeStart = rig.native.start;
  rig.native.io.start.mockImplementation(request =>
    request.args[0] === "--registry"
      ? {
          started: Promise.resolve(),
          completion: Promise.resolve({ confirmed: false, status: 0 }),
          stop: () => Promise.resolve({ confirmed: false, status: 0 }),
        }
      : nativeStart(request)
  );
  const transaction = rig.start();
  await tick();
  expect(rig.ownership.state()).toMatchObject({
    held: true,
    failed: true,
    canRetry: true,
  });
  expect(rig.wait).toHaveBeenCalledTimes(1);
  expect(rig.journal.restore).not.toHaveBeenCalled();
  expect(rig.setup).not.toHaveBeenCalled();
  rig.ownership.retry();
  await tick();
  expect(rig.ownership.state().held).toBe(true);
  expect(rig.wait).toHaveBeenCalledTimes(1);
  // Deliberately unresolved: the completion was unconfirmed, not evidence of exit.
  void transaction;
});
it("a confirmed CreateProcess failure observes the request before safe cleanup and preserves the primary error", async () => {
  const rig = launch(),
    command = rig.native.command;
  rig.native.io.command.mockImplementation(async (dir, text) => {
    await command(dir, text);
    if (text.includes(" launch "))
      Object.assign(rig.native.status, {
        launched: 0,
        pid: 0,
        active: 0,
        launchError: 2,
        error: 2,
      });
  });
  rig.native.direct.resolve({ confirmed: true, status: 0 });
  const transaction = rig.start();
  await tick(50);
  const error = await transaction.completion;
  expect(error?.primary).toEqual(
    Error("FPS game CreateProcess not acknowledged: 2")
  );
  expect(rig.native.events).not.toContain("start");
  expect(rig.journal.restore).toHaveBeenCalledOnce();
  expect(rig.ownership.state().held).toBe(false);
});
it("cancellation retains a late bridge spawn through cooperative release and direct-child completion", async () => {
  const rig = launch(),
    ready = deferred<void>(),
    original = rig.native.start;
  let stops = 0;
  rig.native.io.start.mockImplementation(request =>
    request.args[0] === "--registry"
      ? original(request)
      : {
          started: ready.promise,
          completion: rig.native.direct.promise,
          stop: () => {
            stops++;
            rig.native.direct.resolve({ confirmed: true, status: 0 });
            return rig.native.direct.promise;
          },
        }
  );
  const transaction = rig.start();
  await tick(50);
  transaction.cancel();
  await tick(30000);
  expect(rig.ownership.state()).toMatchObject({ held: true, failed: true });
  expect(rig.journal.restore).not.toHaveBeenCalled();
  expect(rig.native.events).not.toContain("launch");
  ready.resolve();
  await tick(50);
  expect(rig.native.events).toContain("release");
  expect(rig.ownership.state().held).toBe(true);
  expect(rig.journal.restore).not.toHaveBeenCalled();
  rig.native.direct.resolve({ confirmed: true, status: 0 });
  await tick(50);
  await transaction.completion;
  expect(stops).toBe(0);
  expect(rig.journal.restore).toHaveBeenCalledOnce();
  expect(rig.ownership.state().held).toBe(false);
});
it("helper scan failure remains visibly failed while observing the live game", async () => {
  const rig = launch(),
    transaction = rig.start();
  await tick(11000);
  rig.native.status.workerError = 1168;
  rig.native.status.workerState = 4;
  rig.native.status.workerDone = 1;
  await tick(1500);
  expect(rig.ownership.state()).toMatchObject({ held: true, failed: true });
  expect(rig.journal.restore).not.toHaveBeenCalled();
  expect((await rig.finish(transaction))?.message).toContain(
    "scan/write failed"
  );
});
