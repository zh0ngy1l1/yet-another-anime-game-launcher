/* Actual production bridge IO, supervisor, controller and journal. External game
 * preparation is a harmless file mutation. Never opens a real game or prefix. */
import { join, dirname } from "path-browserify";
import { launchFpsGame } from "../src/clients/mhy/hk4e/launch-fps-game";
import { admitFpsLaunch } from "../src/clients/mhy/hk4e/fps-admission";
import { prepareFpsBridge } from "../src/clients/mhy/hk4e/fps-bridge";
import { createLaunchJournal } from "../src/clients/mhy/hk4e/launch-journal";
import { createFpsUnlockSettings } from "../src/clients/mhy/hk4e/config/fps-unlock-settings";
import { launchOwnership } from "../src/launcher/launch-ownership";
import {
  exec,
  writeFile,
  readFile,
  GLOBAL_onClose,
  resolve,
} from "../src/utils/neu";
import type { Config } from "../src/config";
import type { Wine } from "../src/wine";
import type { Server } from "../src/constants";
Neutralino.init();
const root = window.NL_PATH.startsWith("/")
  ? window.NL_PATH
  : join(window.NL_CWD, window.NL_PATH);
const loader: unknown = Reflect.get(window, "NL_FPS_TEST_WINE");
const token: unknown = Reflect.get(window, "NL_FIXTURE_TOKEN");
const winePath = (path: string) => "Z:" + path.replaceAll("/", "\\");
async function main() {
  await Neutralino.events.on("windowClose", async () => {
    if (await GLOBAL_onClose(false)) await Neutralino.app.exit();
    else await writeFile(join(root, "close-veto"), "veto");
  });
  if (
    typeof loader !== "string" ||
    !loader.startsWith("/") ||
    typeof token !== "string" ||
    (await readFile(join(root, "fixture-authorization"))) !== token
  )
    throw new Error("Missing isolated fixture authorization");
  await Neutralino.window.show();
  await Neutralino.window.focus();
  const prefix = join(root, "prefix"),
    game = join(root, "game");
  const context = {
    loader,
    prefix,
    environment: {
      WINEDEBUG: "-all",
      WINEDLLOVERRIDES: "mscoree,mshtml=",
      FPS_FIXTURE_DIRECTORY: winePath(game),
      FPS_FIXTURE_DETACH:
        Reflect.get(window, "NL_FIXTURE_HANDOFF") === true ? "1" : "0",
    },
  };
  const wine = {
    executionContext: context,
    distributionId: "11.0-dxmt-signed-with-patches",
    attributes: { renderBackend: "dxmt", winePath: "wine" },
    prefix,
    waitUntilServerOff: () =>
      exec([join(dirname(loader), "wineserver"), "-w"], { WINEPREFIX: prefix }),
  } as unknown as Wine;
  const config = {
    hk4eEnableHDR: false,
    resolutionCustom: false,
    steamPatch: Reflect.get(window, "NL_FIXTURE_STEAM") === true,
  } as Config;
  const settings = await createFpsUnlockSettings(config);
  await settings.change({ enabled: true, target: "61" });
  const admitted = await admitFpsLaunch({
    config,
    wine,
    server: "hk4e_global",
    gameDir: game,
    gameExecutable: "GenshinImpact.exe",
  });
  if (!admitted) throw new Error("Fixture admission failed");
  await writeFile(join(root, "original-file"), "original");
  const transaction = launchFpsGame(
    {
      admitted,
      config,
      wine,
      server: { id: "hk4e_global" } as Server,
      registryResolution: false,
      environment: {
        DXMT_CONFIG: "d3d11.preferredMaxFrameRate=60;",
        KEEP: "kept",
      },
      async *resources() {},
      async setup(capture) {
        await capture(join(root, "original-file"));
        await writeFile(join(root, "original-file"), "changed");
      },
    },
    launchOwnership.claim(),
    {
      async bridge(input) {
        const bridge = await prepareFpsBridge(input);
        if (Reflect.get(window, "NL_FIXTURE_TAMPER_STEAM") === true) {
          // Alter only the exact private test artifact before any execution.
          const path = join(bridge.directory, "steam.exe");
          await exec(["/bin/chmod", "600", path]);
          await writeFile(
            path,
            "fixture replacement after verified acquisition"
          );
        }
        return bridge;
      },
      journal: createLaunchJournal,
      companion: {},
    }
  );
  let completed = false;
  const observer = setInterval(async () => {
    const state = launchOwnership.state();
    document.getElementById("state")!.textContent = JSON.stringify(
      state,
      null,
      2
    );
    await writeFile(join(root, "state.json"), JSON.stringify(state));
    if (!completed) {
      const duplicate = launchOwnership.reserve();
      if (duplicate) {
        duplicate.release();
        throw new Error("Duplicate fixture admission escaped");
      }
    }
    try {
      await readFile(join(root, "finish"));
      if (completed) await Neutralino.app.exit();
    } catch {
      /* no command */
    }
  }, 100);
  const error = await transaction.completion;
  completed = true;
  await writeFile(
    join(root, "result.json"),
    JSON.stringify({
      error: error ? String(error) : null,
      state: launchOwnership.state(),
      file: await readFile(join(root, "original-file")),
    })
  );
  // Keep a completed window until the driver records evidence and requests exit.
  void observer;
}
main().catch(async error => {
  document.getElementById("state")!.textContent = String(error);
  await writeFile(join(root, "fixture-error"), String(error));
});
