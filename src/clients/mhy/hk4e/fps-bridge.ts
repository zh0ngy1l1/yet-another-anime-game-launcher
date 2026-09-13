import { join } from "path-browserify";
import { exec, readFile, resolve, writeFile } from "../../../utils/neu";
import { deferred, delay, operationClock } from "../../../utils/operation";
import {
  OwnedWineContext,
  OwnedWineExecution,
  startOwnedWineExecution,
} from "../../../wine/owned-execution";
import { acquireFpsUnlocker } from "./fps-unlocker";
import { fpsUnlockerIO } from "./fps-unlocker-io";
import { FPS_BRIDGE_MANIFEST } from "./fps-bridge-manifest";
import type { FpsGameObserver } from "./fps-companion";
import {
  FPS_STEAM_ARTIFACTS,
  FPS_STEAM_WINDOWS_PATH,
  verifyFpsSteamPrefix,
} from "./fps-steam";

export interface BridgeStatus {
  version: 3;
  token: string;
  sequence: number;
  launched: number;
  pid: number;
  primaryExited: number;
  exitCodeKnown: number;
  exitCode: number;
  exitCodeError: number;
  active: number;
  generation: number;
  workerState: number;
  workerDone: number;
  workerError: number;
  launchError: number;
  error: number;
  released: number;
  shimPid: number;
  shimExited: number;
  steamReady: number;
  steamError: number;
  steamActive: number;
}

export function parseBridgeStatus(raw: string, token: string): BridgeStatus {
  const data: unknown = JSON.parse(raw);
  if (
    typeof data !== "object" ||
    data === null ||
    Reflect.get(data, "version") !== 3 ||
    Reflect.get(data, "token") !== token
  )
    throw new Error("FPS bridge protocol identity mismatch");
  for (const key of [
    "sequence",
    "launched",
    "pid",
    "primaryExited",
    "exitCodeKnown",
    "exitCode",
    "exitCodeError",
    "active",
    "generation",
    "workerState",
    "workerDone",
    "workerError",
    "launchError",
    "error",
    "released",
    "shimPid",
    "shimExited",
    "steamReady",
    "steamError",
    "steamActive",
  ]) {
    const value: unknown = Reflect.get(data, key);
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 0xffffffff
    )
      throw new Error(`Invalid FPS bridge field: ${key}`);
  }
  for (const key of [
    "launched",
    "primaryExited",
    "exitCodeKnown",
    "workerDone",
    "released",
    "shimExited",
    "steamReady",
  ])
    if (![0, 1].includes(Reflect.get(data, key)))
      throw new Error(`Invalid FPS bridge flag: ${key}`);
  if (
    Reflect.get(data, "workerState") > 4 ||
    (Reflect.get(data, "exitCodeKnown") &&
      (!Reflect.get(data, "pid") ||
        !Reflect.get(data, "primaryExited") ||
        Reflect.get(data, "exitCodeError"))) ||
    (!Reflect.get(data, "exitCodeKnown") && Reflect.get(data, "exitCode")) ||
    (Reflect.get(data, "launched") && !Reflect.get(data, "pid")) ||
    (Reflect.get(data, "steamReady") && !Reflect.get(data, "shimPid")) ||
    (Reflect.get(data, "shimExited") && !Reflect.get(data, "shimPid")) ||
    (Reflect.get(data, "shimPid") &&
      Reflect.get(data, "pid") === Reflect.get(data, "shimPid"))
  )
    throw new Error("Invalid FPS bridge lifecycle");
  return data as BridgeStatus;
}

