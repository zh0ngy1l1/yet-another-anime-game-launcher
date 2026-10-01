import { afterEach, expect, it, vi } from "vitest";
import {
  createLaunchOwnership,
  launchOwnership,
  LaunchFailure,
} from "./launch-ownership";
import { GLOBAL_onClose, addTerminationHook, shutdown } from "../utils/neu";
import { createTaskQueueState } from "./task-queue";
import { createLaunchTransaction } from "../clients/mhy/hk4e/launch-transaction";
import { deferred } from "../utils/operation";
import type { Locale } from "../locale";
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
afterEach(() => {
  launchOwnership.cancelClose();
  vi.unstubAllGlobals();
});
it("reserves before async selection and rejects duplicate or stale release", async () => {
  const own = createLaunchOwnership(),
    ticket = own.reserve();
  if (!ticket) throw Error("Missing ticket");
  expect(own.reserve()).toBeUndefined();
  expect(own.beginClose()).toBe(false);
  const lease = own.claim();
  ticket.release();
  expect(own.state().held).toBe(true);
  expect(() => own.claim()).toThrow(LaunchFailure);
  lease.finish();
  const next = own.reserve();
  if (!next) throw Error("Missing next ticket");
  ticket.release();
  expect(own.state().held).toBe(true);
  expect(() => lease.finish()).toThrow("Stale");
  next.release();
});
it("normal close reserves before asynchronous hooks and keeps LIFO ordering across vetoes", async () => {
  const calls: number[] = [],
    pending = deferred<boolean>();
  let first = true;
  const remove1 = addTerminationHook(async () => {
    calls.push(1);
    return true;
  });
  const remove2 = addTerminationHook(async () => {
    calls.push(2);
    if (first) {
      first = false;
      return pending.promise;
    }
    return false;
  });
  try {
    const closing = GLOBAL_onClose(false);
    expect(launchOwnership.reserve()).toBeUndefined();
    pending.resolve(false);
    expect(await closing).toBe(false);
    expect(calls).toEqual([2]);
    expect(await GLOBAL_onClose(false)).toBe(false);
    expect(calls).toEqual([2, 2]);
    const ticket = launchOwnership.reserve();
    if (!ticket) throw Error("Missing ticket");
    expect(ticket).toBeDefined();
    ticket.release();
  } finally {
    remove2();
    remove1();
  }
});
it("shutdown waits for the transaction and reserves the gap before termination hooks", async () => {
  const owner = launchOwnership.claim(),
    hookGate = deferred<void>();
  const hook = vi.fn(async () => {
    await hookGate.promise;
    return true;
  });
  const remove = addTerminationHook(hook);
  try {
    const exiting = shutdown();
    await settle();
    expect(hook).not.toHaveBeenCalled();
    expect(launchOwnership.reserve()).toBeUndefined();
    owner.finish();
    expect(launchOwnership.reserve()).toBeUndefined();
    await settle();
    expect(hook).toHaveBeenCalledOnce();
    expect(await GLOBAL_onClose(false)).toBe(false);
    hookGate.resolve();
    await exiting;
  } finally {
    remove();
  }
});
it("the actual queue retains failed transaction cleanup and accepts a fresh task after recovery", async () => {
  const locale = { format: (key: string) => key } as unknown as Locale;
  const [status, , busy, queue] = createTaskQueueState({ locale });
  const preparation = deferred<void>();
  let cleanupAttempts = 0;
  const ticket = launchOwnership.reserve();
  if (!ticket) throw Error("Missing ticket");
  const queued = queue.next(() =>
    createLaunchTransaction(
      {
        async prepare(_signal, progress) {
          progress(["setUndeterminedProgress"]);
          await preparation.promise;
          throw Error("setup failed");
        },
        async launch() {
          throw Error("unexpected launch");
        },
        async gameExit() {
          throw Error("unexpected observation");
        },
        companion() {
          throw Error("unexpected helper");
        },
        async cleanup() {
          return ++cleanupAttempts === 1 ? [Error("restore denied")] : [];
        },
      },
      launchOwnership.claim()
    ).program()
  );
  await settle();
  expect(busy()).toBe(true);
  ticket.release();
  expect(await GLOBAL_onClose(false)).toBe(false);
  preparation.resolve();
  await settle();
  expect(launchOwnership.state()).toMatchObject({
    held: true,
    failed: true,
    canRetry: true,
  });
  expect(busy()).toBe(true);
  launchOwnership.retry();
  await queued;
  expect(busy()).toBe(false);
  expect(status()).toBe(
    "Launch finished with an error: setup failed Cleanup completed. See the launch log for details."
  );
  expect(launchOwnership.state().held).toBe(false);
  let ran = false;
  await queue.next(async function* () {
    ran = true;
    yield ["setUndeterminedProgress"];
  });
  expect(ran).toBe(true);
  await queue.return();
});
it("queue fatal errors release only an unclaimed primary reservation before shutdown", async () => {
  vi.stubGlobal("Neutralino", {
    os: { showMessageBox: async () => undefined },
    app: { exit: vi.fn() },
  });
  const [, , , queue] = createTaskQueueState({ locale: {} as Locale });
  const ticket = launchOwnership.reserve();
  if (!ticket) throw Error("Missing ticket");
  await queue.next(async function* () {
    throw Error("unrelated pre-launch task failed");
  });
  expect(Neutralino.app.exit).toHaveBeenCalledWith(-1);
  ticket.release();
});
it("preserves separate observation and cleanup history when wrapping a launch failure", () => {
  const primary = new Error("game exited");
  const earlier = new LaunchFailure(
    "first failure",
    primary,
    [new Error("registry restore denied")],
    [new Error("game observation delayed")]
  );
  const wrapped = new LaunchFailure(
    "cleanup completed after recovery",
    earlier,
    [new Error("file restore denied")],
    [new Error("Wine observation delayed")]
  );
  expect(wrapped.primary).toBe(primary);
  expect(wrapped.cleanupErrors).toEqual([
    new Error("registry restore denied"),
    new Error("file restore denied"),
  ]);
  expect(wrapped.observationErrors).toEqual([
    new Error("game observation delayed"),
    new Error("Wine observation delayed"),
  ]);
});

