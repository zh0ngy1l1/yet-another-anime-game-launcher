import { createWindowSession } from "./window-session";
import { validateHk4eExecutable } from "./window-state";
import { createLaunchJournal } from "./launch-journal";
import { disposeR2Wine, prepareR2Wine } from "./prepare-r2";
import {
  launchOwnership,
  LaunchFailure,
} from "../../../launcher/launch-ownership";
import { admitFpsLaunch } from "./fps-admission";
import { launchFpsGame } from "./launch-fps-game";
import { createLaunchFix } from "./launch-fix";
import { hk4eWineDebug } from "./launch-diagnostics";
import { join } from "path-browserify";
import { CommonUpdateProgram } from "../../../common-update-ui";
import { Server } from "../../../constants";
import {
  mkdirp,
  removeFile,
  writeFile,
  resolve,
  log,
  exec,
  utf16le,
  writeBinary,
  getKeyOrDefault,
  setKey,
} from "../../../utils";
import { Wine } from "../../../wine";
import { Config } from "@config";
import { patchProgram } from "../patch";
import { prepareReshadeConfiguration } from "../../../downloadable-resource";
import hk4eHDRGlobalReg from "../../../constants/hk4e_hdr_os.reg?raw";
import hk4eHDRCnReg from "../../../constants/hk4e_hdr_cn.reg?raw";

const HDR_REGISTRY_FILES = {
  hk4e_global: hk4eHDRGlobalReg,
  hk4e_cn: hk4eHDRCnReg,
} as const;

async function withRegistryTemporary(
  path: string,
  apply: () => Promise<unknown>
) {
  let primary: unknown;
  try {
    await apply();
  } catch (error) {
    primary = error;
  }
  try {
    await removeFile(path);
  } catch (error) {
    if (primary !== undefined)
      throw new LaunchFailure(String(primary), primary, [error]);
    throw error;
  }
  if (primary !== undefined) throw primary;
}

async function applyHDRRegistry({
  wine,
  server,
}: {
  wine: Wine;
  server: Server;
}) {
  const regContent =
    HDR_REGISTRY_FILES[server.id as keyof typeof HDR_REGISTRY_FILES];
  if (!regContent) return;

  const regPath = resolve("./hk4e_enable_hdr.reg");
  await writeFile(regPath, regContent);
  await withRegistryTemporary(regPath, () =>
    wine.exec("regedit", [wine.toWinePath(regPath)], {}, "/dev/null")
  );
}

