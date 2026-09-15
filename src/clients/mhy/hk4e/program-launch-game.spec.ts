import { beforeEach, expect, it, vi } from "vitest";
import { launchGameProgram } from "./program-launch-game";
import { launchOwnership } from "../../../launcher/launch-ownership";
import { GLOBAL_onClose } from "../../../utils/neu";
import { deferred, operationClock } from "../../../utils/operation";
import {
  FPS_UNLOCK_ENABLED_KEY,
  FPS_UNLOCK_TARGET_KEY,
} from "./config/fps-unlock-state";
import type { Config } from "../../../config";
import type { Wine } from "../../../wine";
import type { Server } from "../../../constants";
import { prepareFpsBridge } from "./fps-bridge";
import { boundary } from "./fps-integration-fixture";
import { createLaunchFix } from "./launch-fix";
import { prepareR2Wine, disposeR2Wine } from "./prepare-r2";

vi.mock("./prepare-r2", () => ({
  prepareR2Wine: vi.fn(async (wine: Wine) => wine),
  disposeR2Wine: vi.fn(async () => undefined),
}));

vi.mock("./launch-fix", () => ({
  createLaunchFix: vi.fn(() => {
    throw Error("unexpected Launch Fix acquisition");
  }),
}));

vi.mock("./fps-bridge", () => ({
  prepareFpsBridge: vi.fn(() => {
    throw Error("unexpected FPS acquisition");
  }),
}));
vi.mock("./launch-journal", () => ({
  createLaunchJournal: () => ({
    capture: async (path: string) => {
      captured.push(path);
    },
    restore: async () => {
      files.delete("/app/config.bat");
      return [];
    },
    dispose: async () => undefined,
  }),
}));
vi.mock("../patch", () => ({
  async *patchProgram(...args: unknown[]) {
    patchCalls.push(args);
    /* File effects injected at this boundary. */
  },
  async *patchRevertProgram() {
    /* File effects injected at this boundary. */
  },
}));
const stored = new Map<string, string>();
const files = new Map<string, string>();
const captured: string[] = [];
const patchCalls: unknown[][] = [];
beforeEach(() => {
  stored.clear();
  files.clear();
  captured.length = 0;
  patchCalls.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    NL_OS: "Darwin",
    NL_VERSION: "4.11.0-yaagl-owned3",
    NL_CWD: "/app",
    NL_PATH: ".",
  });
  vi.stubGlobal("Neutralino", {
    storage: {
      getData: async (key: string) => {
        if (!stored.has(key)) throw { code: "NE_ST_NOSTKEX" };
        return stored.get(key);
      },
      setData: async (key: string, value: string) => stored.set(key, value),
    },
    debug: { log: async () => undefined },
    os: {
      execCommand: async (command: string) => ({
        exitCode: 0,
        stdOut: command.startsWith("/usr/bin/mktemp")
          ? "/tmp/yaagl-launch.0123456789\n"
          : command.includes("steamgameid")
          ? "absent"
          : "",
        stdErr: "",
        pid: 1,
      }),
    },
    filesystem: {
      writeFile: async (path: string, data: string) => files.set(path, data),
      writeBinaryFile: async (path: string) =>
        files.set(path, "binary registry data"),
      removeFile: async (path: string) => files.delete(path),
      createDirectory: async () => undefined,
      getStats: async () => ({ isFile: false, isDirectory: true }),
    },
  });
});
const settle = async () => {
  for (let i = 0; i < 80; i++) await Promise.resolve();
};
function input() {
  const wine = {
    setProps: vi.fn(async () => undefined),
    exec: vi.fn(async () => undefined),
    exec2: vi.fn(async () => undefined),
    waitUntilServerOff: vi.fn(async () => undefined),
    toWinePath: (path: string) => "Z:" + path.replaceAll("/", "\\"),
    prefix: "/prefix",
    attributes: { renderBackend: "dxmt" },
  } as unknown as Wine;
  return {
    gameDir: "/game",
    gameExecutable: "GenshinImpact.exe",
    server: { id: "hk4e_global" } as Server,
    config: { metalHud: true, timeoutFix: true } as Config,
    wine,
  };
}
async function drain(program: ReturnType<typeof launchGameProgram>) {
  for await (const _command of program) {
    /* Actual generator consumer. */
  }
}
it.each([false, true])(
  "disabled retains invalid target and upstream DXMT/Steam=%s without FPS operations",
  async steam => {
    stored.set(FPS_UNLOCK_ENABLED_KEY, "false");
    stored.set(FPS_UNLOCK_TARGET_KEY, "invalid retained text");
    const request = input();
    request.config.steamPatch = steam;
    await drain(launchGameProgram(request));
    expect(prepareFpsBridge).not.toHaveBeenCalled();
    expect(request.wine.exec2).toHaveBeenCalledWith(
      steam ? "C:\\windows\\system32\\steam.exe" : "cmd",
      steam ? ["Z:\\game\\GenshinImpact.exe"] : ["/c", "Z:\\app\\config.bat "],
      expect.objectContaining({
        WINEDEBUG: "fixme-all,err-unwind,+timestamp,err+seh,+loaddll",
        DXMT_CONFIG: "d3d11.preferredMaxFrameRate=60;",
        MTL_HUD_ENABLED: "1",
        WINE_ENABLE_TIMEOUT_FIX: "1",
        WINEESYNC: "1",
      }),
      expect.stringMatching(/\/app\/logs\/game_/),
      true
    );
    expect(files.has("/app/config.bat")).toBe(false);
    expect(launchOwnership.state().held).toBe(false);
  }
);

