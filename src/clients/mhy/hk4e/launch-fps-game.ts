import type {
  CommonProgressUICommand,
  CommonUpdateProgram,
} from "../../../common-update-ui";
import type { Config } from "../../../config";
import type { Server } from "../../../constants";
import { launchOwnership } from "../../../launcher/launch-ownership";
import { getKeyOrDefault, log, mkdirp, resolve, setKey } from "../../../utils";
import type { Wine } from "../../../wine";
import { createFpsCompanion } from "./fps-companion";
import { FpsBridgePreparationFailure, prepareFpsBridge } from "./fps-bridge";
import { admitFpsLaunch } from "./fps-admission";
import { createLaunchJournal } from "./launch-journal";
import { createLaunchTransaction } from "./launch-transaction";
import type { createLaunchFix } from "./launch-fix";

export function launchFpsGame(
  input: {
    admitted: NonNullable<Awaited<ReturnType<typeof admitFpsLaunch>>>;
    config: Config;
    wine: Wine;
    server: Server;
    environment: Record<string, string>;
    registryResolution: boolean;
    launchFix?: ReturnType<typeof createLaunchFix>;
    resources: (enabledFps?: boolean) => CommonUpdateProgram;
    finishRuntime?: () => Promise<void>;
    finishWindowControls?: (normal: boolean) => Promise<void>;
    setup: (
      capture: (path: string) => Promise<void>,
      progress: (command: CommonProgressUICommand) => void
    ) => Promise<void>;
  },
  owner: ReturnType<typeof launchOwnership.claim>,
  dependencies = {
    bridge: prepareFpsBridge,
    journal: createLaunchJournal,
    companion: {} as Parameters<typeof createFpsCompanion>[1],
  }
) {
  let bridge: Awaited<ReturnType<typeof prepareFpsBridge>> | undefined;
  let preparationRecovery: (() => Promise<void>) | undefined;
  function preparedBridge() {
    if (!bridge) throw new Error("FPS bridge requested before preparation");
    return bridge;
  }
  let journal: ReturnType<typeof createLaunchJournal> | undefined;
  let registrySaved = false,
    booted = false,
    launched = false;
  let bridgeReleased = false,
    wineWaited = false,
    registryRestored = false,
    filesRestored = false,
    journalDisposed = false;
  let originalPatched = "NOTFOUND";
  let patchStateOwned = false;
  const { admitted, wine, config, server } = input;
  const companion = admitted.plan.companion;
  const environment = Object.freeze({
    ...input.environment,
    DXMT_CONFIG: companion.dxmtConfig,
  });
  const context = Object.freeze({
    ...admitted.wine,
    environment: Object.freeze({
      ...admitted.wine.environment,
      ...environment,
    }),
  });
  const observationErrors: unknown[] = [];
  function diagnostic(text: string) {
    if (!observationErrors.some(error => String(error) === `Error: ${text}`))
      observationErrors.push(new Error(text));
    owner.problem(text);
    void log(text).catch(() => undefined);
  }
  async function waitWine(phase: (text: string) => void) {
    phase("Waiting for this request's wineserver -w; close remains blocked");
    void log(
      `FPS request ${bridge?.token}: request-owned Wine wait started`
    ).catch(() => undefined);
    await wine.waitUntilServerOff();
    void log(
      `FPS request ${bridge?.token}: request-owned Wine wait completed`
    ).catch(() => undefined);
  }
  return createLaunchTransaction(
    {
      reportedErrors: () => [
        ...observationErrors,
        ...(input.launchFix?.errors() ?? []),
      ],
      async prepare(signal, progress) {
        const check = () => {
          if (signal.aborted) throw new Error("Launch preparation cancelled");
        };
        owner.phase("Acquiring and verifying the request-private FPS bridge");
        await mkdirp(resolve("./logs"));
        try {
          bridge = await dependencies.bridge({
            wine: context,
            executable: admitted.executable,
            steamPatch: admitted.steamPatch,
            gameDirectory: admitted.gameDirectory,
            gameDxmtConfig: admitted.plan.gameDxmtConfig,
            log: resolve(`./logs/game_${Date.now()}.log`),
            diagnostic,
            event: text => {
              void log(text).catch(() => undefined);
            },
          });
        } catch (error) {
          if (error instanceof FpsBridgePreparationFailure)
            preparationRecovery = error.retryCleanup;
          throw error;
        }
        const launchJournal = dependencies.journal(bridge.directory);
        journal = launchJournal;
        await log(
          `FPS request ${bridge.token}: artifact=${bridge.path}; route=${
            admitted.steamPatch ? "steam-patch" : "direct"
          }; Launch Fix=${config.blockNet === true}; loader=${
            context.loader
          }; prefix=${context.prefix}; target=${
            companion.fpsArgument
          }; game DXMT_CONFIG=${
            admitted.plan.gameDxmtConfig
          }; companion DXMT_CONFIG=${companion.dxmtConfig}`
        );
        check();
        for await (const command of input.resources(true)) {
          progress(command);
          check();
        }
        originalPatched = await getKeyOrDefault("patched", "NOTFOUND");
        if (originalPatched !== "NOTFOUND")
          throw new Error(
            "An earlier patch state is still present; resolve it before FPS launch"
          );
        // A shared prefix may have previous users. Waiting here is a preparation
        // prerequisite, not attribution of the new game. No helper is alive yet.
        await waitWine(owner.phase);
        check();
        owner.phase(
          "Snapshotting original registry values and preparing game files"
        );
        await bridge.registry(
          "save",
          server.id,
          config.hk4eEnableHDR,
          input.registryResolution
        );
        registrySaved = true;
        check();
        patchStateOwned = true;
        await input.setup(async path => {
          check();
          await launchJournal.capture(path);
        }, progress);
        check();
        await bridge.boot();
        booted = true;
        check();
        // The canonical Steam root is already established. Launch Fix is a
        // separate foreground host operation; only its readiness admits game
        // creation, and its completion remains part of transaction cleanup.
        await input.launchFix?.start();
        check();
      },
      async launch() {
        launched = true;
        await preparedBridge().launch();
      },
      gameExit: () => preparedBridge().waitForGameExit(),
      companion: () =>
        createFpsCompanion(
          {
            startWorker: () =>
              preparedBridge().spawnWorker(companion.fpsArgument),
            game: preparedBridge().game,
          },
          dependencies.companion
        ),
      async cleanup(phase) {
        await input.launchFix?.finish();
        if (!bridge) {
          if (preparationRecovery) {
            await preparationRecovery();
            preparationRecovery = undefined;
          }
          await input.finishWindowControls?.(false);
          await input.finishRuntime?.();
          return [];
        }
        await bridge.settleRegistry();
        const errors: unknown[] = [];
        if (!bridgeReleased) {
          phase(
            "Confirming FPS worker, bridge and its direct Wine child completion"
          );
          try {
            if (booted || launched) await bridge.release();
            else await bridge.discardBeforeLaunch();
            bridgeReleased = true;
          } catch (error) {
            return [error];
          } // Wine/file cleanup depends on this.
        }
        if (!wineWaited) {
          try {
            await waitWine(phase);
            wineWaited = true;
          } catch (error) {
            return [error];
          }
        }
        await input.finishWindowControls?.(bridge.normalGameExit?.() === true);
        if (registrySaved && !registryRestored) {
          phase("Restoring original HDR, resolution and Wine registry values");
          wineWaited = false;
          try {
            await bridge.registry(
              "restore",
              server.id,
              config.hk4eEnableHDR,
              input.registryResolution
            );
            registryRestored = true;
          } catch (error) {
            errors.push(error);
          }
          try {
            await bridge.settleRegistry();
          } catch (error) {
            return [...errors, error];
          }
          // A failed registry command may still have used Wine. Await this request
          // before touching Wine libraries; attempt other safe restoration below.
          try {
            await waitWine(phase);
            wineWaited = true;
          } catch (error) {
            return [...errors, error];
          }
        }
        if (!filesRestored && journal) {
          phase("Restoring config.bat and game/Wine patch files");
          const restoration = await journal.restore();
          errors.push(...restoration);
          if (!restoration.length) {
            try {
              if (patchStateOwned)
                await setKey(
                  "patched",
                  originalPatched === "NOTFOUND" ? null : originalPatched
                );
              filesRestored = true;
            } catch (error) {
              errors.push(error);
            }
          }
        }
        if (errors.length) return errors;
        if (journal && !journalDisposed) {
          await journal.dispose();
          journalDisposed = true;
        }
        await input.finishRuntime?.();
        await bridge.dispose();
        void log(
          `FPS request ${bridge.token}: registry/file restoration and private resource cleanup completed`
        ).catch(() => undefined);
        return [];
      },
    },
    owner
  );
}
