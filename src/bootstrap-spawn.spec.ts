import { afterEach, expect, it, vi } from "vitest";
import { BootstrapSession } from "./bootstrap";
import { setBootstrapClock } from "./bootstrap-clock";
import { deferred } from "./utils/operation";
import { setKey, spawn } from "./utils/neu";

function setup() {
  const session = new BootstrapSession(async () => ({ phase: "starting" }));
  setBootstrapClock(session);
  vi.stubGlobal("Neutralino", {
    debug: { log: vi.fn().mockResolvedValue(undefined) },
    os: { spawnProcess: vi.fn() },
    storage: { setData: vi.fn() },
  });
  return session;
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
afterEach(() => {
  setBootstrapClock(undefined);
  vi.unstubAllGlobals();
});

it("rejects a sidecar creation cancelled while its pre-launch log was pending", async () => {
  const session = setup(),
    logged = deferred<Awaited<ReturnType<typeof Neutralino.debug.log>>>();
  vi.mocked(Neutralino.debug.log).mockReturnValue(logged.promise);
  const starting = spawn(["fixture-sidecar"]);
  const rejected = expect(starting).rejects.toThrow("stopped");
  session.stop("cancelled", true);
  logged.resolve();
  await rejected;
  expect(Neutralino.os.spawnProcess).not.toHaveBeenCalled();
});

it("registers a late acknowledged sidecar cleanup before the close drain resolves", async () => {
  const session = setup(),
    acknowledged = deferred<{ pid: number; id: number }>();
  vi.mocked(Neutralino.os.spawnProcess).mockReturnValue(
    acknowledged.promise as Promise<Neutralino.os.SpawnProcessResult>
  );
  const register = vi.fn();
  const starting = spawn(["fixture-sidecar"], undefined, register);
  await settle();
  expect(Neutralino.os.spawnProcess).toHaveBeenCalledOnce();
  session.stop("cancelled", true);
  let drained = false;
  const draining = session.drainSpawns().then(() => {
    expect(register).toHaveBeenCalledWith({ pid: 42, id: 1 });
    drained = true;
  });
  await settle();
  expect(drained).toBe(false);
  acknowledged.resolve({ pid: 42, id: 1 });
  await Promise.all([starting, draining]);
  expect(drained).toBe(true);
});

it("does not create another sidecar or write configuration after a startup failure", async () => {
  const session = setup();
  session.stop("health failed");
  await expect(spawn(["fixture-sidecar"])).rejects.toThrow("stopped");
  await expect(setKey("fixture-setting", "changed")).rejects.toThrow("stopped");
  expect(Neutralino.os.spawnProcess).not.toHaveBeenCalled();
  expect(Neutralino.storage.setData).not.toHaveBeenCalled();
});

it("retains an issued spawn with a rejected acknowledgement instead of treating it as no child", async () => {
  const session = setup();
  vi.mocked(Neutralino.os.spawnProcess).mockRejectedValue(
    Error("response lost after creation")
  );
  await expect(spawn(["fixture-sidecar"])).rejects.toThrow("response lost");
  session.stop("creation unresolved");
  await expect(session.drainSpawns()).rejects.toThrow(
    "acknowledgement remains unresolved"
  );
  await expect(session.drainSpawns()).rejects.toThrow(
    "acknowledgement remains unresolved"
  );
});

it("retains a child whose cleanup registration failed after PID acknowledgement", async () => {
  const session = setup();
  vi.mocked(Neutralino.os.spawnProcess).mockResolvedValue({
    pid: 42,
    id: 1,
  } as Neutralino.os.SpawnProcessResult);
  await expect(
    spawn(["fixture-sidecar"], undefined, () => {
      throw Error("hook registration failed");
    })
  ).rejects.toThrow("hook registration failed");
  await expect(session.drainSpawns()).rejects.toThrow(
    "acknowledgement remains unresolved"
  );
});

it("rejects malformed creation identities and preserves unresolved lifetime", async () => {
  const session = setup();
  vi.mocked(Neutralino.os.spawnProcess).mockResolvedValue({
    pid: -1,
    id: 1,
  } as Neutralino.os.SpawnProcessResult);
  const register = vi.fn();
  await expect(spawn(["fixture-sidecar"], undefined, register)).rejects.toThrow(
    "Invalid sidecar creation acknowledgement"
  );
  expect(register).not.toHaveBeenCalled();
  await expect(session.drainSpawns()).rejects.toThrow(
    "acknowledgement remains unresolved"
  );
});
