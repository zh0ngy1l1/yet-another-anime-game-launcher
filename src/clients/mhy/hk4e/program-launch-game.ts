import { errorMessage, logDiagnostic } from "../../../utils/errors";
import { createWindowSession } from "./window-session";
import { admitGameMode } from "./game-mode";
import { validateHk4eExecutable } from "./window-state";
import { createLaunchJournal } from "./launch-journal";
import { disposeR2Wine, prepareR2Wine } from "./prepare-r2";
import {
  launchOwnership,
  LaunchFailure,
} from "../../../launcher/launch-ownership";
import { admitFpsLaunch } from "./fps-admission";
import { launchFpsGame } from "./launch-fps-game";
import { FpsBridgePreparationFailure, prepareFpsBridge } from "./fps-bridge";
import { createLaunchFix } from "./launch-fix";
import { hk4eWineDebug } from "./launch-diagnostics";
import { createLaunchTiming, LaunchTiming } from "./launch-timing";
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
  windowSession: Awaited<ReturnType<typeof createWindowSession>>,
  timing: LaunchTiming,
  prepared: () => void,
  preparationStopped: (cancelled: boolean) => void
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
  let bridge: Awaited<ReturnType<typeof prepareFpsBridge>> | undefined;
  let preparationRecovery: (() => Promise<void>) | undefined;
  let launchIssued = false,
    observedExit = false,
    bridgeReleased = false,
    bridgeDisposed = false;
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
        void log(
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
    await timing.measure("wine-properties", () => wine.setProps(config));
    await timing.measure("window-registry-prepare", () =>
      windowSession.prepare()
    );
    if (config.hk4eEnableHDR) {
      await journal.capture(resolve("hk4e_enable_hdr.reg"));
      await journal.capture(resolve("hk4e_revert_hdr.reg"));
      hdr = true;
      await timing.measure("hdr-registry", () =>
        applyHDRRegistry({ wine, server })
      );
    }
    await timing.measure("wine-wait-before-files", waitWine);
    const cmd = `@echo off
cd "%~dp0"
copy "${wine.toWinePath(
      join(gameDir, atob("SG9Zb0tQcm90ZWN0LnN5cw=="))
    )}" "%WINDIR%\\system32\\"`;
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
    yield* timing.program(
      "patch-files",
      patchProgram(gameDir, wine, server, config, journal.capture)
    );
    await mkdirp(resolve("./logs"));
    const logfile = resolve(`./logs/game_${Date.now()}.log`);
    void log(
      `HK4E disabled request ${directory}: Steam Patch=${
        config.steamPatch
      }; Launch Fix=${config.blockNet === true}; Wine output: ${logfile}`
    ).catch(() => undefined);
    check();
    // Keep the ordinary route's protection copy, but let the existing bridge
    // attribute the actual game and retain its handle/jobs. No FPS worker or
    // FPS registry operations are requested on this path.
    if (!config.steamPatch)
      await timing.measure("protection-copy-helper", () =>
        wine.exec(
          "cmd",
          ["/c", wine.toWinePath(resolve("config.bat"))],
          {},
          "/dev/null"
        )
      );
    await timing.measure("wine-wait-setup", waitWine);
    const environment = {
      ...gameEnvironment(wine, config),
      ...windowSession.environment,
    };
    try {
      bridge = await timing.measure("game-observer-artifacts", () =>
        prepareFpsBridge({
          wine: {
            ...wine.executionContext,
            environment: {
              ...wine.executionContext.environment,
              ...environment,
            },
          },
          executable: join(gameDir, gameExecutable),
          steamPatch: config.steamPatch,
          gameDirectory: gameDir,
          gameDxmtConfig: environment.DXMT_CONFIG ?? "",
          log: logfile,
          diagnostic: text => {
            void log(text).catch(() => undefined);
          },
          event: text => {
            void log(text).catch(() => undefined);
          },
          running: owner.running,
          ended: owner.ended,
          gameFailure: (text, known) => {
            if (known) {
              primary ??= new Error(text);
              owner.problem(
                "The game exited unexpectedly. See the launch log for details."
              );
            } else
              owner.warning(
                "The game has exited, but the launcher could not determine its exit status. See the launch log for details."
              );
          },
        })
      );
    } catch (error) {
      if (error instanceof FpsBridgePreparationFailure)
        preparationRecovery = error.retryCleanup;
      throw error;
    }
    timing.emit({ event: "bridge-identity", token: bridge.token });
    check();
    await timing.measure("wine-bridge-boot-ready", () => bridge!.boot());
    check();
    await timing.measure("launch-fix-ready", async () => launchFix?.start());
    check();

    prepared();
    launchIssued = true; // A failed acknowledgement can still have created a game.
    await bridge.launch();
    await bridge.waitForGameExit();
    observedExit = true;
    normalExit = bridge.normalGameExit();
  } catch (error) {
    primary = error;
  } finally {
    preparationStopped(signal.aborted);
    // No yields in cleanup: an async-generator return may consume only one
    // value from finally. A request-bound Wine wait also follows command error.
    for (;;) {
      const errors: unknown[] = [];
      try {
        if (bridge && !bridgeReleased) {
          if (launchIssued) {
            if (!observedExit) {
              await bridge.waitForGameExit();
              observedExit = true;
              normalExit = bridge.normalGameExit();
            }
            owner.ended();
            await bridge.release();
          } else await bridge.discardBeforeLaunch();
          bridgeReleased = true;
        }
        if (preparationRecovery) {
          await preparationRecovery();
          preparationRecovery = undefined;
        }
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
          if (bridge && !bridgeDisposed) {
            await bridge.dispose();
            bridgeDisposed = true;
          }
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
      errors.forEach(logDiagnostic);
      await owner.waitForRetry(
        `The launcher could not finish restoring settings or files. Closing and another launch are blocked. Address the reported problem, then retry cleanup. ${errors
          .map(errorMessage)
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
  secondary.forEach(logDiagnostic);
  if (primary !== undefined || observations.length)
    throw new LaunchFailure(
      errorMessage(primary ?? observations[0]),
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
  signal: AbortSignal,
  timing: LaunchTiming
): CommonUpdateProgram {
  const owner = launchOwnership.claim();
  input = { ...input, config: { ...input.config } };
  const preparation = timing.begin("preparation");
  timing.emit({ event: "ui-phase", phase: "Preparing launch" });
  const preparationStopped = (cancelled: boolean) =>
    preparation(cancelled ? "cancelled" : "error");
  const prepared = () => {
    timing.emit({ event: "game-execution-boundary" });
    preparation();
  };
  timing.emit({
    event: "settings",
    server: input.server.id,
    runtime: input.wine.distributionId,
    fullscreen: input.config.hk4eNativeFullscreen === true,
    gameMode: input.config.hk4eGameMode === true,
    steam: input.config.steamPatch === true,
    retina: input.config.retina === true,
    hdr: input.config.hk4eEnableHDR === true,
    reshade: input.config.reshade === true,
    launchFix: input.config.blockNet === true,
  });
  let delegated = false,
    completed = false;
  let preparedRuntime: Wine | undefined;
  let windowSession:
    | Awaited<ReturnType<typeof createWindowSession>>
    | undefined;
  try {
    validateHk4eExecutable(input.server.id, input.gameExecutable);
    const admission = await timing.measure("fps-admission", () =>
      admitFpsLaunch({
        ...input,
        server: input.server.id,
      })
    );
    timing.emit({
      event: "fps-selection",
      enabled: !!admission,
      target: admission?.plan.companion.fpsArgument,
    });
    const gameMode = await timing.measure("game-mode-admission", () =>
      admitGameMode(input.config, input.wine)
    );
    if (signal.aborted) throw new Error("Launch cancelled before preparation");
    if (admission || input.config.hk4eNativeFullscreen) {
      preparedRuntime = await timing.measure("private-runtime", () =>
        prepareR2Wine(
          input.wine,
          {
            fps: !!admission,
            fullscreen: input.config.hk4eNativeFullscreen === true,
            ...(gameMode
              ? { gameMode: join(input.gameDir, input.gameExecutable) }
              : {}),
          },
          timing
        )
      );
      input = { ...input, wine: preparedRuntime };
    }
    windowSession = await timing.measure("window-session-admission", () =>
      createWindowSession(input)
    );
    const controls = windowSession;
    if (!admission) {
      yield* timing.program("resources", resources());
      yield* launchGameDisabledProgram(
        input,
        owner,
        signal,
        controls,
        timing,
        prepared,
        preparationStopped
      );
      completed = true;
      return;
    }
    const admitted = { ...admission, wine: input.wine.executionContext };
    if (signal.aborted)
      throw new Error("Launch cancelled after R2 preparation");
    const { gameDir, gameExecutable, wine, config, server } = input;
    const transaction = launchFpsGame(
      {
        admitted,
        timing,
        prepared,
        preparationStopped,
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
          await timing.measure("wine-properties", () => wine.setProps(config));
          await timing.measure("window-registry-prepare", () =>
            controls.prepare()
          );
          if (config.hk4eEnableHDR) {
            await capture(resolve("hk4e_enable_hdr.reg"));
            await timing.measure("hdr-registry", () =>
              applyHDRRegistry({ wine, server })
            );
          }
          await timing.measure("wine-wait-setup", () =>
            wine.waitUntilServerOff()
          );
          if (config.reshade) {
            await capture(join(gameDir, "ReShade.ini"));
            await timing.measure("reshade-configuration", () =>
              prepareReshadeConfiguration(wine, gameDir)
            );
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
          for await (const command of timing.program(
            "patch-files",
            patchProgram(gameDir, wine, server, config, capture)
          ))
            progress(command);
          // The upstream Steam route writes but does not execute config.bat.
          if (!admitted.steamPatch)
            await timing.measure("protection-copy-helper", () =>
              wine.exec(
                "cmd",
                ["/c", wine.toWinePath(resolve("config.bat"))],
                {},
                "/dev/null"
              )
            );
          await timing.measure("wine-wait-setup", () =>
            wine.waitUntilServerOff()
          );
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
    if (!delegated) {
      logDiagnostic(error);
      owner.problem(errorMessage(error));
      owner.stopped();
    }
    throw error instanceof LaunchFailure
      ? error
      : new LaunchFailure(errorMessage(error), error);
  } finally {
    preparation(signal.aborted ? "cancelled" : "error");
    if (!delegated) {
      await windowSession?.finish(false);
      if (preparedRuntime) await disposeR2Wine(preparedRuntime);
      if (completed) owner.succeed();
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
  const timing = createLaunchTiming(cancellation.signal);
  const iterator = timing.program(
    "request",
    ownedLaunchGameProgram(input, resources, cancellation.signal, timing)
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
