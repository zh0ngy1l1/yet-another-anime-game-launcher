import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, delay, observe, OperationClock } from "./operation";
const clock: OperationClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("bounded operation observation", () => {
  it.each([true, false])(
    "removes timeout and cancellation listener on settlement (success=%s)",
    async success => {
      const abort = new AbortController();
      const remove = vi.spyOn(abort.signal, "removeEventListener");
      const operation = success
        ? Promise.resolve(7)
        : Promise.reject(new Error("failed"));
      expect(await observe(operation, 50, clock, abort.signal)).toEqual(
        success
          ? { kind: "value", value: 7 }
          : { kind: "error", error: new Error("failed") }
      );
      expect(remove).toHaveBeenCalledTimes(1);
    }
  );
  it("bounds a wait without claiming to cancel the operation", async () => {
    const pending = deferred<number>();
    const observed = observe(pending.promise, 5, clock);
    await vi.advanceTimersByTimeAsync(5);
    expect(await observed).toEqual({ kind: "timeout" });
    pending.resolve(9);
    await Promise.resolve();
    expect(await observe(pending.promise, 5, clock)).toEqual({
      kind: "value",
      value: 9,
    });
  });
  it.each([true, false])(
    "cancels an observation (already aborted=%s) and observes late rejection",
    async already => {
      const abort = new AbortController();
      if (already) abort.abort();
      let reject!: (error: unknown) => void;
      const operation = new Promise<never>((_, no) => {
        reject = no;
      });
      const observed = observe(operation, 50, clock, abort.signal);
      abort.abort();
      expect(await observed).toEqual({ kind: "cancelled" });
      reject(new Error("late"));
      await Promise.resolve();
      expect(await observe(operation, 50, clock)).toEqual({
        kind: "error",
        error: new Error("late"),
      });
    }
  );
  it("does not accumulate promise callbacks across repeated session polling", async () => {
    const pending = deferred<void>();
    const then = vi.spyOn(pending.promise, "then");
    for (let i = 0; i < 100; i++) {
      const observing = observe(pending.promise, 1, clock);
      await vi.advanceTimersByTimeAsync(1);
      expect(await observing).toEqual({ kind: "timeout" });
    }
    expect(then).toHaveBeenCalledTimes(1);
    pending.resolve();
  });
  it.each([true, false])(
    "clears cancellable delay (cancel=%s)",
    async cancel => {
      const abort = new AbortController();
      const remove = vi.spyOn(abort.signal, "removeEventListener");
      const waiting = delay(5, clock, abort.signal);
      if (cancel) abort.abort();
      else await vi.advanceTimersByTimeAsync(5);
      await waiting;
      expect(remove).toHaveBeenCalledTimes(1);
    }
  );
});