async function* launchGameDisabledProgram(
  {
    gameDir,
    gameExecutable,
    wine,
    config,
    server,
  }: {
    gameDir: string;
    gameExecutable: string;
    wine: Wine;
    config: Config;
    server: Server;
  },
  owner: ReturnType<typeof launchOwnership.claim>,
  signal: AbortSignal,
  windowSession: Awaited<ReturnType<typeof createWindowSession>>
): CommonUpdateProgram {
  const result = await exec([
    "/usr/bin/mktemp",
    "-d",
    "/tmp/yaagl-launch.XXXXXXXXXX",
  ]);
  const directory = result.stdOut.replace(/\n$/, "");
  if (!/^\/tmp\/yaagl-launch\.[A-Za-z0-9]{10}$/.test(directory))
    throw new Error("Unknown launch journal directory");
  const journal = createLaunchJournal(directory);
  const launchFix = config.blockNet
    ? createLaunchFix(server.id, owner.problem)
    : undefined;
  let originalPatched = "NOTFOUND",
    patchedStateOwned = false,
    hdr = false,
    normalExit = false;
  let primary: unknown;
  const secondary: unknown[] = [];
  const check = () => {
    if (signal.aborted)
      throw new Error("Launch cancelled before game creation");
  };
  let registryDone = false,
    filesDone = false,
    journalDone = false;
  async function waitWine() {
    const timer = setTimeout(
      () =>
        owner.problem(
          `Wine lifetime/cleanup remains pending; close and launch stay blocked. Journal: ${directory}`
        ),
      30000
    );
    try {
      await wine.waitUntilServerOff();
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    yield ["setUndeterminedProgress"];
    yield ["setStateText", "PATCHING"];
    originalPatched = await getKeyOrDefault("patched", "NOTFOUND");
    await journal.capture(resolve("winedrv_config.bat"));
    await wine.setProps(config);
    await windowSession.prepare();
    if (config.hk4eEnableHDR) {
      await journal.capture(resolve("hk4e_enable_hdr.reg"));
      await journal.capture(resolve("hk4e_revert_hdr.reg"));
      hdr = true;
      await applyHDRRegistry({ wine, server });
    }
    await waitWine();
    const cmd = `@echo off
cd "%~dp0"
copy "${wine.toWinePath(
      join(gameDir, atob("SG9Zb0tQcm90ZWN0LnN5cw=="))
    )}" "%WINDIR%\\system32\\"
cd /d "${wine.toWinePath(gameDir)}"
"${wine.toWinePath(
      join(gameDir, gameExecutable)
    )}" -platform_type CLOUD_THIRD_PARTY_PC -is_cloud 1`;
    await journal.capture(resolve("config.bat"));
    await journal.capture(
      join(
        wine.prefix,
        "drive_c/windows/system32",
        atob("SG9Zb0tQcm90ZWN0LnN5cw==")
      )
    );
    await writeFile(resolve("config.bat"), cmd);
    patchedStateOwned = true;
    yield* patchProgram(gameDir, wine, server, config, journal.capture);
    await mkdirp(resolve("./logs"));
    yield ["setStateText", "GAME_RUNNING"];
    const logfile = resolve(`./logs/game_${Date.now()}.log`);
    void log(
      `HK4E disabled request ${directory}: Steam Patch=${
        config.steamPatch
      }; Launch Fix=${config.blockNet === true}; Wine output: ${logfile}`
    ).catch(() => undefined);
    check();
    await launchFix?.start();
    check();

    await wine.exec2(
      config.steamPatch ? "C:\\windows\\system32\\steam.exe" : "cmd",
      config.steamPatch
        ? [wine.toWinePath(join(gameDir, gameExecutable))]
        : ["/c", `${wine.toWinePath(resolve("./config.bat"))} `],
      { ...gameEnvironment(wine, config), ...windowSession.environment },
      logfile,
      true
    );
    normalExit = true;
  } catch (error) {
    primary = error;
  } finally {
    // No yields in cleanup: an async-generator return may consume only one
    // value from finally. A request-bound Wine wait also follows command error.
    for (;;) {
      const errors: unknown[] = [];
      try {
        await launchFix?.finish();
        owner.phase("Waiting for Wine before restoring launch files");
        await waitWine();
        await windowSession.finish(normalExit);
        if (!registryDone) {
          if (hdr)
            try {
              await revertHDRRegistry({ wine, server });
              hdr = false;
            } catch (error) {
              errors.push(error);
            }
          await waitWine();
          registryDone = !hdr;
        }
        if (!filesDone) {
          const restored = await journal.restore();
          errors.push(...restored);
          if (!restored.length) {
            if (patchedStateOwned)
              await setKey(
                "patched",
                originalPatched === "NOTFOUND" ? null : originalPatched
              );
            filesDone = true;
          }
        }
        if (!errors.length) {
          if (!journalDone) {
            await journal.dispose();
            journalDone = true;
          }
          await exec(["/bin/rmdir", "--", directory]);
          break;
        }
      } catch (error) {
        errors.push(error);
      }
      secondary.push(...errors);
      await owner.waitForRetry(
        `Launch cleanup failed; retained ${directory}. ${errors
          .map(String)
          .join("; ")}`
      );
    }
  }
  void log(
    `HK4E disabled request ${directory}: Wine wait, registry/file restoration and journal cleanup completed`
  ).catch(() => undefined);
  const observations = (launchFix?.errors() ?? []).filter(
    error =>
      String(error) !== String(primary) &&
      !secondary.some(previous => String(previous) === String(error))
  );
  if (primary !== undefined || secondary.length || observations.length)
    throw new LaunchFailure(
      String(primary ?? observations[0] ?? secondary[0]),
      primary,
      secondary,
      observations
    );
}

async function revertHDRRegistry({
  wine,
  server,
}: {
  wine: Wine;
  server: Server;
}) {
  let key = "HKEY_CURRENT_USER\\Software\\\x6d\x69\x48\x6f\x59\x6f\\";
  if (server.id === "hk4e_cn") {
    key += "\u539f\u795e";
  } else if (server.id === "hk4e_global") {
    key += "\x47\x65\x6e\x73\x68\x69\x6e\x20\x49\x6d\x70\x61\x63\x74";
  } else {
    return;
  }

  const reg = [
    `Windows Registry Editor Version 5.00`,
    ``,
    `[${key}]`,
    `"WINDOWS_HDR_ON_h3132281285"=-`,
  ];

  const path = resolve("./hk4e_revert_hdr.reg");
  await writeBinary(path, utf16le(reg.join("\r\n")));
  await withRegistryTemporary(path, () =>
    wine.exec("regedit", [wine.toWinePath(path)], {}, "/dev/null")
  );
}

export function gameEnvironment(
  wine: Wine,
  config: Config
): Record<string, string> {
  const yaaglDir = resolve("./");
  return {
    WINEDEBUG: hk4eWineDebug(wine.executionContext?.environment?.WINEDEBUG),
    MTL_HUD_ENABLED: config.metalHud ? "1" : "",
    WINEDLLOVERRIDES: "",
    WINE_ENABLE_TIMEOUT_FIX: config.timeoutFix ? "1" : "0",
    ...(wine.attributes.renderBackend == "dxmt"
      ? {
          WINEESYNC: "1",
          DXMT_LOG_PATH: yaaglDir,
          DXMT_CONFIG: "d3d11.preferredMaxFrameRate=60;",
          DXMT_CONFIG_FILE: join(yaaglDir, "dxmt.conf"),
          GST_PLUGIN_FEATURE_RANK: "atdec:MAX,avdec_h264:MAX",
        }
      : {
          WINEESYNC: "1",
        }),
    ...(config.proxyEnabled
      ? {
          HTTP_PROXY: config.proxyHost,
          HTTPS_PROXY: config.proxyHost,
        }
      : {}),
  };
}

async function* ownedLaunchGameProgram(
  input: {
    gameDir: string;
    gameExecutable: string;
    wine: Wine;
    config: Config;
    server: Server;
  },
  resources: (enabledFps?: boolean) => CommonUpdateProgram,
  signal: AbortSignal
): CommonUpdateProgram {
  const owner = launchOwnership.claim();
  input = { ...input, config: { ...input.config } };
  let delegated = false;
  let preparedRuntime: Wine | undefined;
  let windowSession:
    | Awaited<ReturnType<typeof createWindowSession>>
    | undefined;
  try {
    validateHk4eExecutable(input.server.id, input.gameExecutable);
    const admission = await admitFpsLaunch({
      ...input,
      server: input.server.id,
    });
    if (signal.aborted) throw new Error("Launch cancelled before preparation");
    if (admission || input.config.hk4eNativeFullscreen) {
      preparedRuntime = await prepareR2Wine(input.wine, {
        fps: !!admission,
        fullscreen: input.config.hk4eNativeFullscreen === true,
      });
      input = { ...input, wine: preparedRuntime };
    }
    windowSession = await createWindowSession(input);
    const controls = windowSession;
    if (!admission) {
      yield* resources();
      yield* launchGameDisabledProgram(input, owner, signal, controls);
      return;
    }
    const admitted = { ...admission, wine: input.wine.executionContext };
    if (signal.aborted)
      throw new Error("Launch cancelled after R2 preparation");
    const { gameDir, gameExecutable, wine, config, server } = input;
    const transaction = launchFpsGame(
      {
        admitted,
        wine,
        config,
        server,
        resources,
        finishRuntime: () => disposeR2Wine(wine),
        environment: {
          ...gameEnvironment(wine, config),
          ...controls.environment,
        },
        registryResolution: false,
        finishWindowControls: normal => controls.finish(normal),
        launchFix: config.blockNet
          ? createLaunchFix(server.id, owner.problem)
          : undefined,
        async setup(capture, progress) {
          progress(["setUndeterminedProgress"]);
          progress(["setStateText", "PATCHING"]);
          await capture(resolve("winedrv_config.bat"));
          await wine.setProps(config);
          await controls.prepare();
          if (config.hk4eEnableHDR) {
            await capture(resolve("hk4e_enable_hdr.reg"));
            await applyHDRRegistry({ wine, server });
          }
          await wine.waitUntilServerOff();
          if (config.reshade) {
            await capture(join(gameDir, "ReShade.ini"));
            await prepareReshadeConfiguration(wine, gameDir);
          }
          await capture(resolve("config.bat"));
          const protection = atob("SG9Zb0tQcm90ZWN0LnN5cw==");
          if (!admitted.steamPatch)
            await capture(
              join(wine.prefix, "drive_c/windows/system32", protection)
            );
          // Preparation retains the upstream route's protection-file copy. The
          // Steam route delegates creation to the signed shim inside owned jobs.
          await writeFile(
            resolve("config.bat"),
            `@echo off
cd "%~dp0"
copy "${wine.toWinePath(join(gameDir, protection))}" "%WINDIR%\\system32\\"`
          );
          for await (const command of patchProgram(
            gameDir,
            wine,
            server,
            config,
            capture
          ))
            progress(command);
          // The upstream Steam route writes but does not execute config.bat.
          if (!admitted.steamPatch)
            await wine.exec(
              "cmd",
              ["/c", wine.toWinePath(resolve("config.bat"))],
              {},
              "/dev/null"
            );
          await wine.waitUntilServerOff();
          await log(
            `FPS launch selected ${gameExecutable}; Steam Patch=${
              admitted.steamPatch
            }; ${
              admitted.steamPatch
                ? "signed Steam creates the game; the request bridge validates and retains its child handle"
                : "the request bridge creates the game suspended"
            }`
          );
        },
      },
      owner
    );
    delegated = true;
    signal.addEventListener("abort", transaction.cancel, { once: true });
    if (signal.aborted) transaction.cancel();
    try {
      yield* transaction.program();
    } finally {
      signal.removeEventListener("abort", transaction.cancel);
    }
  } catch (error) {
    if (!delegated) owner.problem(String(error));
    throw error instanceof LaunchFailure
      ? error
      : new LaunchFailure(String(error), error);
  } finally {
    if (!delegated) {
      await windowSession?.finish(false);
      if (preparedRuntime) await disposeR2Wine(preparedRuntime);
      owner.finish();
    }
  }
}

/** Async-generator return normally queues behind a pending next()/await. Record
 * cancellation synchronously so readiness cannot resume into game creation. */
export function launchGameProgram(
  input: Parameters<typeof ownedLaunchGameProgram>[0],
  resources: (
    enabledFps?: boolean
  ) => CommonUpdateProgram = async function* () {
    /* Caller may have no resources to prepare. */
  }
): CommonUpdateProgram {
  const cancellation = new AbortController();
  const iterator = ownedLaunchGameProgram(
    input,
    resources,
    cancellation.signal
  );
  return {
    next: (...args) => iterator.next(...args),
    return(value) {
      cancellation.abort();
      return iterator.return(value);
    },
    throw(error) {
      cancellation.abort();
      return iterator.throw(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
