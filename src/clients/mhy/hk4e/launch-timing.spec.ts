import { expect, it, vi } from "vitest";
import { createLaunchTiming } from "./launch-timing";

function fixture() {
  let time = 1000;
  const lines: Record<string, unknown>[] = [];
  const cancellation = new AbortController();
  const timing = createLaunchTiming(
    cancellation.signal,
    line => lines.push(JSON.parse(line.slice("HK4E_TIMING ".length))),
    () => time
  );
  return { timing, lines, cancellation, advance: (ms: number) => (time += ms) };
}
it("records overlapping intervals on one clock without adding their durations", () => {
  const f = fixture();
  const outer = f.timing.begin("outer");
  f.advance(10);
  const inner = f.timing.begin("inner");
  f.advance(20);
  outer();
  f.advance(10);
  inner();
  inner();
  expect(f.lines.map(x => [x.event, x.phase, x.atMs, x.elapsedMs])).toEqual([
    ["begin", "outer", 0, undefined],
    ["begin", "inner", 10, undefined],
    ["end", "outer", 30, 30],
    ["end", "inner", 40, 30],
  ]);
  expect(new Set(f.lines.map(x => x.request)).size).toBe(1);
});
it("preserves errors and marks cancellation without abandoning the operation", async () => {
  const f = fixture();
  const failure = new Error("admission failed");
  await expect(
    f.timing.measure("failure", async () => {
      throw failure;
    })
  ).rejects.toBe(failure);
  let resolve!: () => void;
  const running = f.timing.measure(
    "pending",
    () =>
      new Promise<void>(yes => {
        resolve = yes;
      })
  );
  f.cancellation.abort();
  expect(
    f.lines.filter(x => x.phase === "pending" && x.event === "end")
  ).toEqual([]);
  resolve();
  await running;
  expect(f.lines.filter(x => x.event === "end").map(x => x.outcome)).toEqual([
    "error",
    "cancelled",
  ]);
  expect(f.lines.filter(x => x.event === "cancel-requested")).toHaveLength(1);
});
it("generator cancellation awaits owned cleanup and closes its span", async () => {
  const f = fixture();
  const cleanup = vi.fn();
  const program = f.timing.program(
    "resources",
    (async function* () {
      try {
        yield ["setUndeterminedProgress"] as ["setUndeterminedProgress"];
      } finally {
        cleanup();
      }
    })()
  );
  await program.next();
  await program.return();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(f.lines.at(-1)?.outcome).toBe("cancelled");
});
it.each([
  () => {
    throw Error("sync log failure");
  },
  async () => {
    throw Error("async log failure");
  },
])("diagnostic failure cannot fail the operation", async output => {
  const timing = createLaunchTiming(undefined, output);
  await expect(timing.measure("operation", async () => 42)).resolves.toBe(42);
});
