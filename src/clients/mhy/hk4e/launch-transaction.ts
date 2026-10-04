import { errorMessage, logDiagnostic } from "../../../utils/errors";
import type {
  CommonProgressUICommand,
  CommonUpdateProgram,
} from "../../../common-update-ui";
import {
  LaunchFailure,
  launchOwnership,
} from "../../../launcher/launch-ownership";
import { log } from "../../../utils";
import { deferred } from "../../../utils/operation";
import type { createFpsCompanion } from "./fps-companion";

export interface LaunchTransactionOperations {
  prepare(
    signal: AbortSignal,
    progress: (command: CommonProgressUICommand) => void
  ): Promise<void>;
  launch(): Promise<void>;
  /** True only for the retained, request-attributed game handle. */
  gameRunning?(): boolean;
  gameFailure?(): unknown;
  gameExit(): Promise<void>;
  companion(): ReturnType<typeof createFpsCompanion>;
  /** Observation history, not evidence of a failed cleanup operation. */
  reportedErrors?(): readonly unknown[];
  /** Called only after attributed lifetime is confirmed, or no launch issued. */
  cleanup(phase: (text: string) => void): Promise<readonly unknown[]>;
}

/** The transaction runs independently of generator consumption. return()/throw()
 * cancel preparation and wait for ownership, rather than skipping its finally.
 */
