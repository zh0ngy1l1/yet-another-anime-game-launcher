import helper from "./launch-fix.pl?raw";
import { exec, log, readFile, writeFile } from "../../../utils/neu";
import { CN_BLOCK_URL, OS_BLOCK_URL } from "../../secret";

type Status = {
  version: 1;
  token: string;
  phase: "ready" | "restore-error" | "restored";
  changed: 0 | 1;
  attempt: number;
  error: string;
};
function parse(text: string, token: string): Status {
  const value = JSON.parse(text);
  if (
    !value ||
    value.version !== 1 ||
    value.token !== token ||
    !["ready", "restore-error", "restored"].includes(value.phase) ||
    ![0, 1].includes(value.changed) ||
    !Number.isSafeInteger(value.attempt) ||
    value.attempt < 0 ||
    typeof value.error !== "string" ||
    (value.phase === "ready" && value.error)
  )
    throw new Error("Invalid Launch Fix acknowledgement; retain evidence");
  return value;
}
const literal = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

/** No elevated executable is loaded from the writable request directory. The
 * source is an immutable argument to the foreground osascript request. */
export function buildLaunchFixCommand(
  directory: string,
  domain: string,
  token: string
) {
  if (
    !/^\/tmp\/yaagl-launch-fix\.[A-Za-z0-9]{10}$/.test(directory) ||
    !/^[a-z0-9.-]+$/.test(domain) ||
    !/^[0-9a-f]{64}$/.test(token)
  )
    throw new Error("Invalid Launch Fix identity");
  const command = [
    "/usr/bin/env",
    "-i",
    "PATH=/usr/bin:/bin:/usr/sbin:/sbin",
    "/usr/bin/perl",
    "-e",
    helper,
    directory,
    domain,
    token,
  ]
    .map(literal)
    .join(" ");
  const script = `try
do shell script "${command
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")}" with administrator privileges
on error detail number code
if code is -128 then return "Launch Fix authorization cancelled ${token}"
error detail number code
end try`;
  return `/usr/bin/osascript -e ${literal(script)}`;
}

const native = {
  async directory() {
    if (
      window.NL_OS !== "Darwin" ||
      window.NL_VERSION !== "4.11.0-yaagl-owned2"
    )
      throw new Error(
        "Launch Fix requires the local HK4E runtime with concurrent foreground execution and close protection"
      );
    const result = await exec([
      "/usr/bin/mktemp",
      "-d",
      "/tmp/yaagl-launch-fix.XXXXXXXXXX",
    ]);
    return result.stdOut.replace(/\n$/, "");
  },
  token: () =>
    Array.from(crypto.getRandomValues(new Uint8Array(32)), value =>
      value.toString(16).padStart(2, "0")
    ).join(""),
  execute: (command: string) => Neutralino.os.execCommand(command, {}),
  async read(path: string) {
    try {
      return await readFile(path);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        Reflect.get(error, "code") === "NE_FS_FILRDER"
      )
        return undefined;
      throw error;
    }
  },
  write: writeFile,
  // Evidence stays in the fresh directory after confirmed completion. It is
  // small and includes exact before/applied bytes and restoration result.
  pause: () => new Promise<void>(resolve => setTimeout(resolve, 50)),
  event: (text: string) => {
    void log(text).catch(() => undefined);
  },
};

/** A single privileged foreground operation, composed into either launch route.
 * Cancellation requests normal restoration; it cannot infer helper termination.
 * Files are retained even after success for the evidence collector. */