it.each([false, true])(
  "cancelling pending Launch Fix readiness with FPS=%s cannot create the game",
  async fps => {
    vi.useFakeTimers();
    const clock = vi
      .spyOn(operationClock, "now")
      .mockImplementation(() => Date.now());
    try {
      stored.set(FPS_UNLOCK_ENABLED_KEY, String(fps));
      stored.set(FPS_UNLOCK_TARGET_KEY, "60");
      const request = input(),
        native = boundary(true),
        ready = deferred<void>(),
        restored = deferred<void>();
      request.config.steamPatch = true;
      request.config.blockNet = true;
      Object.assign(request.wine, {
        distributionId: "11.0-dxmt-signed-with-patches",
        executionContext: { loader: "/wine/bin/wine", prefix: "/prefix" },
        attributes: { renderBackend: "dxmt", winePath: "wine" },
      });
      vi.spyOn(Neutralino.filesystem, "getStats").mockImplementation(
        async path =>
          ({
            isFile: path !== "/prefix",
            isDirectory: path === "/prefix",
          } as never)
      );
      const fix = {
        start: vi.fn(() => ready.promise),
        finish: vi.fn(() => restored.promise),
        errors: () => [],
      };
      vi.mocked(createLaunchFix).mockReturnValue(fix);
      if (fps) {
        const actual = await vi.importActual<typeof import("./fps-bridge")>(
          "./fps-bridge"
        );
        vi.mocked(prepareFpsBridge).mockImplementationOnce(value =>
          actual.prepareFpsBridge(value, native.io)
        );
      }
      const iterator = launchGameProgram(request),
        running = drain(iterator);
      // Attach before cancellation: the pending next may report the cancellation.
      const observed = running.catch(error => error);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fix.start).toHaveBeenCalledOnce();
      const returning = iterator.return();
      ready.resolve();
      await vi.advanceTimersByTimeAsync(1000);
      expect(native.events).not.toContain("launch");
      expect(request.wine.exec2).not.toHaveBeenCalled();
      expect(fix.finish).toHaveBeenCalled();
      expect(launchOwnership.state().held).toBe(true);
      restored.resolve();
      native.direct.resolve({ confirmed: true, status: 0 });
      await vi.advanceTimersByTimeAsync(1000);
      await returning;
      await observed;
      expect(launchOwnership.state().held).toBe(false);
      expect(files.has("/app/config.bat")).toBe(false);
    } finally {
      clock.mockRestore();
      vi.useRealTimers();
    }
  }
);
it("disabled non-DXMT keeps its environment and admits unsupported retained FPS preferences", async () => {
  stored.set(FPS_UNLOCK_ENABLED_KEY, "false");
  stored.set(FPS_UNLOCK_TARGET_KEY, "361");
  const request = input();
  request.wine.attributes = {};
  await drain(launchGameProgram(request));
  const environment = vi.mocked(request.wine.exec2).mock.calls[0][2];
  expect(environment).not.toHaveProperty("DXMT_CONFIG");
  expect(prepareFpsBridge).not.toHaveBeenCalled();
});
it("rejects invalid enabled settings before resource acquisition or setup", async () => {
  stored.set(FPS_UNLOCK_ENABLED_KEY, "true");
  stored.set(FPS_UNLOCK_TARGET_KEY, "0");
  const request = input();
  const resources = vi.fn(async function* () {
    /* Must not be reached by invalid admission. */
  });
  await expect(drain(launchGameProgram(request, resources))).rejects.toThrow(
    "Invalid enabled Target FPS"
  );
  expect(resources).not.toHaveBeenCalled();
  expect(request.wine.setProps).not.toHaveBeenCalled();
  expect(prepareFpsBridge).not.toHaveBeenCalled();
});
it.each([false, true])(
  "enabled Steam=%s preserves route-specific preparation through the real transaction and bridge adapter",
  async steam => {
    vi.useFakeTimers();
    const clock = vi
      .spyOn(operationClock, "now")
      .mockImplementation(() => Date.now());
    try {
      stored.set(FPS_UNLOCK_ENABLED_KEY, "true");
      stored.set(FPS_UNLOCK_TARGET_KEY, "60");
      const request = input(),
        native = boundary(steam);
      request.config.steamPatch = steam;
      Object.assign(request.wine, {
        distributionId: "11.0-dxmt-signed-with-patches",
        executionContext: { loader: "/wine/bin/wine", prefix: "/prefix" },
        attributes: { renderBackend: "dxmt", winePath: "wine" },
      });
      vi.spyOn(Neutralino.filesystem, "getStats").mockImplementation(
        async path =>
          ({
            isFile: path !== "/prefix",
            isDirectory: path === "/prefix",
          } as never)
      );
      const actual = await vi.importActual<typeof import("./fps-bridge")>(
        "./fps-bridge"
      );
      vi.mocked(prepareFpsBridge).mockImplementationOnce(input =>
        actual.prepareFpsBridge(input, native.io)
      );
      vi.mocked(prepareR2Wine).mockImplementationOnce(async wine => ({
        ...wine,
        executionContext: {
          ...wine.executionContext,
          loader: "/prepared/bin/wine",
        },
      }));
      const running = drain(launchGameProgram(request));
      await vi.advanceTimersByTimeAsync(11000);
      expect(native.events).toContain("fps:60");
      expect(
        native.io.start.mock.calls.every(
          call => call[0].wine.loader === "/prepared/bin/wine"
        )
      ).toBe(true);
      expect(disposeR2Wine).not.toHaveBeenCalled();
      expect(patchCalls).toHaveLength(1);
      expect(patchCalls[0][3]).toMatchObject({ steamPatch: steam });
      expect(captured).toContain("/app/config.bat");
      expect(
        captured.includes("/prefix/drive_c/windows/system32/HoYoKProtect.sys")
      ).toBe(!steam);
      expect(files.get("/app/config.bat")).toContain(
        'copy "Z:\\game\\HoYoKProtect.sys"'
      );
      if (steam) expect(request.wine.exec).not.toHaveBeenCalled();
      else
        expect(request.wine.exec).toHaveBeenCalledWith(
          "cmd",
          ["/c", "Z:\\app\\config.bat"],
          {},
          "/dev/null"
        );
      expect(request.wine.exec2).not.toHaveBeenCalled();
      expect(launchOwnership.state().held).toBe(true);
      native.exit();
      native.stopped();
      native.direct.resolve({ confirmed: true, status: 0 });
      await vi.advanceTimersByTimeAsync(2000);
      await running;
      expect(files.has("/app/config.bat")).toBe(false);
      expect(launchOwnership.state().held).toBe(false);
    } finally {
      clock.mockRestore();
      vi.useRealTimers();
    }
  }
);
it("disabled command completion cannot release admission before its request-owned Wine wait", async () => {
  stored.set(FPS_UNLOCK_ENABLED_KEY, "false");
  const request = input(),
    command = deferred<void>(),
    wait = deferred<void>();
  vi.mocked(request.wine.exec2).mockImplementation(
    () => command.promise as unknown as ReturnType<Wine["exec2"]>
  );
  vi.mocked(request.wine.waitUntilServerOff)
    .mockImplementationOnce(async () => undefined as never)
    .mockImplementation(
      () => wait.promise as unknown as ReturnType<Wine["waitUntilServerOff"]>
    );
  const running = drain(launchGameProgram(request));
  await settle();
  expect(await GLOBAL_onClose(false)).toBe(false);
  expect(launchOwnership.reserve()).toBeUndefined();
  command.resolve();
  await settle();
  expect(await GLOBAL_onClose(false)).toBe(false);
  expect(files.has("/app/config.bat")).toBe(true);
  wait.resolve();
  await running;
  expect(await GLOBAL_onClose(false)).toBe(true);
  launchOwnership.cancelClose();
  expect(files.has("/app/config.bat")).toBe(false);
});

