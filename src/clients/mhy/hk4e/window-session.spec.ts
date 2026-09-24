import { beforeEach, expect, it, vi } from "vitest";
import type { Config } from "../../../config";
import type { Wine } from "../../../wine";
import { createWindowSession, recoverWindowSession } from "./window-session";
import { startOwnedWineExecution } from "../../../wine/owned-execution";
import { exec } from "../../../utils";
import { stageFpsArtifact } from "./fps-artifact";
import manifestRaw from "../../../../native/window-state/manifest.json?raw";
const hash = JSON.parse(manifestRaw).sha256;
const directory = "/profile/window-state/window-0123456789";
const storage = new Map<string, string>();
const calls: string[] = [];
let state: string, commandFailure: string | undefined;
vi.mock("../../../utils", () => ({
  exec: vi.fn(async () => ({
    stdOut: "/profile/window-state/window-0123456789\n",
  })),
  getKeyOrDefault: vi.fn(
    async (key: string, fallback: string) => storage.get(key) ?? fallback
  ),
  setKey: vi.fn(async (key: string, value: string | null) => {
    if (value === null) storage.delete(key);
    else storage.set(key, value);
  }),
  log: vi.fn(async () => undefined),
  readFile: vi.fn(async () => state),
  resolve: (path: string) => path.replace(/^\.\//, "/profile/"),
}));
vi.mock("./fps-artifact", () => ({
  stageFpsArtifact: vi.fn(async () => directory + "/window-registry.exe"),
  fpsArtifactIO: { sha256: vi.fn(async () => hash) },
}));
vi.mock("../../../wine/owned-execution", () => ({
  startOwnedWineExecution: vi.fn((input: { args: string[] }) => {
    calls.push(input.args[0]);
    return {
      completion: Promise.resolve({
        confirmed: true,
        status: input.args[0] === commandFailure ? 5 : 0,
      }),
    };
  }),
}));
function input(fullscreen = true) {
  return {
    wine: {
      prefix: "/prefix",
      executionContext: {
        loader: "/runtime/bin/wine",
        prefix: "/prefix",
        environment: { WINEPREFIX: "/prefix" },
      },
      waitUntilServerOff: vi.fn(async () => {
        calls.push("wait");
      }),
    } as unknown as Wine,
    config: {
      hk4eNativeFullscreen: fullscreen,
      retina: false,
      resolutionCustom: false,
    } as Config,
    server: { id: "hk4e_global" },
    gameExecutable: "GenshinImpact.exe",
  };
}
beforeEach(() => {
  storage.clear();
  calls.length = 0;
  state = '{"schema":1,"width":1152,"height":648,"mode":0}';
  commandFailure = undefined;
  vi.clearAllMocks();
});
it("snapshots before apply and promotes the attributed window before exact rollback", async () => {
  const session = await createWindowSession(input());
  expect(session.environment).toEqual({
    YAAGL_WINDOW_STATE_EXE: "GenshinImpact.exe",
    YAAGL_WINDOW_STATE_FILE: directory + "/native.json",
  });
  await session.prepare();
  expect(calls).toEqual(["wait", "save", "apply", "wait"]);
  expect(storage.has("hk4e_window_controls_pending")).toBe(true);
  await session.finish(true);
  expect(calls.slice(4)).toEqual(["wait", "observe", "restore", "wait"]);
  expect(
    JSON.parse(storage.get("hk4e_window_size_hk4e_global") ?? "")
  ).toMatchObject({ width: 1152, height: 648, retina: false });
  expect(storage.has("hk4e_window_controls_pending")).toBe(false);
  await session.finish(true); // idempotent cleanup cannot recapture/overwrite
  expect(calls.filter(x => x === "restore")).toHaveLength(1);
});
it("ordinary window memory needs neither native support nor FPS", async () => {
  const session = await createWindowSession(input(false));
  expect(session.environment).toEqual({});
  await session.prepare();
  await session.finish(true);
  expect(storage.has("hk4e_window_size_hk4e_global")).toBe(true);
});
it.each([false, true])(
  "crash/cancellation never commits transient geometry (native=%s)",
  async native => {
    storage.set(
      "hk4e_window_size_hk4e_global",
      "retained malformed old record"
    );
    const session = await createWindowSession(input(native));
    await session.prepare();
    await session.finish(false);
    expect(storage.get("hk4e_window_size_hk4e_global")).toBe(
      "retained malformed old record"
    );
    expect(calls).not.toContain("observe");
    expect(calls).toContain("restore");
  }
);
it.each(["{}", '{"width":0,"height":0}', "corrupt"])(
  "does not infer size from malformed or missing native state %s",
  async raw => {
    state = raw;
    const session = await createWindowSession(input());
    await session.prepare();
    await session.finish(true);
    expect(storage.has("hk4e_window_size_hk4e_global")).toBe(false);
  }
);
it("ordinary borderless/fullscreen registry dimensions cannot replace windowed memory", async () => {
  state = '{"width":1512,"height":982,"mode":1}';
  const session = await createWindowSession(input(false));
  await session.prepare();
  await session.finish(true);
  expect(storage.has("hk4e_window_size_hk4e_global")).toBe(false);
});
it("partial apply and retry restore the original snapshot without saving again", async () => {
  commandFailure = "apply";
  const session = await createWindowSession(input());
  await expect(session.prepare()).rejects.toThrow("apply failed");
  commandFailure = "restore";
  await expect(session.finish(false)).rejects.toThrow("restore failed");
  expect(storage.has("hk4e_window_controls_pending")).toBe(true);
  commandFailure = undefined;
  await session.finish(false);
  expect(calls.filter(x => x === "save")).toHaveLength(1);
});
it("startup drains the retained runtime and restores, without promoting interrupted geometry", async () => {
  const request = input();
  const session = await createWindowSession(request);
  await session.prepare();
  await expect(createWindowSession(request)).rejects.toThrow(
    "recovery is pending"
  );
  await recoverWindowSession(request.wine);
  expect(calls).not.toContain("observe");
  expect(calls.filter(x => x === "restore")).toHaveLength(1);
  expect(storage.has("hk4e_window_controls_pending")).toBe(false);
  expect(exec).toHaveBeenCalledWith(["/runtime/bin/wineserver", "-w"], {
    WINEPREFIX: "/prefix",
  });
});
it("startup with a durable restored marker skips removed helper artifacts", async () => {
  storage.set(
    "hk4e_window_controls_pending",
    JSON.stringify({
      schema: 1,
      directory,
      server: "hk4e_global",
      context: input().wine.executionContext,
      options: ["1", "0", "0", "0"],
      restored: true,
      saved: true,
    })
  );
  await recoverWindowSession(input().wine);
  expect(startOwnedWineExecution).not.toHaveBeenCalled();
});
it("wrong server/executable is rejected before artifact or registry activity", async () => {
  await expect(
    createWindowSession({ ...input(), gameExecutable: "YuanShen.exe" })
  ).rejects.toThrow("exact HK4E executable");
  expect(stageFpsArtifact).not.toHaveBeenCalled();
  expect(startOwnedWineExecution).not.toHaveBeenCalled();
});

it("save failure discards only an unapplied transaction", async () => {
  commandFailure = "save";
  const session = await createWindowSession(input());
  await expect(session.prepare()).rejects.toThrow("save failed");
  expect(
    JSON.parse(storage.get("hk4e_window_controls_pending") ?? "").saved
  ).toBe(false);
  commandFailure = undefined;
  await session.finish(false);
  expect(calls).toContain("discard");
  expect(calls).not.toContain("apply");
  expect(calls).not.toContain("restore");
});
it("startup retains an applied transaction when its original snapshot cannot be restored", async () => {
  const request = input();
  const session = await createWindowSession(request);
  await session.prepare();
  expect(
    JSON.parse(storage.get("hk4e_window_controls_pending") ?? "").saved
  ).toBe(true);
  commandFailure = "restore";
  await expect(recoverWindowSession(request.wine)).rejects.toThrow(
    "restore failed"
  );
  expect(storage.has("hk4e_window_controls_pending")).toBe(true);
  expect(calls).not.toContain("discard");
});
it("an unknown saved phase cannot be interpreted as permission to discard a snapshot", async () => {
  const request = input();
  const session = await createWindowSession(request);
  await session.prepare();
  const record = JSON.parse(storage.get("hk4e_window_controls_pending") ?? "");
  delete record.saved;
  storage.set("hk4e_window_controls_pending", JSON.stringify(record));
  await expect(recoverWindowSession(request.wine)).rejects.toThrow(
    "Unrecognized window controls"
  );
  expect(calls).not.toContain("discard");
  expect(storage.has("hk4e_window_controls_pending")).toBe(true);
});
