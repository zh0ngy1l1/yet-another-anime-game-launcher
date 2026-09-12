import supervisor from "./owned-execution.pl?raw";
import { build, rawString } from "../utils/command-builder";
import { exec, readFile, writeFile } from "../utils/neu";
import {
  deferred,
  delay,
  operationClock,
  OperationClock,
} from "../utils/operation";

/** Explicit resolved loader, never a fallback search or a shared-prefix owner. */
export interface OwnedWineContext {
  readonly loader: string;
  readonly prefix: string;
  readonly environment: Readonly<Record<string, string>>;
}

export interface OwnedWineRequest {
  readonly wine: OwnedWineContext;
  readonly executable: string;
  readonly args: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
}

export type OwnedExecutionOutcome = {
  readonly confirmed: boolean;
  readonly error?: unknown;
  readonly cleanupError?: unknown;
  readonly status?: number;
  /** Retained on uncertainty; never reuse it for another execution. */
  readonly retainedDirectory?: string;
};

export interface OwnedWineExecution {
  /** Supervisor observed exec's close-on-exec pipe, not child exit. */
  readonly started: Promise<void>;
  /** Never rejects. Includes request completion and owned resource cleanup. */
  readonly completion: Promise<OwnedExecutionOutcome>;
  /** Cooperative request; may remain pending if native IO/wait never settles. */
  stop(): Promise<OwnedExecutionOutcome>;
}

export const OWNED_WINE_TIMING = Object.freeze({
  acknowledgementPollMs: 100,
  terminateGraceMs: 2000,
});

// build's normal strings escape spaces/metacharacters, but change controls,
// omit empty strings and leave '?'. Its explicit raw segment supports a fully
// quoted literal. Never accept caller-provided raw segments or shell source.
function literal(value: string) {
  if (value.includes("\0")) throw new Error("NUL in owned execution argument");
  return rawString("'" + value.replaceAll("'", "'\\''") + "'");
}

export function buildOwnedWineCommand(
  directory: string,
  request: OwnedWineRequest
): string {
  const environment = {
    WINEDEBUG: "fixme-all,err-unwind,+timestamp",
    ...request.wine.environment,
    ...request.environment,
    WINEPREFIX: request.wine.prefix,
  };
  for (const key of Object.keys(environment)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error("Invalid owned execution environment key");
    }
  }
  return build(
    [
      "/usr/bin/env",
      ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
      "/usr/bin/perl",
      `${directory}/supervisor.pl`,
      directory,
      String(OWNED_WINE_TIMING.terminateGraceMs),
      request.wine.loader,
      request.executable,
      ...request.args,
    ].map(literal)
  );
}

const nativeIO = {
  async directory() {
    if (window.NL_OS !== "Darwin") throw new Error("Owned Wine requires macOS");
    const { stdOut } = await exec([
      "/usr/bin/mktemp",
      "-d",
      "/tmp/yaagl-owned-wine.XXXXXXXXXX",
    ]);
    const directory = stdOut.replace(/\n$/, "");
    if (!/^\/tmp\/yaagl-owned-wine\.[A-Za-z0-9]{10}$/.test(directory)) {
      throw new Error("Unrecognized owned Wine directory; not removing it");
    }
    return directory;
  },
  write: writeFile,
  async ready(directory: string) {
    try {
      return (await readFile(`${directory}/ready`)) === "ready";
    } catch (error) {
      // This runtime conflates missing/unreadable files. No acknowledgement is
      // inferred; the controller's startup deadline bounds this observation.
      if (
        typeof error === "object" &&
        error !== null &&
        Reflect.get(error, "code") === "NE_FS_FILRDER"
      ) {
        return false;
      }
      throw error;
    }
  },
  execute: (command: string) => Neutralino.os.execCommand(command, {}),
  async remove(directory: string) {
    // Only known files in our private mktemp directory; no recursive removal.
    await exec([
      "/bin/rm",
      "-f",
      "--",
      `${directory}/ready`,
      `${directory}/stop`,
      `${directory}/supervisor.pl`,
    ]);
    await exec(["/bin/rmdir", "--", directory]);
  },
};

/**
 * Opt-in macOS execution. Does not use Neutralino's virtual IDs or event bus.
 * A private mailbox asks the sole reaping parent to stop its own child. That
 * child's positive PID cannot be reused until reaped; no signal follows reap.
 * Foreground execCommand confirms the supervisor's own exit. See the adjacent
 * ownership notes for native evidence, unresolved IO and Wine limitations.
 * The caller must supply a verified executable and a direct Wine loader.
 */