export function createLaunchFix(
  server: string,
  problem: (message: string) => void,
  io = native
) {
  const domain = server === "hk4e_global" ? OS_BLOCK_URL : CN_BLOCK_URL;
  let directory: string | undefined;
  const token = io.token();
  let execution:
    | Promise<{ result: Neutralino.os.ExecCommandResult } | { error: unknown }>
    | undefined;
  let completed: Awaited<NonNullable<typeof execution>> | undefined;
  let status: Status | undefined;
  let finishing = false;
  let retriedAttempt = -1;
  let started = false;
  let confirmed = false;
  let inspection = Promise.resolve();
  const errors: unknown[] = [];
  const notices = new Set<string>();
  const notify = (error: unknown) => {
    const text = `Launch Fix ${token}: ${String(
      error
    )}; evidence: ${directory}`;
    if (notices.has(text)) return;
    notices.add(text);
    problem(text);
    io.event(text);
  };
  const report = (error: unknown) => {
    if (errors.some(previous => String(previous) === String(error))) return;
    errors.push(error);
    notify(error);
  };
  function confirmation() {
    if (confirmed) return;
    confirmed = true;
    io.event(
      `Launch Fix ${token}: foreground completion and hosts restoration confirmed; evidence retained=${directory}`
    );
  }
  function pending(phase: string) {
    return setTimeout(() => {
      const message = `Launch Fix ${token}: ${phase} remains pending; close and new launch stay blocked. Evidence: ${
        directory ?? "directory preparation pending"
      }`;
      problem(message);
      io.event(message);
    }, 30000);
  }
  function inspect(): Promise<Status | undefined> {
    // A read may capture bytes before its RPC resolves. Serializing issuance,
    // rather than just assignment, prevents an older response overtaking a new
    // one when the monitor and cleanup overlap.
    const result = inspection.then(async () => {
      if (!directory) return;
      const text = await io.read(`${directory}/status.json`);
      if (text === undefined) return;
      const next = parse(text, token);
      if (
        status &&
        (next.attempt < status.attempt ||
          next.changed !== status.changed ||
          (status.phase !== "ready" && next.phase === "ready") ||
          (status.phase === "restored" && next.phase !== "restored"))
      )
        throw new Error("Launch Fix acknowledgement regressed");
      status = next;
      if (next.error) {
        // A host-restoration failure belongs to finish()/cleanup. Make it
        // visible immediately without also classifying it as a launch error.
        if (next.phase === "restore-error") notify(new Error(next.error));
        else report(new Error(next.error));
      }
      return next;
    });
    inspection = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
  async function terminal() {
    if (!completed) return false;
    if ("error" in completed)
      throw new Error(
        `Launch Fix foreground lifetime unconfirmed: ${String(completed.error)}`
      );
    const result = completed.result;
    // Do not compare a snapshot whose read began while the helper was still
    // running with its final stdout. This queued read starts only after we have
    // observed foreground completion and after all earlier reads settle.
    const acknowledged = await inspect();
    if (
      result.exitCode === 0 &&
      result.stdOut.trim() === `Launch Fix authorization cancelled ${token}`
    ) {
      if (status)
        throw new Error(
          "Launch Fix authorization result conflicts with helper evidence"
        );
      report(new Error("Launch Fix authorization cancelled before execution"));
      return true;
    }
    if (result.exitCode !== 0)
      throw new Error(
        `Launch Fix foreground exit ${result.exitCode}; restoration unconfirmed: ${result.stdErr}`
      );
    const final = parse(result.stdOut, token);
    if (
      !acknowledged ||
      final.phase !== "restored" ||
      JSON.stringify(final) !== JSON.stringify(acknowledged)
    )
      throw new Error(
        "Launch Fix restoration/foreground acknowledgements disagree"
      );
    return true;
  }
  return {
    errors: () => errors,
    async start() {
      const timer = pending("readiness");
      try {
        if (started)
          throw new Error("Launch Fix already issued for this request");
        started = true;
        directory = await io.directory();
        const command = buildLaunchFixCommand(directory, domain, token);
        io.event(
          `Launch Fix ${token}: domain=${domain}; evidence=${directory}; foreground execution requested`
        );
        // Retain transport failures, including synchronous failures, as unknown.
        execution = Promise.resolve()
          .then(() => io.execute(command))
          .then(
            result => ({ result }),
            error => ({ error })
          );
        void execution.then(value => {
          completed = value;
        });
        for (;;) {
          await inspect();
          if (await terminal())
            throw new Error("Launch Fix ended before game creation");
          if (status?.phase === "ready") {
            io.event(`Launch Fix ${token}: ready; changed=${status.changed}`);
            break;
          }
          if (status?.phase === "restore-error") throw new Error(status.error);
          await io.pause();
        }
        // The helper restores on its own after ten seconds. Keep failures visible
        // while the game runs; final cleanup still checks both acknowledgements.
        void (async () => {
          while (!finishing && !completed) {
            await io.pause();
            if (!finishing) await inspect();
          }
          if (!finishing) {
            await inspect();
            await terminal();
          }
        })().catch(report);
      } finally {
        clearTimeout(timer);
      }
    },
    async finish() {
      const timer = pending("foreground completion/restoration");
      try {
        finishing = true;
        if (!execution || !directory) return;
        await inspect();
        if (await terminal()) {
          confirmation();
          return;
        }
        if (status?.phase === "restore-error") {
          if (retriedAttempt < status.attempt) {
            retriedAttempt = status.attempt;
            throw new Error(status.error);
          }
          await io.write(
            `${directory}/control`,
            `${token} retry ${status.attempt + 1}\n`
          );
        } else await io.write(`${directory}/control`, `${token} finish\n`);
        for (;;) {
          await inspect();
          if (await terminal()) {
            confirmation();
            return;
          }
          if (
            status?.phase === "restore-error" &&
            status.attempt > retriedAttempt
          ) {
            retriedAttempt = status.attempt;
            throw new Error(status.error);
          }
          await io.pause();
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