export function createLaunchTransaction(
  operations: LaunchTransactionOperations,
  owner = launchOwnership.claim()
) {
  const cancellation = new AbortController();
  const commands: CommonProgressUICommand[] = [];
  let changed = deferred<void>();
  let ended = false;
  let primary: unknown;
  let helper: ReturnType<typeof createFpsCompanion> | undefined;
  const observationErrors: unknown[] = [];
  const cleanupErrors: unknown[] = [];
  let failure: LaunchFailure | undefined;
  const observe = (error: unknown) => {
    if (
      String(error) !== String(primary) &&
      !cleanupErrors.some(previous => String(previous) === String(error)) &&
      !observationErrors.some(previous => String(previous) === String(error))
    )
      observationErrors.push(error);
  };
  const wake = () => {
    changed.resolve();
    changed = deferred<void>();
  };
  const progress = (command: CommonProgressUICommand) => {
    commands.push(command);
    wake();
  };
  const diagnostic = (text: string) => {
    void Promise.resolve()
      .then(() => log(text))
      .catch(() => undefined);
  };
  const optionalProblem = (error: unknown) => {
    observe(error);
    diagnostic(`FPS companion: ${String(error)}`);
    owner.warning(
      "FPS unlock is unavailable for this session. See the launch log for details."
    );
  };
  const problem = (error: unknown) => {
    logDiagnostic(error);
    if (primary === undefined) primary = error;
    else observe(error);
    owner.problem(
      `${
        operations.gameRunning?.()
          ? "Game monitoring failed"
          : issued
          ? "Game launch or monitoring could not be confirmed"
          : "Launch failed"
      }: ${errorMessage(
        primary
      )}. Keep the launcher open while cleanup finishes.${
        String(primary) !== String(error) ? ` ${errorMessage(error)}` : ""
      }`
    );
  };
  async function watch<T>(promise: Promise<T>, label: string): Promise<T> {
    const timer = setTimeout(
      () =>
        diagnostic(
          `${label} is still pending. Close and new launch remain blocked; observation continues. See the launch log for the request and retained paths.`
        ),
      30000
    );
    try {
      return await promise;
    } finally {
      clearTimeout(timer);
    }
  }
  let issued = false;
  let lifetime: Promise<void> | undefined;
  const completion = (async () => {
    try {
      await watch(
        operations.prepare(cancellation.signal, progress),
        "Launch preparation"
      );
      if (cancellation.signal.aborted)
        throw new Error("Launch cancelled before game creation");
      issued = true; // A rejected/late launch can still have created the game.
      await watch(operations.launch(), "Game launch acknowledgement");
      lifetime = operations.gameExit();
      void lifetime.catch(() => undefined);
      helper = operations.companion();
      diagnostic(
        "Observing the attributed game; FPS discovery and initialization"
      );
      if (operations.gameRunning?.()) owner.running();
      else owner.phase("Waiting for the game to start…");
      const terminal = helper.start().then(outcome => {
        if (outcome.error !== undefined || outcome.cleanup !== "confirmed")
          optionalProblem(
            outcome.error ??
              new Error(
                `FPS companion cleanup ${
                  outcome.cleanup
                }: ${outcome.retainedDirectories.join(", ")}`
              )
          );
        return outcome;
      });
      cancellation.signal.addEventListener(
        "abort",
        () => {
          void helper?.stop();
        },
        { once: true }
      );
      if (cancellation.signal.aborted) void helper.stop();
      await lifetime;
      owner.ended();
      diagnostic("Game lifetime ended; stopping FPS worker");
      await helper.stop();
      await terminal;
    } catch (error) {
      problem(error);
    } finally {
      // Unknown is never exit. Keep observing the same native request on errors.
      if (issued) {
        for (;;) {
          try {
            await (lifetime ?? operations.gameExit());
            break;
          } catch (error) {
            problem(error);
            await owner.waitForRetry(
              `The launcher cannot confirm whether this game has finished. Closing and another launch are blocked. Keep the launcher open and check the game status again. ${errorMessage(
                error
              )}`,
              "Check game status again"
            );
            lifetime = undefined;
          }
        }
      }
      if (issued) owner.ended();
      else owner.phase("Finishing launch cleanup…");
      if (helper) {
        const publicResult = await helper.stop();
        if (publicResult.cleanup === "unresolved")
          diagnostic(
            `FPS stop timed out; observing eventual completion. Retained mailboxes: ${
              publicResult.retainedDirectories.join(", ") || "see launch log"
            }`
          );
        const final = await watch(helper.completion, "FPS helper completion");
        if (final.error !== undefined) optionalProblem(final.error);
        for (const error of final.observationErrors ?? [])
          optionalProblem(error);
        cleanupErrors.push(...final.cleanupErrors);
        if (final.cleanup !== "confirmed") {
          // A failed adapter outcome is not evidence of termination. Production
          // bridge completion must still independently confirm its worker/job.
          diagnostic(
            `FPS controller reported cleanup failure; confirming bridge handles before restoration. ${final.cleanupErrors
              .map(String)
              .join("; ")}`
          );
        }
      }
      for (;;) {
        let errors: readonly unknown[];
        try {
          errors = await watch(
            operations.cleanup(diagnostic),
            "Safe launch cleanup"
          );
        } catch (error) {
          errors = [error];
        }
        if (!errors.length) break;
        cleanupErrors.push(...errors);
        errors.forEach(logDiagnostic);
        await owner.waitForRetry(
          `The launcher could not finish restoring settings or files. Closing and another launch are blocked. Address the reported problem, then retry cleanup. ${errors
            .map(errorMessage)
            .join("; ")}`
        );
      }
      for (const error of operations.reportedErrors?.() ?? []) {
        observe(error);
        diagnostic(String(error));
      }
      primary ??= operations.gameFailure?.();
      const uniqueObservations = observationErrors.filter(
        error => String(error) !== String(primary)
      );
      cleanupErrors.forEach(logDiagnostic);
      if (primary !== undefined) {
        // Cleanup is now confirmed. Only a genuine primary failure remains red.
        const message = `Launch finished with an error: ${errorMessage(
          primary
        )} Cleanup completed. See the launch log for details.`;
        failure = new LaunchFailure(
          message,
          primary,
          cleanupErrors,
          uniqueObservations
        );
        owner.problem(message);
        owner.stopped();
      } else owner.succeed();
      owner.finish();
      ended = true;
      wake();
    }
    return failure;
  })();
  async function* program(): CommonUpdateProgram {
    try {
      while (!ended || commands.length) {
        const command = commands.shift();
        if (command) yield command;
        else await changed.promise;
      }
      const error = await completion;
      if (error) throw error;
    } finally {
      cancellation.abort();
      await completion;
    }
  }
  return {
    program,
    completion,
    diagnostics: () => [...observationErrors],
    cancel: () => cancellation.abort(),
  };
}