export function startOwnedWineExecution(
  input: OwnedWineRequest,
  io = nativeIO,
  clock: OperationClock = operationClock
): OwnedWineExecution {
  const request: OwnedWineRequest = {
    ...input,
    args: [...input.args],
    environment: { ...input.environment },
    wine: { ...input.wine, environment: { ...input.wine.environment } },
  };
  const acknowledgement = deferred<{ error?: unknown }>();
  const started = acknowledgement.promise.then(result => {
    if (result.error !== undefined) throw result.error;
  });
  // Consumers may observe completion first; acknowledgement never goes unhandled.
  void started.catch(() => undefined);
  const polling = new AbortController();
  let stopped = false;
  let directory: string | undefined;
  let issued = false;
  let stopWrite: Promise<void> | undefined;
  let stopError: unknown;
  let sealed = false;

  function requestStop() {
    if (sealed) return;
    stopped = true;
    polling.abort();
    if (issued && directory && !stopWrite) {
      stopWrite = Promise.resolve()
        .then(() => io.write(`${directory}/stop`, "stop"))
        .catch(error => {
          stopError = error;
        });
    }
  }

  const completion = (async (): Promise<OwnedExecutionOutcome> => {
    let outcome: OwnedExecutionOutcome = { confirmed: true };
    let monitor: Promise<void> | undefined;
    try {
      if (
        !request.wine.loader.startsWith("/") ||
        !request.executable.startsWith("/")
      ) {
        throw new Error(
          "Owned Wine requires explicit absolute executable paths"
        );
      }
      directory = await io.directory();
      if (!stopped) await io.write(`${directory}/supervisor.pl`, supervisor);
      if (!stopped) {
        const command = buildOwnedWineCommand(directory, request);
        issued = true;
        // Set unconfirmed BEFORE issuance, including a synchronous transport error.
        outcome = { confirmed: false };
        const execution = io.execute(command);
        // Attach immediately, before any other asynchronous work.
        const observed = execution.then(
          value => ({ value }),
          error => ({ error })
        );
        monitor = (async () => {
          while (!polling.signal.aborted) {
            if (await io.ready(directory as string)) {
              acknowledgement.resolve({});
              return;
            }
            await delay(
              OWNED_WINE_TIMING.acknowledgementPollMs,
              clock,
              polling.signal
            );
          }
        })().catch(error => {
          acknowledgement.resolve({ error });
          outcome = { ...outcome, error: outcome.error ?? error };
          requestStop();
        });
        const result = await observed;
        if ("error" in result) throw result.error;
        const data: unknown = JSON.parse(result.value.stdOut);
        if (
          result.value.exitCode !== 0 ||
          typeof data !== "object" ||
          data === null ||
          ![0, 1].includes(Reflect.get(data, "confirmed")) ||
          ![0, 1].includes(Reflect.get(data, "spawned")) ||
          !Number.isInteger(Reflect.get(data, "status")) ||
          typeof Reflect.get(data, "error") !== "string"
        )
          throw new Error("Unconfirmed owned Wine supervisor result");
        const error = Reflect.get(data, "error");
        outcome = {
          ...outcome,
          confirmed: Reflect.get(data, "confirmed") === 1,
          status: Reflect.get(data, "status"),
          ...(error
            ? {
                error: outcome.error ?? new Error(error),
                ...(outcome.error === undefined
                  ? {}
                  : { cleanupError: new Error(error) }),
              }
            : {}),
        };
        if (Reflect.get(data, "spawned") === 1 && !outcome.error) {
          acknowledgement.resolve({});
        } else if (!stopped && !outcome.error) {
          outcome = {
            ...outcome,
            error: new Error("Wine helper did not execute"),
          };
        }
      }
    } catch (error) {
      outcome = { ...outcome, error: outcome.error ?? error };
    } finally {
      if (!outcome.confirmed) requestStop();
      // Seal before the first await: a stop arriving during a pending read or
      // between awaits must not append a write after the cleanup snapshot.
      sealed = true;
      polling.abort();
      await monitor;
      await stopWrite;
      acknowledgement.resolve({
        error:
          outcome.error ??
          new Error("Execution stopped before acknowledgement"),
      });
    }
    if (stopError !== undefined)
      outcome = { ...outcome, cleanupError: stopError };
    if (directory) {
      if (outcome.confirmed && stopError === undefined) {
        try {
          await io.remove(directory);
        } catch (cleanupError) {
          outcome = { ...outcome, cleanupError, retainedDirectory: directory };
        }
      } else outcome = { ...outcome, retainedDirectory: directory };
    }
    return outcome;
  })();
  let finished = false;
  void completion.then(() => {
    finished = true;
  });
  return {
    started,
    completion,
    stop() {
      if (!finished) requestStop();
      return completion;
    },
  };
}