it("preserves registry execution failure when temporary-file removal also fails", async () => {
  stored.set(FPS_UNLOCK_ENABLED_KEY, "false");
  const request = input();
  request.config.hk4eEnableHDR = true;
  vi.mocked(request.wine.exec).mockRejectedValueOnce(Error("regedit denied"));
  vi.spyOn(Neutralino.filesystem, "removeFile").mockRejectedValueOnce(
    Error("temporary removal denied")
  );
  const error = await drain(launchGameProgram(request)).catch(error => error);
  expect(error.primary).toEqual(Error("regedit denied"));
  expect(error.cleanupErrors).toEqual([Error("temporary removal denied")]);
  expect(request.wine.exec2).not.toHaveBeenCalled();
  expect(launchOwnership.state().held).toBe(false);
});

it.each(
  [false, true].flatMap(fps =>
    [false, true].flatMap(block =>
      [60, 120].map(target => ({ fps, block, target }))
    )
  )
)(
  "composes saved FPS=$fps Launch Fix=$block target=$target through inert launch boundaries",
  async ({ fps, block, target }) => {
    vi.useFakeTimers();
    const clock = vi
      .spyOn(operationClock, "now")
      .mockImplementation(() => Date.now());
    try {
      stored.set(FPS_UNLOCK_ENABLED_KEY, String(fps));
      stored.set(FPS_UNLOCK_TARGET_KEY, String(target));
      stored.set("config_block_net", String(block));
      const request = input(),
        native = boundary(true),
        events: string[] = [];
      const ready = deferred<void>(),
        restored = deferred<void>();
      const fix = {
        start: vi.fn(async () => {
          events.push("block:start");
          await ready.promise;
          events.push("block:ready");
        }),
        finish: vi.fn(async () => {
          events.push("block:finish");
          await restored.promise;
          events.push("block:restored");
        }),
        errors: () => [],
      };
      request.config.steamPatch = true;
      request.config.blockNet = block;
      Object.assign(request.wine, {
        distributionId: "11.0-dxmt-signed-with-patches",
        executionContext: { loader: "/wine/bin/wine", prefix: "/prefix" },
        attributes: { renderBackend: "dxmt", winePath: "wine" },
      });
      vi.spyOn(Neutralino.filesystem, "getStats").mockImplementation(
        async path =>
          ({
            isFile: path !== "/prefix",
            isDirectory: path === "/prefix",
          } as never)
      );
      vi.mocked(createLaunchFix).mockReturnValue(fix);
      if (fps) {
        const actual = await vi.importActual<typeof import("./fps-bridge")>(
          "./fps-bridge"
        );
        native.io.start.mockImplementation(value => {
          if (value.args[0] !== "--registry") events.push("bridge:boot");
          return native.start(value);
        });
        vi.mocked(prepareFpsBridge).mockImplementationOnce(value =>
          actual.prepareFpsBridge(value, native.io)
        );
      }
      const running = drain(launchGameProgram(request));
      await vi.advanceTimersByTimeAsync(11000);
      if (block) {
        expect(fix.start).toHaveBeenCalledOnce();
        expect(request.wine.exec2).not.toHaveBeenCalled();
        expect(native.events).not.toContain("launch");
        expect(launchOwnership.state().held).toBe(true);
        expect(await GLOBAL_onClose(false)).toBe(false);
        if (fps) expect(events).toEqual(["bridge:boot", "block:start"]);
        ready.resolve();
        await vi.advanceTimersByTimeAsync(11000);
      } else expect(createLaunchFix).not.toHaveBeenCalled();
      if (fps) {
        expect(native.events).toContain(`fps:${target}`);
        expect(
          vi.mocked(prepareFpsBridge).mock.calls[0][0].gameDxmtConfig
        ).toBe(`d3d11.preferredMaxFrameRate=${target === 60 ? 60 : 0};`);
        expect(
          native.io.start.mock.calls.find(
            call => call[0].args[0] !== "--registry"
          )?.[0].wine.environment.DXMT_CONFIG
        ).toBe(`d3d11.preferredMaxFrameRate=${target};`);
        expect(request.wine.exec2).not.toHaveBeenCalled();
        native.exit();
        native.stopped();
        native.direct.resolve({ confirmed: true, status: 0 });
        await vi.advanceTimersByTimeAsync(2000);
      } else
        expect(request.wine.exec2).toHaveBeenCalledWith(
          "C:\\windows\\system32\\steam.exe",
          ["Z:\\game\\GenshinImpact.exe"],
          expect.objectContaining({
            DXMT_CONFIG: "d3d11.preferredMaxFrameRate=60;",
            WINE_ENABLE_TIMEOUT_FIX: "1",
          }),
          expect.any(String),
          true
        );
      if (block) {
        expect(fix.finish).toHaveBeenCalled();
        expect(launchOwnership.state().held).toBe(true);
        expect(files.has("/app/config.bat")).toBe(true);
        restored.resolve();
        await vi.advanceTimersByTimeAsync(100);
      }
      await running;
      expect(prepareR2Wine).toHaveBeenCalledTimes(fps ? 1 : 0);
      expect(disposeR2Wine).toHaveBeenCalledTimes(fps ? 1 : 0);
      expect(launchOwnership.state().held).toBe(false);
      expect(files.has("/app/config.bat")).toBe(false);
      expect(request.config.blockNet).toBe(block);
      expect(request.config.steamPatch).toBe(true);
      expect(stored.get(FPS_UNLOCK_ENABLED_KEY)).toBe(String(fps));
      expect(stored.get(FPS_UNLOCK_TARGET_KEY)).toBe(String(target));
      expect(stored.get("config_block_net")).toBe(String(block));
    } finally {
      clock.mockRestore();
      vi.useRealTimers();
    }
  }
);

