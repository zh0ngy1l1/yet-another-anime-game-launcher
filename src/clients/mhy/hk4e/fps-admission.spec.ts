import { beforeEach, describe, expect, it, vi } from "vitest";
import { admitFpsLaunch } from "./fps-admission";
import { createFpsUnlockSettings } from "./config/fps-unlock-settings";
import {
  FPS_UNLOCK_ENABLED_KEY,
  FPS_UNLOCK_TARGET_KEY,
} from "./config/fps-unlock-state";
import type { Wine } from "../../../wine";
import type { Config } from "../../../config";
import { deferred } from "../../../utils/operation";
const stored = new Map<string, string>();
const setData = vi.fn(async (key: string, value: string) => {
  stored.set(key, value);
});
const native = { os: "Darwin", version: "4.11.0-yaagl-owned1" } as const;
function input() {
  return {
    server: "hk4e_global",
    gameDir: "/game",
    gameExecutable: "GenshinImpact.exe",
    config: {} as Config,
    wine: {
      distributionId: "11.0-dxmt-signed-with-patches",
      attributes: { renderBackend: "dxmt", winePath: "wine" },
      executionContext: {
        loader: "/selected/wine64",
        prefix: "/prefix",
        environment: { KEEP: "yes" },
      },
    } as unknown as Wine,
  };
}
beforeEach(() => {
  stored.clear();
  setData.mockClear();
  vi.stubGlobal("Neutralino", {
    filesystem: {
      getStats: async (path: string) => ({
        isFile: path !== "/prefix",
        isDirectory: path === "/prefix",
      }),
    },
    storage: {
      getData: async (key: string) => {
        if (!stored.has(key)) throw { code: "NE_ST_NOSTKEX" };
        return stored.get(key);
      },
      setData,
    },
  });
});

describe("persisted settings to FPS admission", () => {
  it.each(["", "garbage", "0", "361", "12.5"])(
    "disabled retains %j without runtime prerequisites or writes",
    async target => {
      stored.set(FPS_UNLOCK_ENABLED_KEY, "false");
      stored.set(FPS_UNLOCK_TARGET_KEY, target);
      const request = input();
      request.config.steamPatch = true;
      request.wine.attributes = {};
      expect(
        await admitFpsLaunch(request, { os: "Linux", version: "old" })
      ).toBeUndefined();
      expect(setData).not.toHaveBeenCalled();
    }
  );
  it.each([
    ["1", 1],
    ["60", 60],
    ["61", 0],
    ["061", 0],
    ["120", 0],
    ["360", 0],
  ])(
    "consumes target %s from storage without normalization",
    async (target, game) => {
      stored.set(FPS_UNLOCK_ENABLED_KEY, "true");
      stored.set(FPS_UNLOCK_TARGET_KEY, String(target));
      const result = await admitFpsLaunch(input(), native);
      expect(result?.plan.gameDxmtConfig).toBe(
        `d3d11.preferredMaxFrameRate=${game};`
      );
      expect(result?.plan.companion).toEqual({
        fpsArgument: Number(target),
        dxmtConfig: `d3d11.preferredMaxFrameRate=${Number(target)};`,
      });
      expect(result?.wine.loader).toBe("/selected/wine64");
      expect(setData).not.toHaveBeenCalled();
    }
  );
  it.each(["", "0", "361", "1e2", "120fps", " 120", "120.0"])(
    "rejects invalid enabled %j",
    async target => {
      stored.set(FPS_UNLOCK_ENABLED_KEY, "true");
      stored.set(FPS_UNLOCK_TARGET_KEY, target);
      await expect(admitFpsLaunch(input(), native)).rejects.toThrow(
        "Invalid enabled Target FPS"
      );
      expect(setData).not.toHaveBeenCalled();
    }
  );
  it.each([
    "backend",
    "distribution",
    "capability",
    "steam",
    "network",
    "region",
    "executable",
    "loader",
    "prefix",
    "directory",
    "native",
  ])("rejects unsupported %s before acquisition/mutation", async field => {
    stored.set(FPS_UNLOCK_ENABLED_KEY, "true");
    stored.set(FPS_UNLOCK_TARGET_KEY, "120");
    const request = input();
    if (field === "backend") request.wine.attributes.renderBackend = undefined;
    if (field === "distribution")
      request.wine = { ...request.wine, distributionId: "unverified" };
    if (field === "capability") request.wine.attributes.winePath = undefined;
    if (field === "steam") request.config.steamPatch = true;
    if (field === "network") request.config.blockNet = true;
    if (field === "region") request.server = "hoyoplay";
    if (field === "executable") request.gameExecutable = "another.exe";
    if (field === "loader" || field === "prefix")
      request.wine = {
        ...request.wine,
        executionContext: {
          ...request.wine.executionContext,
          [field]: "relative",
        },
      };
    if (field === "directory") request.gameDir = "/";
    await expect(
      admitFpsLaunch(
        request,
        field === "native" ? { ...native, version: "4.11.0" } : native
      )
    ).rejects.toThrow();
  });
  it("waits for pending immediate persistence and reads the saved pair", async () => {
    const request = input();
    const settings = await createFpsUnlockSettings(request.config);
    const barrier = deferred<void>();
    setData.mockImplementationOnce(async (key, value) => {
      await barrier.promise;
      stored.set(key, value);
    });
    const saving = settings.change({ enabled: true, target: "061" });
    let admitted = false;
    const admission = admitFpsLaunch(request, native).then(result => {
      admitted = true;
      return result;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    barrier.resolve();
    await saving;
    expect((await admission)?.plan.companion?.fpsArgument).toBe(61);
  });
  it("an invalid unsaved enabled draft cannot use the previous valid saved target", async () => {
    stored.set(FPS_UNLOCK_ENABLED_KEY, "true");
    stored.set(FPS_UNLOCK_TARGET_KEY, "120");
    const request = input();
    const settings = await createFpsUnlockSettings(request.config);
    await settings.change({ enabled: true, target: "0" });
    await expect(admitFpsLaunch(request, native)).rejects.toThrow(
      "Invalid enabled"
    );
    expect(stored.get(FPS_UNLOCK_TARGET_KEY)).toBe("120");
  });
});

it.each(["/game/GenshinImpact.exe", "/selected/wine64", "/prefix"])(
  "rejects a missing identity prerequisite %s before enabled preparation",
  async missing => {
    stored.set(FPS_UNLOCK_ENABLED_KEY, "true");
    stored.set(FPS_UNLOCK_TARGET_KEY, "120");
    await expect(
      admitFpsLaunch(input(), native, async path => {
        if (path === missing) throw Error("missing prerequisite " + path);
        return { isFile: path !== "/prefix", isDirectory: path === "/prefix" };
      })
    ).rejects.toThrow("missing prerequisite");
  }
);
