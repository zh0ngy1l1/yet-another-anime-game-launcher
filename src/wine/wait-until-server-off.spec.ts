import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "../utils/neu";
import { createWine } from "./wine";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

type ProcessEvent = {
  detail: Pick<Neutralino.os.SpawnProcessResult, "id" | "action" | "data">;
};

function mockNeutralino() {
  const handlers = new Set<(event: ProcessEvent) => void>();
  const started = deferred<void>();
  const request = deferred<Neutralino.os.ExecCommandResult>();
  let nextPid = 1000;
  const execCommand = vi.fn(() => {
    started.resolve();
    return request.promise;
  });

  vi.stubGlobal("window", { NL_CWD: "/", NL_PATH: "/launcher root" });
  vi.stubGlobal("Neutralino", {
    debug: { log: vi.fn().mockResolvedValue(undefined) },
    filesystem: { getStats: vi.fn().mockResolvedValue({}) },
    storage: { getData: vi.fn().mockResolvedValue("DESKTOP-TESTING") },
    os: {
      execCommand,
      // Model reuse of a virtual ID while the older process's exit is in flight.
      spawnProcess: vi.fn(async () => ({ id: 7, pid: nextPid++ })),
    },
    events: {
      on: vi.fn(async (_: string, handler: (event: ProcessEvent) => void) => {
        handlers.add(handler);
        started.resolve();
      }),
      off: vi.fn(async (_: string, handler: (event: ProcessEvent) => void) => {
        handlers.delete(handler);
      }),
    },
  });

  return { handlers, started, request, execCommand };
}

const createTestWine = () =>
  createWine({
    prefix: "/prefix with spaces",
    distro: {
      id: "test",
      displayName: "Test Wine",
      remoteUrl: "",
      attributes: {},
    },
  });

// Advance one event-loop turn so all promise continuations have run.
const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Wine shutdown wait request ownership", () => {
  it.each([0, 143])(
    "ignores a stale exit %i for a reused spawned-process ID",
    async exitCode => {
      const { handlers, started, request, execCommand } = mockNeutralino();
      const previousProcess = await spawn(["previous-process"]);
      const wine = await createTestWine();
      let settled = false;
      const waiting = wine.waitUntilServerOff();
      const observed = waiting.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      const result = {
        pid: 2000,
        exitCode: 0,
        stdOut: "wait stdout",
        stdErr: "wait stderr",
      };

      try {
        // Synchronize with either the old listener or the command request.
        await started.promise;
        expect(settled).toBe(false);
        for (const handler of handlers) {
          handler({
            detail: {
              id: previousProcess.id,
              action: "exit",
              data: `${exitCode}`,
            },
          });
        }
        await flushPromises();
        expect(settled).toBe(false);

        expect(execCommand).toHaveBeenCalledWith(
          String.raw`WINEDEBUG=fixme-all,err-unwind,+timestamp WINEPREFIX=/prefix\ with\ spaces /launcher\ root/wine/bin/wineserver -w`,
          {}
        );
        request.resolve(result);
        await expect(waiting).resolves.toEqual(result);
      } finally {
        request.resolve(result);
        await observed;
        handlers.clear();
      }
    }
  );

  it("rejects a nonzero result from its own request with its diagnostic output", async () => {
    const { handlers, started, request } = mockNeutralino();
    const wine = await createTestWine();
    const waiting = wine.waitUntilServerOff();
    const rejection = expect(waiting).rejects.toThrow(
      "Command return non-zero code (143)"
    );

    try {
      await started.promise;
      request.resolve({
        pid: 2000,
        exitCode: 143,
        stdOut: "own stdout",
        stdErr: "own failure",
      });
      await rejection;
      await expect(waiting).rejects.toThrow(
        "StdOut:\nown stdout\nStdErr:\nown failure"
      );
    } finally {
      handlers.clear();
    }
  });
});
