import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { render } from "solid-js/web";
import { GLOBAL_onClose, exit, wait, timeout, logerror } from "./utils";
import { deferred } from "./utils/operation";
import type { BootstrapStatus } from "./bootstrap";

vi.mock("./app", () => ({ createApp: vi.fn() }));
vi.mock("./utils", () => {
  return {
    wait: vi.fn(),
    timeout: vi.fn(),
    sha256_16: vi.fn(),
    log: vi.fn(),
    logerror: vi.fn(),
    GLOBAL_onClose: vi.fn(),
    exit: vi.fn(),
  };
});
vi.mock("solid-js/web", () => ({ render: vi.fn() }));
vi.mock("libaria2-ts", () => ({ WebSocket: { Client: vi.fn() } }));
vi.mock("@hope-ui/solid", () => ({
  HopeProvider: vi.fn(),
  NotificationsProvider: vi.fn(),
}));
vi.mock("./launcher/launch-ownership", () => ({
  launchOwnership: { cancelClose: vi.fn() },
}));

const root = {
  textContent: "",
  setAttribute: vi.fn(),
  removeAttribute: vi.fn(),
};
const UI = () => null;
const settle = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
let phase: BootstrapStatus["phase"], nativeTime: number, shows: number;
let handlers: Record<
  string,
  (event: { detail: { message: string } | null }) => unknown
>;
let waits: { at: number; resolve: (status: BootstrapStatus) => void }[];
const native = vi.fn();
const setTitle = vi.fn();

// Advance only the injected native clock. JS timers deliberately remain frozen.
async function nativeTick(ms: number, deliverWatchdog = true) {
  nativeTime += ms;
  if (deliverWatchdog && nativeTime >= 90000 && phase === "starting") {
    phase = "failed";
    handlers.bootstrapFailure?.({
      detail: { message: "Native startup deadline expired" },
    });
  }
  const ready = waits.filter(
    wait => wait.at <= nativeTime || phase !== "starting"
  );
  waits = waits.filter(wait => !ready.includes(wait));
  for (const wait of ready) wait.resolve({ phase });
  await settle();
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.mocked(wait).mockImplementation((await import("./utils/helper")).wait);
  vi.mocked(timeout).mockImplementation(
    (await import("./utils/helper")).timeout
  );
  phase = "starting";
  nativeTime = 0;
  shows = 0;
  waits = [];
  handlers = {};
  root.textContent = "";
  vi.stubGlobal("document", { getElementById: () => root });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => {
      throw Error("Hidden WebView must not await paint");
    })
  );
  vi.stubGlobal("Neutralino", {
    init: vi.fn(),
    custom: { bootstrap: native },
    window: { show: vi.fn(), setTitle },
    events: {
      on: vi.fn((name, handler) => {
        handlers[name] = handler;
        return Promise.resolve();
      }),
    },
    os: { showMessageBox: vi.fn() },
  });
  native.mockImplementation(async input => {
    if (input.op === "wait")
      return new Promise(resolve =>
        waits.push({ at: nativeTime + input.milliseconds, resolve })
      );
    if (input.op === "ready" && phase === "starting") {
      if (nativeTime >= 90000) phase = "failed";
      else {
        phase = "ready";
        shows++;
      }
    }
    if (input.op === "fail" && phase === "starting") phase = "failed";
    if (input.op === "cancel") phase = "cancelled";
    if (phase !== "starting") {
      for (const wait of waits) wait.resolve({ phase });
      waits = [];
    }
    return { phase };
  });
  vi.mocked(GLOBAL_onClose).mockResolvedValue(true);
  vi.mocked(logerror).mockResolvedValue(undefined);
  setTitle.mockResolvedValue(undefined);
});

afterEach(async () => {
  (await import("./bootstrap-clock")).setBootstrapClock(undefined);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps normal startup hidden until the initialized DOM is installed, then shows once without painting", async () => {
  const app = deferred<typeof UI>();
  vi.mocked(createApp).mockReturnValue(app.promise);
  await import("./index");
  await settle();
  expect(createApp).toHaveBeenCalledOnce();
  expect(setTitle).toHaveBeenCalledWith("Yaagl OS");
  expect(root.textContent).toBe("");
  expect(shows).toBe(0);
  expect(Neutralino.window.show).not.toHaveBeenCalled();
  await nativeTick(12000);
  expect(render).not.toHaveBeenCalled();
  vi.mocked(render).mockImplementation(() => {
    expect(shows).toBe(0);
    return () => undefined;
  });
  app.resolve(UI);
  await settle();
  expect(render).toHaveBeenCalledOnce();
  expect(shows).toBe(1);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  await nativeTick(90000);
  expect(phase).toBe("ready");
  expect(shows).toBe(1);
});

