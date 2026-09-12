import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOwnedWineCommand,
  startOwnedWineExecution,
  OwnedWineRequest,
} from "./owned-execution";
import type { OperationClock } from "../utils/operation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const clock: OperationClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const nativeResult = (
  data: object = { spawned: 1, confirmed: 1, status: 0, error: "" }
) => ({ pid: 777, exitCode: 0, stdOut: JSON.stringify(data), stdErr: "" });
const request: OwnedWineRequest = Object.freeze({
  wine: Object.freeze({
    loader: "/wine distro/bin/wine64",
    prefix: "/prefix with spaces",
    environment: Object.freeze({
      KEEP: "untouched",
      EMPTY: "",
      WINEPREFIX: "/wrong prefix",
    }),
  }),
  executable: "/verified path/it's $fps/unlockfps.exe",
  args: Object.freeze(["150"]),
  environment: Object.freeze({
    DXMT_CONFIG: "other=1;d3d11.preferredMaxFrameRate=150;",
  }),
});
function nativeHarness() {
  const files = new Map<string, string>();
  const launched: {
    directory: string;
    exit: ReturnType<typeof deferred<Neutralino.os.ExecCommandResult>>;
  }[] = [];
  let sequence = 0;
  let ready = true;
  let stopCompletes = true;
  const writeFile = vi.fn(async (path: string, value: string) => {
    files.set(path, value);
    if (path.endsWith("/stop") && stopCompletes) {
      launched
        .find(item => path === item.directory + "/stop")
        ?.exit.resolve(nativeResult());
    }
  });
  const readFile = vi.fn(async (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw { code: "NE_FS_FILRDER" };
    return value;
  });
  const execCommand = vi.fn(async (command: string) => {
    if (command.startsWith("/usr/bin/mktemp")) {
      const directory = `/tmp/yaagl-owned-wine.${String(++sequence).padStart(
        10,
        "0"
      )}`;
      return { ...nativeResult(), stdOut: directory + "\n" };
    }
    if (command.startsWith("'/usr/bin/env'")) {
      const directory = `/tmp/yaagl-owned-wine.${String(sequence).padStart(
        10,
        "0"
      )}`;
      const exit = deferred<Neutralino.os.ExecCommandResult>();
      launched.push({ directory, exit });
      if (ready) files.set(directory + "/ready", "ready");
      return exit.promise;
    }
    if (command.startsWith("/bin/rm -f --")) {
      for (const path of files.keys())
        if (command.includes(path)) files.delete(path);
      return nativeResult();
    }
    if (command.startsWith("/bin/rmdir --")) return nativeResult();
    throw new Error("Unexpected command: " + command);
  });
  const forbidden = vi.fn(() => {
    throw new Error("Unowned native process API");
  });
  vi.stubGlobal("window", { NL_OS: "Darwin" });
  vi.stubGlobal("Neutralino", {
    debug: { log: vi.fn().mockResolvedValue(undefined) },
    filesystem: { writeFile, readFile },
    os: {
      execCommand,
      spawnProcess: forbidden,
      updateSpawnedProcess: forbidden,
      getSpawnedProcesses: forbidden,
    },
    events: { on: forbidden, off: forbidden },
  });
  return {
    files,
    launched,
    execCommand,
    writeFile,
    readFile,
    forbidden,
    noAcknowledgement: () => {
      ready = false;
    },
    holdStop: () => {
      stopCompletes = false;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("owned Wine native adapter", () => {
  it("distinguishes acknowledgement from request-owned exit completion", async () => {
    const h = nativeHarness();
    const execution = startOwnedWineExecution(request, undefined, clock);
    let finished = false;
    void execution.completion.then(() => {
      finished = true;
    });
    await tick();
    await execution.started;
    expect(finished).toBe(false);
    expect(h.execCommand).toHaveBeenCalledWith(
      expect.stringContaining("'/wine distro/bin/wine64'"),
      {}
    );
    expect(h.writeFile).toHaveBeenCalledWith(
      h.launched[0].directory + "/supervisor.pl",
      expect.stringContaining("waitpid($pid, WNOHANG)")
    );
    h.launched[0].exit.resolve(nativeResult());
    expect(await execution.completion).toEqual({ confirmed: true, status: 0 });
    expect(h.files.size).toBe(0);
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it("coalesces stop writes and confirms completion before deleting mailbox", async () => {
    const h = nativeHarness();
    h.holdStop();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const stopped = execution.stop();
    expect(execution.stop()).toBe(stopped);
    await tick();
    expect(h.files.get(h.launched[0].directory + "/stop")).toBe("stop");
    expect(
      h.execCommand.mock.calls.some(([command]) =>
        command.startsWith("/bin/rm")
      )
    ).toBe(false);
    h.launched[0].exit.resolve(nativeResult());
    expect((await stopped).confirmed).toBe(true);
    expect(
      h.writeFile.mock.calls.filter(([path]) => path.endsWith("/stop"))
    ).toHaveLength(1);
    expect(execution.stop()).toBe(stopped);
    expect(h.files.size).toBe(0);
  });
  it("stop during delayed directory allocation prevents native helper issuance", async () => {
    const h = nativeHarness();
    const allocation = deferred<Neutralino.os.ExecCommandResult>();
    h.execCommand.mockImplementationOnce(() => allocation.promise);
    const execution = startOwnedWineExecution(request, undefined, clock);
    const stopped = execution.stop();
    allocation.resolve({
      ...nativeResult(),
      stdOut: "/tmp/yaagl-owned-wine.1234567890\n",
    });
    expect(await stopped).toEqual({ confirmed: true });
    await expect(execution.started).rejects.toThrow(
      "stopped before acknowledgement"
    );
    expect(h.launched).toHaveLength(0);
  });
  it("stop during delayed script write prevents helper issuance", async () => {
    const h = nativeHarness();
    const write = deferred<void>();
    h.writeFile.mockReturnValueOnce(write.promise);
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const stopped = execution.stop();
    write.resolve();
    await stopped;
    expect(h.launched).toHaveLength(0);
  });
  it("observes late allocation rejection without unhandled background failure", async () => {
    const h = nativeHarness();
    const allocation = deferred<Neutralino.os.ExecCommandResult>();
    h.execCommand.mockImplementationOnce(() => allocation.promise);
    const execution = startOwnedWineExecution(request, undefined, clock);
    execution.stop();
    const error = new Error("allocation failed");
    allocation.reject(error);
    expect(await execution.completion).toMatchObject({
      confirmed: true,
      error,
    });
    expect(h.launched).toHaveLength(0);
  });
  it("handles native execution starting after cancellation through its private stop mailbox", async () => {
    const h = nativeHarness();
    h.noAcknowledgement();
    h.holdStop();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    execution.stop();
    await tick();
    const { directory, exit } = h.launched[0];
    expect(h.files.get(directory + "/stop")).toBe("stop");
    exit.resolve(
      nativeResult({ spawned: 0, confirmed: 1, status: 0, error: "" })
    );
    expect(await execution.completion).toEqual({ confirmed: true, status: 0 });
    expect(h.files.size).toBe(0);
  });
  it("retains mailbox on rejected native request and requests cooperative stop", async () => {
    const h = nativeHarness();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const error = new Error("transport disconnected");
    h.launched[0].exit.reject(error);
    expect(await execution.completion).toMatchObject({
      confirmed: false,
      error,
      retainedDirectory: h.launched[0].directory,
    });
    expect(h.files.get(h.launched[0].directory + "/stop")).toBe("stop");
    expect(
      h.execCommand.mock.calls.some(([command]) =>
        command.startsWith("/bin/rm")
      )
    ).toBe(false);
  });
  it("associates results with their own requests despite identical returned PIDs", async () => {
    const h = nativeHarness();
    const first = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const second = startOwnedWineExecution(request, undefined, clock);
    await tick();
    let secondFinished = false;
    void second.completion.then(() => {
      secondFinished = true;
    });
    h.launched[0].exit.resolve(nativeResult());
    await first.completion;
    h.launched[0].exit.resolve(nativeResult());
    await tick();
    expect(secondFinished).toBe(false);
    await first.stop();
    expect(secondFinished).toBe(false);
    await second.stop();
    expect(
      h.writeFile.mock.calls
        .filter(([path]) => path.endsWith("/stop"))
        .map(([path]) => path)
    ).toEqual([h.launched[1].directory + "/stop"]);
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it("exec failure is distinct from a successfully executed child's nonzero exit", async () => {
    const h = nativeHarness();
    h.noAcknowledgement();
    const failure = startOwnedWineExecution(request, undefined, clock);
    await tick();
    h.launched[0].exit.resolve(
      nativeResult({
        spawned: 0,
        confirmed: 1,
        status: 32512,
        error: "exec: missing loader",
      })
    );
    expect(await failure.completion).toMatchObject({
      confirmed: true,
      error: new Error("exec: missing loader"),
    });
    await expect(failure.started).rejects.toThrow("missing loader");
    const exited = startOwnedWineExecution(request, undefined, clock);
    await tick();
    h.launched[1].exit.resolve(
      nativeResult({ spawned: 1, confirmed: 1, status: 256, error: "" })
    );
    expect(await exited.completion).toEqual({ confirmed: true, status: 256 });
    await exited.started;
  });
  it.each(["garbage", "{}", '{"confirmed":0}', "null"])(
    "never confirms malformed native response %s",
    async stdOut => {
      const h = nativeHarness();
      const execution = startOwnedWineExecution(request, undefined, clock);
      await tick();
      h.launched[0].exit.resolve({ ...nativeResult(), stdOut });
      expect(await execution.completion).toMatchObject({
        confirmed: false,
        error: expect.any(Error),
        retainedDirectory: h.launched[0].directory,
      });
    }
  );
  it("reports native supervisor failure even with plausible output", async () => {
    const h = nativeHarness();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    h.launched[0].exit.resolve({ ...nativeResult(), exitCode: 15 });
    expect(await execution.completion).toMatchObject({
      confirmed: false,
      error: expect.any(Error),
    });
  });
  it("reports observation failure and stops the owned execution", async () => {
    const h = nativeHarness();
    const error = new Error("read permission error");
    h.readFile.mockRejectedValueOnce(error);
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    expect(await execution.completion).toMatchObject({
      confirmed: true,
      error,
    });
    await expect(execution.started).rejects.toBe(error);
    expect(h.files.size).toBe(0);
  });
  it("retains and reports a failed stop write even if exit is later confirmed", async () => {
    const h = nativeHarness();
    h.holdStop();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const error = new Error("stop write denied");
    h.writeFile.mockRejectedValueOnce(error);
    execution.stop();
    await tick();
    h.launched[0].exit.resolve(nativeResult());
    expect(await execution.completion).toMatchObject({
      confirmed: true,
      cleanupError: error,
      retainedDirectory: h.launched[0].directory,
    });
  });
  it("awaits a pending stop write before removing private resources", async () => {
    const h = nativeHarness();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const write = deferred<void>();
    h.writeFile.mockReturnValueOnce(write.promise);
    execution.stop();
    await tick();
    h.launched[0].exit.resolve(nativeResult());
    await tick();
    expect(
      h.execCommand.mock.calls.some(([command]) =>
        command.startsWith("/bin/rm")
      )
    ).toBe(false);
    write.resolve();
    await execution.completion;
    expect(h.files.size).toBe(0);
  });
  it("does not create a stop write while resource removal is pending", async () => {
    const h = nativeHarness();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const removal = deferred<Neutralino.os.ExecCommandResult>();
    h.execCommand.mockImplementationOnce(() => removal.promise);
    h.launched[0].exit.resolve(nativeResult());
    await tick();
    execution.stop();
    await tick();
    expect(
      h.writeFile.mock.calls.some(([path]) => path.endsWith("/stop"))
    ).toBe(false);
    removal.resolve(nativeResult());
    await execution.completion;
  });
  it("reports resource removal failure", async () => {
    const h = nativeHarness();
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    const error = new Error("remove failed");
    h.execCommand.mockRejectedValueOnce(error);
    h.launched[0].exit.resolve(nativeResult());
    expect(await execution.completion).toMatchObject({
      confirmed: true,
      cleanupError: error,
      retainedDirectory: h.launched[0].directory,
    });
  });
  it("rejects unsupported platform before issuing native operations", async () => {
    const h = nativeHarness();
    vi.stubGlobal("window", { NL_OS: "Linux" });
    const execution = startOwnedWineExecution(request, undefined, clock);
    expect(await execution.completion).toMatchObject({
      confirmed: true,
      error: expect.any(Error),
    });
    expect(h.execCommand).not.toHaveBeenCalled();
  });
  it("never removes an unrecognized allocation result", async () => {
    const h = nativeHarness();
    h.execCommand.mockResolvedValueOnce({
      ...nativeResult(),
      stdOut: "/unrelated\n",
    });
    const execution = startOwnedWineExecution(request, undefined, clock);
    expect(await execution.completion).toMatchObject({
      error: expect.any(Error),
    });
    expect(h.execCommand).toHaveBeenCalledTimes(1);
  });
});

describe("owned Wine command and input propagation", () => {
  it.each([1, 60, 61, 150, 360])(
    "preserves target %i, path, Wine context and process environment",
    target => {
      const input = {
        ...request,
        args: [String(target)],
        environment: {
          DXMT_CONFIG: `other=1;d3d11.preferredMaxFrameRate=${target};`,
          MORE: "'\n?$()",
        },
      };
      const before = JSON.stringify(input);
      const command = buildOwnedWineCommand("/private dir", input);
      expect(command).toContain("'WINEPREFIX=/prefix with spaces'");
      expect(command).not.toContain("/wrong prefix");
      expect(command).toContain("'KEEP=untouched' 'EMPTY='");
      expect(command).toContain(
        `'DXMT_CONFIG=other=1;d3d11.preferredMaxFrameRate=${target};'`
      );
      expect(command).toContain("'MORE='\\''\n?$()'");
      expect(command).toContain(
        "'/wine distro/bin/wine64' '/verified path/it'\\''s $fps/unlockfps.exe'"
      );
      expect(command.endsWith(`'${target}'`)).toBe(true);
      expect(JSON.stringify(input)).toBe(before);
    }
  );
  it("snapshots caller state before asynchronous setup", async () => {
    const h = nativeHarness();
    const input = {
      ...request,
      args: ["61"],
      environment: { KEEP: "before" },
      wine: { ...request.wine, environment: { OTHER: "before" } },
    };
    const execution = startOwnedWineExecution(input, undefined, clock);
    input.args[0] = "360";
    input.environment.KEEP = "after";
    input.wine.environment.OTHER = "after";
    await tick();
    const command = h.execCommand.mock.calls.find(([text]) =>
      text.startsWith("'/usr/bin/env'")
    )?.[0];
    expect(command).toContain("'KEEP=before'");
    expect(command).toContain("'OTHER=before'");
    expect(command?.endsWith("'61'")).toBe(true);
    await execution.stop();
  });
  it("rejects NUL and invalid environment keys without executing replacements", () => {
    expect(() =>
      buildOwnedWineCommand("/private", {
        ...request,
        executable: "/nul\0path",
      })
    ).toThrow("NUL");
    expect(() =>
      buildOwnedWineCommand("/private", {
        ...request,
        environment: { "BAD;key": "value" },
      })
    ).toThrow("environment key");
  });
  it("rejects relative loader or artifact paths without searching", async () => {
    const h = nativeHarness();
    for (const input of [
      { ...request, executable: "unlockfps.exe" },
      { ...request, wine: { ...request.wine, loader: "wine" } },
    ]) {
      expect(
        await startOwnedWineExecution(input, undefined, clock).completion
      ).toMatchObject({ error: expect.any(Error), confirmed: true });
    }
    expect(h.execCommand).not.toHaveBeenCalled();
  });
});

describe("controller using the production owned Wine adapter", () => {
  it("retains a pending native stop past the public deadline and handles eventual exit", async () => {
    const { createFpsCompanion } = await import(
      "../clients/mhy/hk4e/fps-companion"
    );
    const { buildFpsRuntimePlan } = await import(
      "../clients/mhy/hk4e/fps-runtime"
    );
    const { validateFpsUnlockDraft } = await import(
      "../clients/mhy/hk4e/config/fps-unlock-state"
    );
    const validated = validateFpsUnlockDraft({ enabled: true, target: "61" });
    if (!validated.ok) throw new Error("Invalid fixture");
    const plan = buildFpsRuntimePlan(validated.value, {
      renderBackend: "dxmt",
    });
    if (!plan.ok || !plan.value.companion)
      throw new Error("Missing fixture companion");
    const h = nativeHarness();
    h.holdStop();
    const controller = createFpsCompanion(
      {
        verifiedExecutable: request.executable,
        companion: plan.value.companion,
        wine: request.wine,
        game: { discover: async () => ({ isAlive: async () => true }) },
      },
      { clock, timing: { initializationMs: 0, pollMs: 1, cleanupTimeoutMs: 5 } }
    );
    controller.start();
    await tick();
    expect(h.launched).toHaveLength(1);
    const stopped = controller.stop();
    await tick(5);
    expect((await stopped).cleanup).toBe("unresolved");
    expect(h.files.get(h.launched[0].directory + "/stop")).toBe("stop");
    h.launched[0].exit.resolve(nativeResult());
    await tick();
    expect((await controller.completion).cleanup).toBe("confirmed");
    expect(h.files.size).toBe(0);
    expect(h.forbidden).not.toHaveBeenCalled();
  });
});

describe("owned Wine finalization races", () => {
  it("seals mailbox writes before awaiting a late acknowledgement read", async () => {
    const h = nativeHarness();
    const read = deferred<string>();
    h.readFile.mockReturnValueOnce(read.promise);
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    h.launched[0].exit.resolve(nativeResult());
    await tick();
    const stopped = execution.stop();
    await tick();
    expect(
      h.writeFile.mock.calls.some(([path]) => path.endsWith("/stop"))
    ).toBe(false);
    read.resolve("ready");
    expect((await stopped).confirmed).toBe(true);
    expect(h.files.size).toBe(0);
  });
  it("preserves the first observation failure when supervisor cleanup also reports failure", async () => {
    const h = nativeHarness();
    h.holdStop();
    const error = new Error("observation failed");
    h.readFile.mockRejectedValueOnce(error);
    const execution = startOwnedWineExecution(request, undefined, clock);
    await tick();
    h.launched[0].exit.resolve(
      nativeResult({
        spawned: 1,
        confirmed: 1,
        status: 0,
        error: "TERM failed",
      })
    );
    expect(await execution.completion).toMatchObject({
      confirmed: true,
      error,
      cleanupError: new Error("TERM failed"),
    });
  });
});
