// Only launcher initialization uses this clock. A hidden macOS WKWebView can
// suspend DOM timers, while native RPC completions continue to arrive.
export interface BootstrapClock {
  wait(ms: number): Promise<number>;
  assertActive(): void;
  whenReady(): Promise<void>;
  trackSpawn<T>(operation: () => Promise<T>): Promise<T>;
}

let clock: BootstrapClock | undefined;

export function setBootstrapClock(value: BootstrapClock | undefined) {
  clock = value;
}

export function getBootstrapClock() {
  return clock;
}

export function assertBootstrapActive() {
  clock?.assertActive();
}

export function whenBootstrapReady() {
  return clock?.whenReady() ?? Promise.resolve();
}
