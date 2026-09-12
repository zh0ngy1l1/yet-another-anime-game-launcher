import { beforeEach, expect, it, vi } from "vitest";
import { launchGameProgram } from "./program-launch-game";
import { launchOwnership } from "../../../launcher/launch-ownership";
import { GLOBAL_onClose } from "../../../utils/neu";
import { deferred } from "../../../utils/operation";
import {
  FPS_UNLOCK_ENABLED_KEY,
  FPS_UNLOCK_TARGET_KEY,
} from "./config/fps-unlock-state";
import type { Config } from "../../../config";
import type { Wine } from "../../../wine";
import type { Server } from "../../../constants";
import { prepareFpsBridge } from "./fps-bridge";

vi.mock("./fps-bridge", () => ({
  prepareFpsBridge: vi.fn(() => {
    throw Error("unexpected FPS acquisition");
  }),
}));
vi.mock("./launch-journal", () => ({
  createLaunchJournal: () => ({
    capture: async () => undefined,
    restore: async () => {
      files.delete("/app/config.bat");
      return [];
    },
    dispose: async () => undefined,
  }),
}));
vi.mock("../patch", () => ({
  async *patchProgram() {
    /* File effects injected at this boundary. */
  },
  async *patchRevertProgram() {
    /* File effects injected at this boundary. */
  },
}));
const stored = new Map<string, string>();
const files = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  files.clear();
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    NL_OS: "Darwin",
    NL_VERSION: "4.11.0-yaagl-owned1",
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