it("retries real Sophon health with native elapsed time while all WebView timers are stalled", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(TypeError("Load failed"))
    .mockResolvedValue({ ok: true, json: async () => ({ status: "healthy" }) });
  vi.stubGlobal("fetch", fetch);
  const { createSophonRetry } = await import("./sophon");
  vi.mocked(createApp).mockImplementation(async () => {
    await createSophonRetry("127.0.0.1", 45233);
    return UI;
  });
  await import("./index");
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(shows).toBe(0);
  await nativeTick(2999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await nativeTick(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenCalledOnce();
  expect(shows).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the native health deadline for a fetch that never settles", async () => {
  const { createSophonRetry } = await import("./sophon");
  const { timeout } = await import("./utils/helper");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined))
  );
  vi.mocked(createApp).mockImplementation(async () => {
    await Promise.race([createSophonRetry("127.0.0.1", 45233), timeout(30000)]);
    return UI;
  });
  await import("./index");
  await settle();
  await nativeTick(30000);
  expect(render).not.toHaveBeenCalled();
  expect(shows).toBe(0);
  expect(native).toHaveBeenCalledWith({ op: "fail", message: "TIMEOUT" });
  expect(root.setAttribute).toHaveBeenLastCalledWith("role", "alert");
  expect(vi.getTimerCount()).toBe(0);
});

it("reports permanent health failure without showing an empty launcher or spawning another app", async () => {
  const { createSophonRetry } = await import("./sophon");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  vi.mocked(createApp).mockImplementation(async () => {
    await createSophonRetry("127.0.0.1", 45233);
    return UI;
  });
  await import("./index");
  await settle();
  for (let i = 0; i < 10; i++) await nativeTick(3000);
  expect(root.textContent).toContain(
    "Failed to create sophon client after retries"
  );
  expect(phase).toBe("failed");
  expect(render).not.toHaveBeenCalled();
  expect(createApp).toHaveBeenCalledOnce();
  expect(shows).toBe(0);
  expect(exit).not.toHaveBeenCalled();
});

it("rejects late application readiness after the independent native watchdog expires", async () => {
  const app = deferred<typeof UI>();
  vi.mocked(createApp).mockReturnValue(app.promise);
  await import("./index");
  await settle();
  await nativeTick(90000);
  expect(root.textContent).toContain("Native startup deadline expired");
  app.resolve(UI);
  await settle();
  expect(render).not.toHaveBeenCalled();
  expect(shows).toBe(0);
  expect(native).not.toHaveBeenCalledWith({ op: "ready" });
});

it("cancels startup, drains an in-flight sidecar acknowledgement, and only then uses the existing close gate", async () => {
  const acknowledged = deferred<number>();
  let cleanupRegistered = false;
  vi.mocked(createApp).mockImplementation(async () => {
    const clock = (await import("./bootstrap-clock")).getBootstrapClock();
    if (!clock) throw Error("Missing bootstrap clock");
    await clock.trackSpawn(async () => {
      await acknowledged.promise;
      cleanupRegistered = true;
    });
    return UI;
  });
  vi.mocked(GLOBAL_onClose).mockImplementation(async () => {
    expect(cleanupRegistered).toBe(true);
    return true;
  });
  await import("./index");
  await settle();
  const closing = handlers.windowClose?.({ detail: null });
  await settle();
  expect(GLOBAL_onClose).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  acknowledged.resolve(42);
  await closing;
  await settle();
  expect(GLOBAL_onClose).toHaveBeenCalledWith(false);
  expect(exit).toHaveBeenCalledWith(0);
  expect(render).not.toHaveBeenCalled();
  expect(shows).toBe(0);
  const clock = (await import("./bootstrap-clock")).getBootstrapClock();
  if (!clock) throw Error("Missing bootstrap clock");
  const lateSpawn = vi.fn();
  await expect(clock.trackSpawn(lateSpawn)).rejects.toThrow("stopped");
  expect(lateSpawn).not.toHaveBeenCalled();
});

