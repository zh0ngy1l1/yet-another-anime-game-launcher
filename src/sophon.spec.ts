import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SophonClient } from "./sophon";

vi.mock("@utils", () => ({ log: vi.fn(), wait: vi.fn() }));
class Socket {
  static latest: Socket;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    Socket.latest = this;
  }
  send(type: string, extra = {}) {
    this.onmessage?.({
      data: JSON.stringify({ type, task_id: "task", ...extra }),
    });
  }
}
const status = (value = "running", error?: string) => ({
  ok: true,
  json: async () => ({ task_id: "task", status: value, error }),
});
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
async function collect() {
  const events = [];
  for await (const event of new SophonClient(
    "localhost"
  ).streamOperationProgress("task"))
    events.push(event);
  return events;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("recovers a task that completed before the WebSocket connected", async () => {
  vi.mocked(fetch).mockResolvedValue(status("completed") as Response);
  expect(await collect()).toEqual([{ type: "completed", task_id: "task" }]);
  expect(Socket.latest.close).toHaveBeenCalledOnce();
});
it("does not treat job_end as success before worker cleanup", async () => {
  let finished = false;
  const collecting = collect().then(events => {
    finished = true;
    return events;
  });
  await settle();
  Socket.latest.send("job_end");
  await settle();
  expect(finished).toBe(false);
  Socket.latest.send("completed");
  expect((await collecting).map(event => event.type)).toEqual([
    "job_end",
    "completed",
  ]);
});
it("continues polling after disconnect and rejects worker failure", async () => {
  const collecting = collect();
  const assertion = expect(collecting).rejects.toThrow("checksum mismatch");
  await settle();
  vi.mocked(fetch).mockResolvedValue(
    status("failed", "checksum mismatch") as Response
  );
  Socket.latest.onclose?.();
  await assertion;
  expect(Socket.latest.close).toHaveBeenCalledOnce();
});
it("does not report success on a close before connection", async () => {
  const collecting = collect();
  const assertion = expect(collecting).rejects.toThrow("cancelled");
  Socket.latest.onclose?.();
  await settle();
  vi.mocked(fetch).mockResolvedValue(status("cancelled") as Response);
  await vi.advanceTimersByTimeAsync(2000);
  await assertion;
});
it("rejects an unreachable status endpoint after a transport failure", async () => {
  const collecting = collect();
  const assertion = expect(collecting).rejects.toThrow("Cannot confirm");
  await settle();
  vi.mocked(fetch).mockRejectedValue(new Error("connection refused"));
  Socket.latest.onerror?.();
  await assertion;
});
it("receives a failure event even when waiting for the next message", async () => {
  const collecting = collect();
  const assertion = expect(collecting).rejects.toThrow("disk full");
  await settle();
  Socket.latest.send("error", { error: "disk full" });
  await assertion;
});
it("rejects malformed events and releases the socket", async () => {
  const collecting = collect();
  const assertion = expect(collecting).rejects.toThrow(
    "Invalid Sophon progress"
  );
  await settle();
  Socket.latest.onmessage?.({ data: "{" });
  await assertion;
  expect(Socket.latest.close).toHaveBeenCalledOnce();
});
it("polls completion when a WebSocket connection never opens", async () => {
  const collecting = collect();
  await settle();
  vi.mocked(fetch).mockResolvedValue(status("completed") as Response);
  await vi.advanceTimersByTimeAsync(2000);
  expect((await collecting).at(-1)?.type).toBe("completed");
});
it("rejects an operation response that did not start a task", async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ status: "failed", message: "busy" }),
  } as Response);
  await expect(
    new SophonClient("localhost").startUpdate({
      gamedir: "/fixture",
      game_type: "hk4e",
      predownload: false,
    })
  ).rejects.toThrow("busy");
});

it("bounds a status request that never responds", async () => {
  vi.mocked(fetch).mockImplementation(
    (_input, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(Error("aborted"))
        );
      })
  );
  const collecting = collect();
  const assertion = expect(collecting).rejects.toThrow("Cannot confirm");
  await vi.advanceTimersByTimeAsync(10000);
  await assertion;
  expect(Socket.latest.close).toHaveBeenCalledOnce();
});
