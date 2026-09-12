import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { render } from "solid-js/web";
import { fatal } from "./utils";
import { createSophonRetry } from "./sophon";
import { deferred } from "./utils/operation";

vi.mock("./app", () => ({ createApp: vi.fn() }));
vi.mock("./utils", () => ({ fatal: vi.fn(), log: vi.fn() }));
vi.mock("solid-js/web", () => ({ render: vi.fn() }));
vi.mock("@hope-ui/solid", () => ({
  HopeProvider: vi.fn(),
  NotificationsProvider: vi.fn(),
}));

const root = {
  textContent: "",
  setAttribute: vi.fn(),
  removeAttribute: vi.fn(),
};
const show = vi.fn();
const UI = () => null;
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  root.textContent = "";
  vi.stubGlobal("document", { getElementById: () => root });
  vi.stubGlobal("Neutralino", { init: vi.fn(), window: { show } });
  show.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows startup status and awaits window visibility before creating services", async () => {
  const visible = deferred<void>(),
    app = deferred<typeof UI>();
  show.mockReturnValue(visible.promise);
  vi.mocked(createApp).mockReturnValue(app.promise);
  await import("./index");
  expect(show).toHaveBeenCalledOnce();
  expect(root.textContent).toBe("Starting launcher…");
  expect(root.setAttribute).toHaveBeenCalledWith("role", "status");
  expect(createApp).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  visible.resolve();
  await settle();
  expect(createApp).toHaveBeenCalledOnce();
  expect(render).not.toHaveBeenCalled();
  expect(root.textContent).toBe("Starting launcher…");
  app.resolve(UI);
  await settle();
  expect(root.removeAttribute).toHaveBeenCalledWith("role");
  expect(root.textContent).toBe("");
  expect(render).toHaveBeenCalledWith(expect.any(Function), root);
  expect(fatal).not.toHaveBeenCalled();
});

it("waits for the real Sophon health retry before rendering the launcher", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Load failed"))
    .mockResolvedValue({ ok: true, json: async () => ({ status: "healthy" }) });
  vi.stubGlobal("fetch", fetch);
  vi.mocked(createApp).mockImplementation(async () => {
    await createSophonRetry("127.0.0.1", 45233);
    return UI;
  });
  await import("./index");
  await settle();
  expect(show).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:45233/health");
  expect(render).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenCalledOnce();
  expect(fatal).not.toHaveBeenCalled();
});

it("keeps failed health checks fail-closed with a visible error and the existing fatal handler", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  vi.mocked(createApp).mockImplementation(async () => {
    await createSophonRetry("127.0.0.1", 45233);
    return UI;
  });
  await import("./index");
  await settle();
  await vi.advanceTimersByTimeAsync(30000);
  expect(render).not.toHaveBeenCalled();
  expect(root.setAttribute).toHaveBeenLastCalledWith("role", "alert");
  expect(root.textContent).toContain(
    "Failed to create sophon client after retries"
  );
  expect(fatal).toHaveBeenCalledOnce();
  expect(fatal).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Failed to create sophon client after retries",
    })
  );
});

it("does not start services when window showing fails, and preserves that error", async () => {
  const error = Error("Native window unavailable");
  show.mockRejectedValue(error);
  await import("./index");
  await settle();
  expect(createApp).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  expect(root.textContent).toContain(error.message);
  expect(fatal).toHaveBeenCalledWith(error);
});
