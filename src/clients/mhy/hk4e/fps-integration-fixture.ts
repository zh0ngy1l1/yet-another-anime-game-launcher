import { vi, expect } from "vitest";
import { deferred } from "../../../utils/operation";
import { prepareFpsBridge, BridgeStatus } from "./fps-bridge";
export function boundary(steamPatch = false) {
  const token = "b".repeat(64);
  const status: BridgeStatus = {
    version: 2,
    token,
    sequence: 0,
    launched: 0,
    pid: 0,
    primaryExited: 0,
    active: 0,
    generation: 0,
    workerState: 0,
    workerDone: 1,
    workerError: 0,
    launchError: 0,
    error: 0,
    released: 0,
    shimPid: 0,
    shimExited: 0,
    steamReady: 0,
    steamError: 0,
    steamActive: 0,
  };
  const direct = deferred<{ confirmed: boolean; status?: number }>();
  const events: string[] = [];
  let stopPending = false,
    badArtifact = false,
    badResponse = false;
  let registryFailure: string | undefined;
  const command = async (_dir: string, text: string) => {
    const [id, sequence, operation, generation, fps] = text.trim().split(" ");
    expect(id).toBe(token);
    expect(Number(sequence)).toBe(status.sequence + 1);
    events.push(operation);
    status.sequence = Number(sequence);
    status.error = 0;
    if (operation === "launch") {
      status.launched = 1;
      status.pid = 42;
      status.active = 1;
      if (steamPatch) {
        status.shimPid = 40;
        status.steamReady = 1;
        status.steamActive = 3;
      }
    }
    if (operation === "start") {
      status.generation = Number(generation);
      status.workerState = 2;
      status.workerDone = 0;
      events.push(`fps:${fps}`);
    }
    if (operation === "stop" && !stopPending) {
      status.workerDone = 1;
      status.workerState = 3;
    }
    if (operation === "release") {
      if (status.active || status.steamActive || !status.workerDone)
        status.error = 170;
      else status.released = 1;
    }
  };
  const start = (
    request: import("../../../wine/owned-execution").OwnedWineRequest
  ) => {
    if (request.args[0] === "--registry") {
      events.push(`registry:${request.args[1]}`);
      const result = Promise.resolve({
        confirmed: true,
        status: request.args[1] === registryFailure ? 1280 : 0,
      });
      return {
        started: Promise.resolve(),
        completion: result,
        stop: () => result,
      };
    }
    return {
      started: Promise.resolve(),
      completion: direct.promise,
      stop: () => direct.promise,
    };
  };
  const io = {
    directory: async () => "/tmp/request",
    token: () => token,
    stage: vi.fn(
      async (_directory: string, _steamPatch = false) =>
        "/tmp/request/fps-bridge.exe"
    ),
    verify: vi.fn(async (path: string, _steamPatch = false) => {
      expect(path).toBe("/tmp/request/fps-bridge.exe");
      if (badArtifact) throw new Error("replaced artifact");
    }),
    read: async () =>
      JSON.stringify({
        ...status,
        ...(badResponse ? { token: "c".repeat(64) } : {}),
      }),
    command: vi.fn(command),
    start: vi.fn(start),
    remove: vi.fn(async () => undefined),
    pause: () => new Promise<void>(resolve => setTimeout(resolve, 10)),
  };
  const wine = {
    loader: "/selected/wine64",
    prefix: "/selected/prefix",
    environment: {
      KEEP: "kept",
      DXMT_CONFIG: "other=kept;d3d11.preferredMaxFrameRate=120;",
    },
  };
  const diagnostic = vi.fn();
  const prepare = () =>
    prepareFpsBridge(
      {
        wine,
        executable: "/game/GenshinImpact.exe",
        steamPatch,
        gameDirectory: "/game",
        gameDxmtConfig: "other=kept;d3d11.preferredMaxFrameRate=0;",
        log: "/logs/game.log",
        diagnostic,
      },
      io
    );
  return {
    command,
    start,
    token,
    status,
    direct,
    events,
    io,
    wine,
    diagnostic,
    prepare,
    delayStop: () => {
      stopPending = true;
    },
    replace: () => {
      badArtifact = true;
    },
    corrupt: (value: boolean) => {
      badResponse = value;
    },
    failRegistry: (operation?: string) => {
      registryFailure = operation;
    },
    exit: () => {
      status.primaryExited = 1;
      status.active = 0;
      if (steamPatch) {
        status.shimExited = 1;
        status.steamActive = 0;
      }
    },
    stopped: () => {
      status.workerDone = 1;
      status.workerState = 3;
    },
  };
}
