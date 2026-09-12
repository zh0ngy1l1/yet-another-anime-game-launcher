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

export interface BridgeStatus {
  version: 1;
  token: string;
  sequence: number;
  launched: number;
  pid: number;
  primaryExited: number;
  active: number;
  generation: number;
  workerState: number;
  workerDone: number;
  workerError: number;
  launchError: number;
  error: number;
  released: number;
}

export function parseBridgeStatus(raw: string, token: string): BridgeStatus {
  const data: unknown = JSON.parse(raw);
  if (
    typeof data !== "object" ||
    data === null ||
    Reflect.get(data, "version") !== 1 ||
    Reflect.get(data, "token") !== token
  )
    throw new Error("FPS bridge protocol identity mismatch");
  for (const key of [
    "sequence",
    "launched",
    "pid",
    "primaryExited",
    "active",
    "generation",
    "workerState",
    "workerDone",
    "workerError",
    "launchError",
    "error",
    "released",
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
  for (const key of ["launched", "primaryExited", "workerDone", "released"])
    if (![0, 1].includes(Reflect.get(data, key)))
      throw new Error(`Invalid FPS bridge flag: ${key}`);
  if (
    Reflect.get(data, "workerState") > 4 ||
    (Reflect.get(data, "launched") && !Reflect.get(data, "pid"))
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
  async stage(directory: string) {
    const source = resolve("./sidecar/fps-bridge/fps-bridge.exe");
    const artifact = { ...FPS_BRIDGE_MANIFEST, tag: "bridge-1", url: source };
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
    return path;
  },
  async verify(path: string) {
    if (
      (await fpsUnlockerIO.sha256(path, FPS_BRIDGE_MANIFEST.size)) !==
      FPS_BRIDGE_MANIFEST.sha256
    )
      throw new Error("FPS bridge execution artifact changed");
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
  let path: string;
  try {
    path = await io.stage(directory);
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
              value.primaryExited < last.primaryExited ||
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
              "active",
              "generation",
              "workerState",
              "workerDone",
              "released",
            ].some(
              key => Reflect.get(previous, key) !== Reflect.get(value, key)
            )
          )
            input.event?.(`FPS request ${token}: ${JSON.stringify(value)}`);
          last = value;
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
      if (value.active === 0xffffffff) report("Job lifetime query failed");
      return value;
    });
    queue = result.catch(() => undefined);
    return result;
  }

  async function boot() {
    await io.verify(path);
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
      ],
      environment: {},
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
      initial.active ||
      initial.generation ||
      initial.workerState ||
      !initial.workerDone ||
      initial.workerError ||
      initial.launchError ||
      initial.error ||
      initial.released
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
      if (value.active === 0xffffffff)
        throw new Error("FPS game/job lifetime query failed");
      if (!value.launched) return undefined;
      return {
        async isAlive() {
          const value = await probe();
          if (value.active === 0xffffffff)
            throw new Error("FPS game/job lifetime query failed");
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
      launchIssued = true;
      const value = await request("launch");
      if (value.error || !value.launched)
        throw new Error(
          `FPS game CreateProcess not acknowledged: ${value.error}`
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
      for (;;) {
        const value = await probe();
        if (value.active === 0 && (!value.pid || value.primaryExited)) return;
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
        if (value.error || !value.released || value.active || !value.workerDone)
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
    },
    async discardBeforeLaunch() {
      if (launchIssued)
        throw new Error("Cannot discard after game launch issuance");
      sealed = true;
      await confirmExecution(true);
    },
  };
}
