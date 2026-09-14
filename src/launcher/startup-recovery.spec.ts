import { expect, it } from "vitest";
import { runStartupRecovery, queueStartupRecovery } from "./startup-recovery";
import { createLaunchOwnership, LaunchFailure } from "./launch-ownership";
import { deferred } from "../utils/operation";
import type { CommonUpdateProgram } from "../common-update-ui";

async function consume(program: CommonUpdateProgram) {
  for await (const step of program) void step;
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

it("keeps close and new launch blocked through the last startup restoration acknowledgement", async () => {
  const ownership = createLaunchOwnership(),
    acknowledged = deferred<void>();
  const running = consume(
    runStartupRecovery(async function* () {
      yield ["setUndeterminedProgress"];
      await acknowledged.promise;
    }, ownership)
  );
  await settle();
  expect(ownership.beginClose()).toBe(false);
  expect(ownership.reserve()).toBeUndefined();
  expect(ownership.state().held).toBe(true);
  acknowledged.resolve();
  await running;
  expect(ownership.state().held).toBe(false);
  expect(ownership.beginClose()).toBe(true);
});

it("retains an unhandled restoration failure without forcing release or an automatic retry", async () => {
  const ownership = createLaunchOwnership();
  let attempts = 0;
  await expect(
    consume(
      runStartupRecovery(async function* () {
        attempts++;
        yield ["setUndeterminedProgress"];
        throw Error("restore acknowledgement lost");
      }, ownership)
    )
  ).rejects.toBeInstanceOf(LaunchFailure);
  expect(attempts).toBe(1);
  expect(ownership.state()).toMatchObject({
    held: true,
    failed: true,
    canRetry: false,
  });
  expect(ownership.state().detail).toContain("restore acknowledgement lost");
  expect(ownership.beginClose()).toBe(false);
  expect(ownership.reserve()).toBeUndefined();
});

it("preserves an initialization program's handled recovery and releases after that recovery succeeds", async () => {
  const ownership = createLaunchOwnership(),
    repaired = deferred<void>();
  const running = consume(
    runStartupRecovery(async function* () {
      try {
        throw Error("first restoration step failed");
      } catch {
        yield ["setUndeterminedProgress"];
        await repaired.promise;
      }
    }, ownership)
  );
  await settle();
  expect(ownership.beginClose()).toBe(false);
  repaired.resolve();
  await running;
  expect(ownership.state().held).toBe(false);
  expect(ownership.state().failed).toBe(false);
});

it("does not begin restoration if normal close already owns the launcher", async () => {
  const ownership = createLaunchOwnership();
  let started = false;
  expect(ownership.beginClose()).toBe(true);
  await expect(
    consume(
      runStartupRecovery(async function* () {
        started = true;
        yield ["setUndeterminedProgress"];
      }, ownership)
    )
  ).rejects.toBeInstanceOf(LaunchFailure);
  expect(started).toBe(false);
});

it("reserves before the queue begins executing the startup generator", async () => {
  const ownership = createLaunchOwnership(),
    scheduled = deferred<void>();
  let started = false;
  const queue = {
    next: (task: () => CommonUpdateProgram) =>
      scheduled.promise.then(() => consume(task())),
  };
  const running = queueStartupRecovery(
    queue,
    async function* () {
      started = true;
      yield ["setUndeterminedProgress"];
    },
    ownership
  );
  expect(started).toBe(false);
  expect(ownership.reserve()).toBeUndefined();
  expect(ownership.beginClose()).toBe(false);
  scheduled.resolve();
  await running;
  expect(started).toBe(true);
  expect(ownership.state().held).toBe(false);
});
