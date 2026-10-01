import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Aria2 } from "./aria2";
import { env } from "./utils";

vi.mock("./utils", () => ({
  env: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function updater(local: boolean, version = "1.0.0", channel = "hk4eos") {
  // Vitest 0.29 maps import.meta.env onto process.env, whose native setter
  // coerces booleans to strings. Preserve Vite's literal boolean in this copy.
  vi.stubGlobal("process", {
    ...process,
    env: {
      ...process.env,
      YAAGL_LOCAL_BUILD: local,
      YAAGL_VERSION: version,
      YAAGL_CHANNEL_CLIENT: channel,
    },
  });
  return (await import("./updater")).createUpdater;
}

function dependencies() {
  return {
    github: {
      api: vi.fn(),
      acceleratedPath: vi.fn((value: string) => value),
    },
    aria2: {} as Aria2,
  };
}

it.each(["development", "1.0.0", "custom-commit"])(
  "requires a complete bundle for local build version %s without querying upstream",
  async version => {
    const createUpdater = await updater(true, version);
    const deps = dependencies();
    await expect(createUpdater(deps)).resolves.toEqual({
      latest: true,
      manualUpdate: true,
    });
    expect(deps.github.api).not.toHaveBeenCalled();
    expect(env).not.toHaveBeenCalled();
  }
);

it("keeps the upstream resource and sidecar offer for a newer stock release", async () => {
  const createUpdater = await updater(false);
  const deps = dependencies();
  deps.github.api.mockResolvedValue({
    tag_name: "1.1.0",
    body: "Release details",
    assets: [
      {
        name: "resources_hk4eos.neu",
        browser_download_url: "https://fixture.invalid/resources_hk4eos.neu",
      },
      {
        name: "Yaagl.OS.app.tar.gz",
        browser_download_url: "https://fixture.invalid/Yaagl.OS.app.tar.gz",
      },
    ],
  });
  await expect(createUpdater(deps)).resolves.toEqual({
    latest: false,
    downloadUrl: "https://fixture.invalid/resources_hk4eos.neu",
    sidecarDownloadUrl: "https://fixture.invalid/Yaagl.OS.app.tar.gz",
    version: "1.1.0",
    description: "Release details",
  });
  expect(deps.github.api).toHaveBeenCalledWith(
    "/repos/3shain/yet-another-anime-game-launcher/releases/latest"
  );
});

it("preserves an unknown result when the stock update check fails", async () => {
  const createUpdater = await updater(false);
  const deps = dependencies();
  deps.github.api.mockRejectedValue(new Error("network unavailable"));
  await expect(createUpdater(deps)).resolves.toEqual({ latest: undefined });
  expect(deps.github.api).toHaveBeenCalledTimes(1);
});

it("keeps the stock development skip without marking it as a custom bundle", async () => {
  const createUpdater = await updater(false, "development");
  const deps = dependencies();
  await expect(createUpdater(deps)).resolves.toEqual({ latest: true });
  expect(deps.github.api).not.toHaveBeenCalled();
  expect(env).not.toHaveBeenCalled();
});