it.each([false, true])(
  "Launch Fix readiness failure with FPS=%s never issues a game and retains cleanup ownership",
  async fps => {
    vi.useFakeTimers();
    const clock = vi
      .spyOn(operationClock, "now")
      .mockImplementation(() => Date.now());
    try {
      stored.set(FPS_UNLOCK_ENABLED_KEY, String(fps));
      stored.set(FPS_UNLOCK_TARGET_KEY, "60");
      const request = input(),
        native = boundary(true),
        restored = deferred<void>();
      const launchError = Error("block readiness failed");
      request.config.steamPatch = true;
      request.config.blockNet = true;
      Object.assign(request.wine, {
        distributionId: "11.0-dxmt-signed-with-patches",
        executionContext: { loader: "/wine/bin/wine", prefix: "/prefix" },
        attributes: { renderBackend: "dxmt", winePath: "wine" },
      });
      vi.spyOn(Neutralino.filesystem, "getStats").mockImplementation(
        async path =>
          ({
            isFile: path !== "/prefix",
            isDirectory: path === "/prefix",
          } as never)
      );
      vi.mocked(createLaunchFix).mockReturnValue({
        start: async () => {
          throw launchError;
        },
        finish: () => restored.promise,
        errors: () => [launchError],
      });
      if (fps) {
        const actual = await vi.importActual<typeof import("./fps-bridge")>(
          "./fps-bridge"
        );
        vi.mocked(prepareFpsBridge).mockImplementationOnce(value =>
          actual.prepareFpsBridge(value, native.io)
        );
      }
      const running = drain(launchGameProgram(request));
      const observed = running.catch(error => error);
      const rejected = expect(running).rejects.toThrow(
        "block readiness failed"
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(request.wine.exec2).not.toHaveBeenCalled();
      expect(native.events).not.toContain("launch");
      expect(launchOwnership.state().held).toBe(true);
      expect(files.has("/app/config.bat")).toBe(true);
      restored.resolve();
      native.direct.resolve({ confirmed: true, status: 0 });
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      expect((await observed).cleanupErrors).toEqual([]);
      expect((await observed).primary).toBe(launchError);
      expect(launchOwnership.state().held).toBe(false);
    } finally {
      clock.mockRestore();
      vi.useRealTimers();
    }
  }
);