const bridgeIO = {
  async directory() {
    const result = await exec([
      "/usr/bin/mktemp",
      "-d",
      "/tmp/yaagl-fps.XXXXXXXXXX",
    ]);
    const path = result.stdOut.replace(/\n$/, "");
    if (!/^\/tmp\/yaagl-fps\.[A-Za-z0-9]{10}$/.test(path))
      throw new Error("Unknown FPS request directory");
    return path;
  },
  token: () =>
    Array.from(crypto.getRandomValues(new Uint8Array(32)), x =>
      x.toString(16).padStart(2, "0")
    ).join(""),
  read: readFile,
  async command(directory: string, text: string) {
    await writeFile(join(directory, "command.tmp"), text);
    await fpsUnlockerIO.promote(
      join(directory, "command.tmp"),
      join(directory, "command")
    );
  },
  async stage(directory: string, steamPatch = false) {
    const source = resolve("./sidecar/fps-bridge/fps-bridge.exe");
    const artifact = { ...FPS_BRIDGE_MANIFEST, tag: "bridge-3", url: source };
    const path = await acquireFpsUnlocker(
      {
        ...fpsUnlockerIO,
        cacheDirectory: () => directory,
        download: async (from, to) => {
          await exec(["/bin/cp", "--", from, to]);
        },
      },
      artifact
    );
    await exec(["/bin/chmod", "400", path]);
    if (steamPatch)
      for (const artifact of FPS_STEAM_ARTIFACTS) {
        const staged = await acquireFpsUnlocker(
          {
            ...fpsUnlockerIO,
            cacheDirectory: () => directory,
            download: async (from, to) => {
              await exec(["/bin/cp", "--", from, to]);
            },
          },
          {
            ...artifact,
            url: resolve(`./sidecar/protonextras/${artifact.resource}`),
          }
        );
        await exec(["/bin/chmod", "400", staged]);
      }
    return path;
  },
  async verify(path: string, steamDirectory?: string) {
    if (
      (await fpsUnlockerIO.sha256(path, FPS_BRIDGE_MANIFEST.size)) !==
      FPS_BRIDGE_MANIFEST.sha256
    )
      throw new Error("FPS bridge execution artifact changed");
    if (steamDirectory) {
      await verifyFpsSteamPrefix(join(steamDirectory, "../../.."));
      for (const artifact of FPS_STEAM_ARTIFACTS) {
        const selected = join(steamDirectory, artifact.filename);
        try {
          if (
            (await fpsUnlockerIO.sha256(selected, artifact.size)) !==
            artifact.sha256
          )
            throw new Error("SHA-256 mismatch");
        } catch (cause) {
          throw Object.assign(
            new Error(
              `FPS Steam execution artifact changed or unverifiable: ${selected}: ${String(
                cause
              )}`
            ),
            { cause }
          );
        }
      }
    }
  },
  start: startOwnedWineExecution,
  async remove(directory: string) {
    await exec([
      "/bin/rm",
      "-f",
      "--",
      ...[
        "command",
        "command.tmp",
        "response",
        "response.tmp",
        "fps-bridge.exe",
        ...FPS_STEAM_ARTIFACTS.map(artifact => artifact.filename),
        ...Array.from({ length: 6 }, (_, i) => `registry-${i}`),
      ].map(name => join(directory, name)),
    ]);
    await exec(["/bin/rmdir", "--", directory]);
  },
  pause: () => delay(100, operationClock, new AbortController().signal),
};

export class FpsBridgePreparationFailure extends Error {
  constructor(
    readonly primary: unknown,
    readonly cleanupError: unknown,
    readonly retainedDirectory: string,
    readonly retryCleanup: () => Promise<void>
  ) {
    super(
      `FPS acquisition failed: ${String(primary)}; cleanup failed: ${String(
        cleanupError
      )}; retained ${retainedDirectory}`
    );
  }
}

/** The worker is a thread of the owned bridge, using its retained game HANDLE.
 * The bridge itself is never stopped while game/job lifetime is unresolved.
 * Timed-out observers retain these promises; callers must keep admission held.
 */
