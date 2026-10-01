import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBootstrapAdapter } from "./bootstrap-compat";
import { BootstrapSession, startBootstrap } from "./bootstrap";
import { setBootstrapClock } from "./bootstrap-clock";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  setBootstrapClock(undefined);
  vi.clearAllTimers();
  vi.useRealTimers();
});

function stock(channel = "hkrpgos") {
  const show = vi.fn(async () => undefined);
  const failure = vi.fn();
  const bootstrap = createBootstrapAdapter({
    channel,
    native: undefined,
    show,
    failure,
  });
  return { bootstrap, show, failure };
}

it("preserves the native bootstrap protocol whenever it is available", async () => {
  const native = vi.fn(async () => ({ phase: "starting" as const }));
  const show = vi.fn();
  const failure = vi.fn();
  const bootstrap = createBootstrapAdapter({
    channel: "hkrpgos",
    native,
    show,
    failure,
  });
  expect(bootstrap).toBe(native);
  await bootstrap({ op: "begin" });
  expect(native).toHaveBeenCalledWith({ op: "begin" });
  expect(show).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([undefined, "", "hk4ecn", "hk4eos", "hk4euniversal", "unknown-client"])(
  "retains native admission for %s",
  async channel => {
    const show = vi.fn();
    const bootstrap = createBootstrapAdapter({
      channel,
      native: undefined,
      show,
      failure: vi.fn(),
    });
    await expect(bootstrap({ op: "begin" })).rejects.toThrow(
      "bootstrap API missing"
    );
    expect(show).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  }
);

it.each(["bh3glb", "hkrpgcn", "hkrpgos", "cbjq", "cbjqcn", "napcn", "napos"])(
  "shows the stock %s window before admitting initialization",
  async channel => {
    const { bootstrap, show } = stock(channel);
    await expect(bootstrap({ op: "begin" })).resolves.toEqual({
      phase: "starting",
    });
    await bootstrap({ op: "begin" });
    expect(show).toHaveBeenCalledOnce();
    await expect(bootstrap({ op: "ready" })).resolves.toEqual({
      phase: "ready",
    });
    expect(vi.getTimerCount()).toBe(0);
  }
);

it("uses the visible WebView clock for waits", async () => {
  const { bootstrap } = stock();
  await bootstrap({ op: "begin" });
  const settled = vi.fn();
  const waiting = bootstrap({ op: "wait", milliseconds: 250 }).then(settled);
  await vi.advanceTimersByTimeAsync(249);
  expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await waiting;
  expect(settled).toHaveBeenCalledWith({ phase: "starting" });
  await bootstrap({ op: "ready" });
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["ready", "fail", "cancel"] as const)(
  "releases pending waits on %s and prevents later readiness from reviving startup",
  async op => {
    const { bootstrap, failure } = stock();
    await bootstrap({ op: "begin" });
    const waiting = bootstrap({ op: "wait", milliseconds: 5000 });
    const status = await bootstrap({ op });
    await expect(waiting).resolves.toEqual(status);
    await expect(bootstrap({ op: "ready" })).resolves.toEqual(status);
    expect(vi.getTimerCount()).toBe(0);
    expect(failure).not.toHaveBeenCalled();
  }
);

it("checks elapsed time before accepting ready even if the JS watchdog was delayed", async () => {
  const { bootstrap, failure } = stock();
  await bootstrap({ op: "begin" });
  vi.setSystemTime(Date.now() + 90001);
  await expect(bootstrap({ op: "ready" })).resolves.toMatchObject({
    phase: "failed",
    message: expect.stringContaining("90 seconds"),
  });
  expect(failure).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("stops stalled stock initialization through the existing BootstrapSession gate", async () => {
  const failure = vi.fn();
  const render = vi.fn();
  let finishCreate!: (value: string) => void;
  const created = new Promise<string>(resolve => {
    finishCreate = resolve;
  });
  const bootstrap = createBootstrapAdapter({
    channel: "napos",
    native: undefined,
    show: async () => undefined,
    failure: message => session.stop(message),
  });
  const session = new BootstrapSession(bootstrap);
  const pending = startBootstrap({
    session,
    create: () => created,
    render,
    failure,
  });
  await vi.advanceTimersByTimeAsync(90000);
  await pending;
  expect(failure).toHaveBeenCalledOnce();
  expect(session.isReady()).toBe(false);
  finishCreate("late UI");
  await Promise.resolve();
  expect(render).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds a stalled show acknowledgement and never admits create afterward", async () => {
  let finishShow!: () => void;
  const showing = new Promise<void>(resolve => {
    finishShow = resolve;
  });
  const failure = vi.fn();
  const create = vi.fn();
  const bootstrap = createBootstrapAdapter({
    channel: "bh3glb",
    native: undefined,
    show: () => showing,
    failure: message => session.stop(message),
  });
  const session = new BootstrapSession(bootstrap);
  const pending = startBootstrap({ session, create, render: vi.fn(), failure });
  await vi.advanceTimersByTimeAsync(90000);
  await pending;
  finishShow();
  await Promise.resolve();
  expect(create).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("clears the deadline when the stock window cannot be shown", async () => {
  const bootstrap = createBootstrapAdapter({
    channel: "hkrpgcn",
    native: undefined,
    show: async () => {
      throw Error("Window unavailable");
    },
    failure: vi.fn(),
  });
  await expect(bootstrap({ op: "begin" })).resolves.toEqual({
    phase: "failed",
    message: "Window unavailable",
  });
  expect(vi.getTimerCount()).toBe(0);
});