it("keeps progress independent from errors, pins confirmed running status, and clears stale errors on the next launch", () => {
  const own = createLaunchOwnership(),
    owner = own.claim();
  owner.phase("Preparing game…");
  expect(own.state()).toMatchObject({ failed: false, error: "" });
  owner.problem("A genuine preparation failure");
  owner.phase("Restoring files");
  expect(own.state().error).toBe("A genuine preparation failure");
  expect(own.state().detail).toBe("Restoring files");
  owner.finish();
  const next = own.claim();
  expect(own.state()).toMatchObject({ failed: false, error: "", warning: "" });
  next.running();
  next.phase("FPS discovery");
  expect(own.state().detail).toBe(
    "Game is running (DO NOT CLOSE THE LAUNCHER)"
  );
  expect(own.state().error).toBe("");
  next.ended();
  next.succeed();
  next.finish();
  expect(own.state()).toMatchObject({ held: false, failed: false, error: "" });
});

it("clears only the completing operation's status and preserves newer progress and warnings", () => {
  const own = createLaunchOwnership(),
    old = own.claim();
  old.succeed();
  old.finish();
  expect(own.state().detail).toBe("");
  const newer = own.claim();
  newer.phase("Preparing game…");
  newer.warning("An optional feature is unavailable");
  old.succeed();
  expect(own.state()).toMatchObject({
    detail: "Preparing game…",
    warning: "An optional feature is unavailable",
  });
  newer.succeed();
  newer.finish();
  expect(own.state()).toMatchObject({
    detail: "",
    warning: "An optional feature is unavailable",
    failed: false,
  });
});

it("labels observation and cleanup retries without changing either retry gate", async () => {
  const own = createLaunchOwnership(),
    owner = own.claim();
  const observation = owner.waitForRetry(
    "Cannot confirm game exit",
    "Check game status again"
  );
  expect(own.state()).toMatchObject({
    canRetry: true,
    retryLabel: "Check game status again",
    held: true,
  });
  expect(own.beginClose()).toBe(false);
  own.retry();
  await observation;
  const cleanup = owner.waitForRetry("Could not restore settings");
  expect(own.state()).toMatchObject({
    canRetry: true,
    retryLabel: "Retry safe cleanup",
    held: true,
  });
  own.retry();
  await cleanup;
  owner.succeed();
  owner.finish();
});
