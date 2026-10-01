import type { CommonUpdateProgram } from "../../../common-update-ui";
import { log } from "../../../utils";

type Outcome = "ok" | "error" | "cancelled";
let sequence = 0;

/** Diagnostic intervals share one monotonic origin. Nested/overlapping spans
 * are intervals, not additive costs. Logging never gates launch or cleanup. */
export function createLaunchTiming(
  signal?: AbortSignal,
  output: (line: string) => unknown = log,
  now: () => number = () => performance.now()
) {
  const request = `${Date.now().toString(36)}-${++sequence}`;
  const origin = now();
  let span = 0;
  function emit(data: Record<string, unknown>) {
    try {
      void Promise.resolve(
        output(
          `HK4E_TIMING ${JSON.stringify({
            version: 1,
            request,
            atMs: Math.round((now() - origin) * 1000) / 1000,
            ...data,
          })}`
        )
      ).catch(() => undefined);
    } catch {
      // Diagnostics must not change admission, failure or cleanup behavior.
    }
  }
  function begin(phase: string) {
    const id = ++span;
    const start = now();
    let done = false;
    emit({ event: "begin", span: id, phase });
    return (outcome: Outcome = signal?.aborted ? "cancelled" : "ok") => {
      if (done) return;
      done = true;
      emit({
        event: "end",
        span: id,
        phase,
        outcome,
        elapsedMs: Math.round((now() - start) * 1000) / 1000,
      });
    };
  }
  async function measure<T>(phase: string, operation: () => Promise<T>) {
    const end = begin(phase);
    try {
      const result = await operation();
      end();
      return result;
    } catch (error) {
      end(signal?.aborted ? "cancelled" : "error");
      throw error;
    }
  }
  async function* program(
    phase: string,
    operation: CommonUpdateProgram
  ): CommonUpdateProgram {
    const end = begin(phase);
    let outcome: Outcome = "cancelled";
    try {
      yield* operation;
      outcome = "ok";
    } catch (error) {
      outcome = "error";
      throw error;
    } finally {
      end(signal?.aborted ? "cancelled" : outcome);
    }
  }
  signal?.addEventListener("abort", () => emit({ event: "cancel-requested" }), {
    once: true,
  });
  return { request, emit, begin, measure, program };
}
export type LaunchTiming = ReturnType<typeof createLaunchTiming>;