export async function prepareFpsBridge(
  input: {
    wine: OwnedWineContext;
    executable: string;
    steamPatch?: boolean;
    gameDirectory: string;
    gameDxmtConfig: string;
    log: string;
    diagnostic: (text: string) => void;
    event?: (text: string) => void;
  },
  io = bridgeIO
) {
  const directory = await io.directory();
  const token = io.token();
  // Setup journals and prepares these prefix files. Verify the actual selected
  // pair after setup and again before launch, then let the native bridge retain
  // its image locks and shim HANDLE through the existing guarded lifetime.
  const steamDirectory = input.steamPatch
    ? join(input.wine.prefix, "drive_c/windows/system32")
    : undefined;
  let path: string;
  try {
    path = await io.stage(directory, input.steamPatch);
  } catch (error) {
    const cleanup = async () => {
      if (typeof error === "object" && error !== null) {
        const retry: unknown = Reflect.get(error, "retryCleanup");
        if (typeof retry === "function") await retry();
      }
      await io.remove(directory);
    };
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new FpsBridgePreparationFailure(
        error,
        cleanupError,
        directory,
        cleanup
      );
    }
    throw error;
  }
  let execution: OwnedWineExecution | undefined;
  const registryExecutions = new Set<OwnedWineExecution>();
  async function settleRegistry() {
    for (const running of registryExecutions) {
      let result = await running.completion;
      if (result.confirmed && result.cleanupError && running.retryCleanup)
        result = await running.retryCleanup();
      if (!result.confirmed || result.cleanupError)
        throw new Error(
          `FPS registry process/mailbox completion unconfirmed: ${JSON.stringify(
            result
          )}; retained ${directory}`
        );
      registryExecutions.delete(running);
    }
  }
  let last: BridgeStatus | undefined;
  let sequence = 0;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let sealed = false;
  let launchIssued = false;
  let commandCompleted = false;
  let commandFailed = false;
  let executionFailureReported = false;
  let gameExitReported = false;
  let lastReport = "";
  let lastReportTime = 0;
  const winePath = (p: string) => "Z:" + p.replaceAll("/", "\\");
  const report = (error: unknown) => {
    const message = String(error);
    if (message !== lastReport || Date.now() - lastReportTime >= 10000) {
      lastReport = message;
      lastReportTime = Date.now();
      input.diagnostic(
        `FPS lifetime/cleanup unconfirmed; continuing observation. Request ${token}; retained ${directory}: ${message}`
      );
    }
  };

  async function read(sequence: number) {
    for (;;) {
      if (commandCompleted && commandFailed && !launchIssued)
        throw new Error("FPS bridge exited before launch admission");
      try {
        const value = parseBridgeStatus(
          await io.read(join(directory, "response")),
          token
        );
        if (value.sequence > sequence)
          throw new Error("FPS bridge response advanced without its request");
        if (value.sequence === sequence) {
          if (
            last &&
            ((value.pid !== last.pid && last.pid !== 0) ||
              (value.shimPid !== last.shimPid && last.shimPid !== 0) ||
              value.shimExited < last.shimExited ||
              value.steamReady < last.steamReady ||
              value.primaryExited < last.primaryExited ||
              value.exitCodeKnown < last.exitCodeKnown ||
              (last.exitCodeKnown && value.exitCode !== last.exitCode) ||
              value.generation < last.generation ||
              value.launched < last.launched)
          )
            throw new Error("FPS bridge incarnation/lifecycle changed");
          const previous = last;
          if (
            !previous ||
            [
              "launched",
              "pid",
              "primaryExited",
              "exitCodeKnown",
              "exitCode",
              "exitCodeError",
              "active",
              "generation",
              "workerState",
              "workerDone",
              "released",
              "shimPid",
              "shimExited",
              "steamReady",
              "steamError",
              "steamActive",
            ].some(
              key => Reflect.get(previous, key) !== Reflect.get(value, key)
            )
          )
            input.event?.(`FPS request ${token}: ${JSON.stringify(value)}`);
          last = value;
          if (value.primaryExited && !gameExitReported) {
            gameExitReported = true;
            if (!value.exitCodeKnown || value.exitCode !== 0)
              input.diagnostic(
                `FPS request ${token}: game PID ${value.pid} exited ${
                  value.exitCodeKnown
                    ? `with code 0x${value.exitCode
                        .toString(16)
                        .padStart(8, "0")}`
                    : `with unavailable exit status (error ${value.exitCodeError})`
                }; worker generation ${
                  value.generation
                }. Continuing job/worker cleanup; Wine output: ${
                  input.log
                }.wine.log`
              );
          }
          return value;
        }
      } catch (error) {
        // The first atomic response has not been published yet. Its absence is
        // expected during Wine startup; malformed content is never accepted.
        if (
          !(
            sequence === 0 &&
            !last &&
            typeof error === "object" &&
            error !== null &&
            Reflect.get(error, "code") === "NE_FS_FILRDER"
          )
        )
          report(error);
      }
      await io.pause();
    }
  }

  function request(operation: string, workerGeneration = 0, argument = 0) {
    const result = queue.then(async () => {
      if (sealed) throw new Error("FPS bridge already released");
      const next = ++sequence;
      const text = `${token} ${next} ${operation} ${workerGeneration} ${argument}\n`;
      // Retrying the SAME command cannot repeat a native side effect.
      for (;;) {
        try {
          await io.command(directory, text);
          break;
        } catch (error) {
          report(error);
          await io.pause();
        }
      }
      const value = await read(next);
      if (value.active === 0xffffffff || value.steamActive === 0xffffffff)
        report("Job lifetime query failed");
      return value;
    });
    queue = result.catch(() => undefined);
    return result;
  }

  async function boot() {
    await io.verify(path, steamDirectory);
    if (steamDirectory)
      input.event?.(
        `FPS request ${token}: verified Steam execution pair at ${steamDirectory}; Windows image ${FPS_STEAM_WINDOWS_PATH}`
      );
    execution = io.start({
      wine: input.wine,
      executable: path,
      args: [
        winePath(directory),
        token,
        winePath(input.executable),
        winePath(input.gameDirectory),
        input.gameDxmtConfig,
        winePath(input.log),
        ...(input.steamPatch ? [FPS_STEAM_WINDOWS_PATH] : []),
      ],
      // Exit status alone cannot identify an access violation's instruction.
      // Keep Wine exception records in the same persistent request output.
      environment: {
        WINEDEBUG: `${
          input.wine.environment.WINEDEBUG ?? "fixme-all,err-unwind,+timestamp"
        },+seh`,
      },
      outputLog: `${input.log}.wine.log`,
    });
    void execution.completion.then(outcome => {
      commandCompleted = true;
      commandFailed =
        !outcome.confirmed ||
        outcome.error !== undefined ||
        outcome.cleanupError !== undefined ||
        (outcome.status !== undefined && outcome.status !== 0);
      input.event?.(
        `FPS request ${token}: foreground Wine request completed ${JSON.stringify(
          outcome
        )}; game/job and worker handles remain authoritative`
      );
      if (commandFailed)
        report(
          `Bridge foreground execution failure: ${JSON.stringify(outcome)}`
        );
    });
    await execution.started;
    const initial = await read(0);
    if (
      initial.launched ||
      initial.pid ||
      initial.primaryExited ||
      initial.exitCodeKnown ||
      initial.exitCode ||
      initial.exitCodeError ||
      initial.active ||
      initial.generation ||
      initial.workerState ||
      !initial.workerDone ||
      initial.workerError ||
      initial.launchError ||
      initial.error ||
      initial.released ||
      initial.shimPid ||
      initial.shimExited ||
      initial.steamReady ||
      initial.steamError ||
      initial.steamActive
    )
      throw new Error(
        "FPS bridge initial capability/lifecycle handshake failed"
      );
    return initial;
  }

  async function confirmExecution(stop: boolean) {
    if (!execution) return;
    let outcome = await (stop ? execution.stop() : execution.completion);
    if (
      executionFailureReported &&
      outcome.confirmed &&
      outcome.cleanupError &&
      execution.retryCleanup
    )
      outcome = await execution.retryCleanup();
    if (
      !outcome.confirmed ||
      outcome.cleanupError ||
      (outcome.error && !executionFailureReported)
    ) {
      executionFailureReported = true;
      throw Object.assign(
        new Error(
          `FPS supervisor completion/cleanup failed; retained ${directory}: ${String(
            outcome.error ?? outcome.cleanupError
          )}`
        ),
        { outcome }
      );
    }
  }

  async function probe() {
    return request("probe");
  }
  const game: FpsGameObserver = {
    async discover() {
      const value = await probe();
      if (value.active === 0xffffffff || value.steamActive === 0xffffffff)
        throw new Error("FPS game/job lifetime query failed");
      if (
        value.steamError ||
        (value.shimExited && !value.primaryExited && value.launched)
      )
        throw new Error(
          "FPS Steam shim failed or exited while the attributed game remains alive"
        );
      if (!value.launched) return undefined;
      return {
        async isAlive() {
          const value = await probe();
          if (value.active === 0xffffffff || value.steamActive === 0xffffffff)
            throw new Error("FPS game/job lifetime query failed");
          if (
            value.steamError ||
            (value.shimExited && !value.primaryExited && value.launched)
          )
            throw new Error(
              "FPS Steam shim failed or exited while the attributed game remains alive"
            );
          return value.primaryExited === 0;
        },
      };
    },
  };
  return {
    directory,
    token,
    path,
    game,
    boot,
    probe,
    async launch() {
      await io.verify(path, steamDirectory);
      launchIssued = true;
      const value = await request("launch");
      if (
        value.error ||
        !value.launched ||
        (input.steamPatch && !value.steamReady)
      )
        throw new Error(
          input.steamPatch
            ? `FPS Steam rendezvous/game creation not acknowledged: ${value.error}; Steam error: ${value.steamError}`
            : `FPS game CreateProcess not acknowledged: ${value.error}`
        );
      return value;
    },
    async spawnWorker(fps: number): Promise<OwnedWineExecution> {
      await io.verify(path); // Includes restarts; no execution from shared cache.
      const mine = ++generation;
      const value = await request("start", mine, fps);
      if (value.error)
        throw new Error(`FPS worker start failed: ${value.error}`);
      const started = deferred<void>();
      let acknowledged = false;
      const completion = (async () => {
        for (;;) {
          const status = await probe();
          if (status.generation !== mine)
            throw new Error("FPS worker generation mismatch");
          if (status.workerState === 2 && !acknowledged) {
            acknowledged = true;
            started.resolve();
          }
          if (status.workerDone) {
            if (!acknowledged) started.resolve();
            return {
              confirmed: true,
              ...(status.workerError
                ? {
                    error: new Error(
                      `FPS target scan/write failed: ${status.workerError}`
                    ),
                  }
                : {}),
            };
          }
          await io.pause();
        }
      })().catch(error => {
        report(error);
        started.resolve();
        return { confirmed: false, error, retainedDirectory: directory };
      });
      let stopping: Promise<Awaited<typeof completion>> | undefined;
      return {
        started: started.promise,
        completion,
        stop() {
          if (!stopping)
            stopping = request("stop", mine).then(value => {
              if (value.error)
                throw new Error(`FPS worker stop failed: ${value.error}`);
              return completion;
            });
          return stopping;
        },
      };
    },
    async waitForGameExit() {
      let steamPendingSince: number | undefined;
      for (;;) {
        const value = await probe();
        if (value.launched && value.steamError)
          report(
            `Steam shim/rendezvous failed: ${value.steamError}; retaining game/job observation`
          );
        if (
          value.active === 0 &&
          value.steamActive === 0 &&
          (!value.pid || value.primaryExited) &&
          (!value.shimPid || value.shimExited)
        )
          return;
        if (value.shimExited && !value.primaryExited && value.launched)
          report(
            "Steam shim exited while the attributed game remains alive; continuing owned observation"
          );
        if (value.primaryExited && !value.active && value.steamActive) {
          steamPendingSince ??= Date.now();
          if (Date.now() - steamPendingSince >= 30000)
            report(
              "Game ended; Steam shim/relay job completion remains pending. Close and new launch stay blocked"
            );
        }
        if (value.primaryExited && value.active)
          report(
            "Game entry process exited; observing its remaining job descendants. FPS will not retarget them."
          );
        await io.pause();
      }
    },
    async release() {
      if (!execution) return;
      if (!sealed) {
        const value = await request("release");
        if (
          value.error ||
          !value.released ||
          value.active ||
          value.steamActive ||
          (value.shimPid && !value.shimExited) ||
          !value.workerDone
        )
          throw new Error(
            `FPS bridge release not confirmed; retained ${directory}`
          );
        sealed = true;
      }
      await confirmExecution(false);
    },
    settleRegistry,
    dispose: async () => {
      await settleRegistry();
      await io.remove(directory);
    },
    async registry(
      operation: "save" | "restore",
      server: string,
      hdr: boolean,
      resolution: boolean
    ) {
      await io.verify(path);
      const running = io.start({
        wine: input.wine,
        executable: path,
        args: [
          "--registry",
          operation,
          winePath(directory),
          server,
          hdr ? "1" : "0",
          resolution ? "1" : "0",
        ],
        environment: {},
      });
      registryExecutions.add(running);
      input.event?.(
        `FPS request ${token}: registry ${operation} issued; snapshots ${directory}`
      );
      const result = await running.completion;
      if (
        !result.confirmed ||
        result.status !== 0 ||
        result.error ||
        result.cleanupError
      )
        throw Object.assign(
          new Error(
            `FPS registry ${operation} failed: ${JSON.stringify(
              result
            )}; retained ${directory}`
          ),
          { result }
        );
      input.event?.(
        `FPS request ${token}: registry ${operation} and owned execution confirmed`
      );
    },
    async discardBeforeLaunch() {
      if (launchIssued)
        throw new Error("Cannot discard after game launch issuance");
      sealed = true;
      await confirmExecution(true);
    },
  };
}