it("retains a close veto after startup failure", async () => {
  vi.mocked(createApp).mockRejectedValue(Error("service failed"));
  vi.mocked(GLOBAL_onClose).mockResolvedValue(false);
  await import("./index");
  await settle();
  await handlers.windowClose?.({ detail: null });
  expect(exit).not.toHaveBeenCalled();
  expect(root.textContent).toContain("service failed");
});

it("retries Aria2 startup on the native clock without adding another sidecar", async () => {
  const { WebSocket: RPC } = await import("libaria2-ts");
  const getVersion = vi
    .fn()
    .mockRejectedValueOnce(Error("not listening"))
    .mockResolvedValue({ version: "1.37.0" });
  vi.mocked(RPC.Client).mockImplementation(
    () => ({ getVersion } as unknown as InstanceType<typeof RPC.Client>)
  );
  const { createAria2Retry } = await import("./aria2");
  vi.mocked(createApp).mockImplementation(async () => {
    await createAria2Retry({ host: "127.0.0.1", port: 6868 });
    return UI;
  });
  await import("./index");
  await settle();
  expect(getVersion).not.toHaveBeenCalled();
  await nativeTick(500);
  expect(getVersion).toHaveBeenCalledTimes(1);
  await nativeTick(500);
  expect(getVersion).toHaveBeenCalledTimes(2);
  expect(createApp).toHaveBeenCalledOnce();
  expect(shows).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("drains native waiters on successful readiness without reviving an expired timeout", async () => {
  vi.mocked(createApp).mockImplementation(async () => {
    await Promise.race([Promise.resolve("ready"), timeout(15000)]);
    return UI;
  });
  await import("./index");
  await settle();
  expect(waits).toHaveLength(0);
  expect(phase).toBe("ready");
  expect(shows).toBe(1);
  await nativeTick(90000);
  expect(phase).toBe("ready");
  expect(native).not.toHaveBeenCalledWith(
    expect.objectContaining({ op: "fail" })
  );
});

it("does not run post-render initialization when native readiness is rejected", async () => {
  const { whenBootstrapReady } = await import("./bootstrap-clock");
  const initialize = vi.fn();
  vi.mocked(createApp).mockResolvedValue(UI);
  vi.mocked(render).mockImplementation(() => {
    void whenBootstrapReady().then(initialize, () => undefined);
    phase = "failed";
    return () => undefined;
  });
  await import("./index");
  await settle();
  expect(initialize).not.toHaveBeenCalled();
  expect(shows).toBe(0);
});

it("preserves a failed native cancel diagnostic while still executing guarded cleanup", async () => {
  vi.mocked(createApp).mockReturnValue(new Promise(() => undefined));
  await import("./index");
  await settle();
  native.mockRejectedValueOnce(Error("cancel RPC failed"));
  await handlers.windowClose?.({ detail: null });
  expect(GLOBAL_onClose).toHaveBeenCalledWith(false);
  expect(exit).toHaveBeenCalledWith(0);
});

it("shows cleanup failures and coalesces repeated close requests", async () => {
  vi.mocked(createApp).mockRejectedValue(Error("service failed"));
  const cleanup = deferred<boolean>();
  vi.mocked(GLOBAL_onClose).mockImplementation(async () => {
    await cleanup.promise;
    throw Error("cleanup acknowledgement missing");
  });
  await import("./index");
  await settle();
  const first = handlers.windowClose?.({ detail: null });
  const second = handlers.windowClose?.({ detail: null });
  cleanup.resolve(false);
  await Promise.all([first, second]);
  expect(GLOBAL_onClose).toHaveBeenCalledOnce();
  expect(exit).not.toHaveBeenCalled();
  expect(native).toHaveBeenCalledWith({
    op: "fail",
    message: "Cleanup could not finish: Error: cleanup acknowledgement missing",
  });
});

it("keeps an exit RPC failure visible, and does not repeat a successful exit", async () => {
  vi.mocked(createApp).mockRejectedValue(Error("service failed"));
  vi.mocked(exit)
    .mockRejectedValueOnce(Error("exit rejected"))
    .mockResolvedValue(undefined);
  await import("./index");
  await settle();
  await handlers.windowClose?.({ detail: null });
  expect(native).toHaveBeenCalledWith({
    op: "fail",
    message: "Cleanup could not finish: Error: exit rejected",
  });
  await handlers.windowClose?.({ detail: null });
  await handlers.windowClose?.({ detail: null });
  expect(exit).toHaveBeenCalledTimes(2);
});

it("shows a missing native capability and quits through the guard after acknowledgement", async () => {
  const acknowledged =
    deferred<Awaited<ReturnType<typeof Neutralino.os.showMessageBox>>>();
  vi.mocked(Neutralino.os.showMessageBox).mockReturnValue(acknowledged.promise);
  vi.stubGlobal("Neutralino", { ...Neutralino, custom: {} });
  await import("./index");
  await settle();
  expect(Neutralino.os.showMessageBox).toHaveBeenCalled();
  expect(createApp).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  acknowledged.resolve("OK");
  await settle();
  expect(GLOBAL_onClose).toHaveBeenCalledWith(false);
  expect(exit).toHaveBeenCalledWith(0);
});

it("does not run cleanup hooks or exit when a native spawn acknowledgement is unknown", async () => {
  vi.mocked(createApp).mockImplementation(async () => {
    const clock = (await import("./bootstrap-clock")).getBootstrapClock();
    if (!clock) throw Error("Missing bootstrap clock");
    await clock.trackSpawn(async () => {
      throw Error("native response lost after creation");
    });
    return UI;
  });
  await import("./index");
  await settle();
  await handlers.windowClose?.({ detail: null });
  expect(GLOBAL_onClose).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  expect(native).toHaveBeenCalledWith(
    expect.objectContaining({
      op: "fail",
      message: expect.stringContaining("acknowledgement remains unresolved"),
    })
  );
  await handlers.windowClose?.({ detail: null });
  expect(exit).not.toHaveBeenCalled();
});

it("refuses native readiness after elapsed budget even before a delayed watchdog notification arrives", async () => {
  const app = deferred<typeof UI>();
  vi.mocked(createApp).mockReturnValue(app.promise);
  const { whenBootstrapReady } = await import("./bootstrap-clock");
  const initialize = vi.fn();
  vi.mocked(render).mockImplementation(() => {
    void whenBootstrapReady().then(initialize, () => undefined);
    return () => undefined;
  });
  await import("./index");
  await settle();
  await nativeTick(90001, false);
  expect(phase).toBe("starting");
  app.resolve(UI);
  await settle();
  expect(phase).toBe("failed");
  expect(shows).toBe(0);
  expect(initialize).not.toHaveBeenCalled();
  expect(root.textContent).toContain("Native startup deadline expired");
});

it.each(["cleanup", "exit"])(
  "keeps a ready launcher %s failure visible through a native message box",
  async failure => {
    vi.mocked(createApp).mockResolvedValue(UI);
    await import("./index");
    await settle();
    expect(phase).toBe("ready");
    if (failure === "cleanup")
      vi.mocked(GLOBAL_onClose).mockRejectedValue(
        Error("ready cleanup failed")
      );
    else vi.mocked(exit).mockRejectedValue(Error("ready exit failed"));
    await handlers.windowClose?.({ detail: null });
    expect(Neutralino.os.showMessageBox).toHaveBeenCalledWith(
      "Yaagl OS",
      expect.stringContaining(`ready ${failure} failed`),
      "OK",
      "ERROR"
    );
    expect(phase).toBe("ready");
    expect(shows).toBe(1);
  }
);

it("shows a cleanup error when native ready committed but local startup was cancelled before its response", async () => {
  const readyAcknowledgement = deferred<BootstrapStatus>();
  const originalNative = native.getMockImplementation();
  if (!originalNative) throw Error("Missing native mock");
  native.mockImplementation(input => {
    if (input.op === "ready") {
      phase = "ready";
      shows++;
      return readyAcknowledgement.promise;
    }
    // Native ready is terminal: neither cancellation nor fail changes it.
    if (input.op === "cancel" || input.op === "fail")
      return Promise.resolve({ phase });
    return originalNative(input);
  });
  vi.mocked(createApp).mockResolvedValue(UI);
  vi.mocked(GLOBAL_onClose).mockRejectedValue(
    Error("cleanup failed during readiness acknowledgement")
  );
  await import("./index");
  await settle();
  expect(phase).toBe("ready");
  expect(shows).toBe(1);
  await handlers.windowClose?.({ detail: null });
  expect(native).toHaveBeenCalledWith({ op: "cancel" });
  expect(Neutralino.os.showMessageBox).toHaveBeenCalledWith(
    "Yaagl OS",
    expect.stringContaining("cleanup failed during readiness acknowledgement"),
    "OK",
    "ERROR"
  );
  expect(exit).not.toHaveBeenCalled();
  readyAcknowledgement.resolve({ phase: "ready" });
  await settle();
});
