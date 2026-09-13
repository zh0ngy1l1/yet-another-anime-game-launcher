import type {
  CommonProgressUICommand,
  CommonUpdateProgram,
} from "../../../common-update-ui";
import {
  LaunchFailure,
  launchOwnership,
} from "../../../launcher/launch-ownership";
import { deferred } from "../../../utils/operation";
import type { createFpsCompanion } from "./fps-companion";

export interface LaunchTransactionOperations {
  prepare(
    signal: AbortSignal,
    progress: (command: CommonProgressUICommand) => void
  ): Promise<void>;
  launch(): Promise<void>;
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
  const problem = (error: unknown) => {
    if (primary === undefined) primary = error;
    else observe(error);
    owner.problem(
      `Launch failed: ${String(
        primary
      )}. Ownership retained until safe cleanup.${
        String(primary) !== String(error) ? ` ${String(error)}` : ""
      }`
    );
  };
  async function watch<T>(promise: Promise<T>, label: string): Promise<T> {
    const timer = setTimeout(
      () =>
        owner.problem(
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
      owner.phase(
        "Observing the attributed game; FPS discovery and initialization"
      );
      const terminal = helper.start().then(outcome => {
        if (outcome.error !== undefined || outcome.cleanup !== "confirmed")
          problem(
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
      owner.phase("Game lifetime ended; stopping FPS worker");
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
              `Game lifetime unconfirmed: ${String(
                error
              )}. Retry observation of this request; close and new launch remain blocked.`
            );
            lifetime = undefined;
          }
        }
      }
      if (helper) {
        const publicResult = await helper.stop();
        if (publicResult.cleanup === "unresolved")
          owner.problem(
            `FPS stop timed out; observing eventual completion. Retained mailboxes: ${
              publicResult.retainedDirectories.join(", ") || "see launch log"
            }`
          );
        const final = await watch(helper.completion, "FPS helper completion");
        if (final.error !== undefined) problem(final.error);
        cleanupErrors.push(...final.cleanupErrors);
        if (final.cleanup !== "confirmed") {
          // A failed adapter outcome is not evidence of termination. Production
          // bridge completion must still independently confirm its worker/job.
          owner.problem(
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
            operations.cleanup(owner.phase),
            "Safe launch cleanup"
          );
        } catch (error) {
          errors = [error];
        }
        if (!errors.length) break;
        cleanupErrors.push(...errors);
        await owner.waitForRetry(
          `Cleanup failed; ownership retained. ${errors
            .map(String)
            .join(
              "; "
            )}. Retry safe cleanup after addressing the reported cause.`
        );
      }
      for (const error of operations.reportedErrors?.() ?? []) observe(error);
      if (
        primary !== undefined ||
        observationErrors.length ||
        cleanupErrors.length
      ) {
        const errors = [
          ...(primary === undefined ? [] : [primary]),
          ...observationErrors,
        ];
        // Reaching this point means the existing lifetime/cleanup gates have
        // completed. Earlier failures remain evidence, not pending cleanup.
        const message = `Launch finished with errors${
          errors.length ? `: ${errors.map(String).join("; ")}` : ""
        }. Cleanup completed.${
          cleanupErrors.length
            ? ` Earlier cleanup errors: ${cleanupErrors.map(String).join("; ")}`
            : ""
        }`;
        failure = new LaunchFailure(
          message,
          primary,
          cleanupErrors,
          observationErrors
        );
        owner.problem(message);
      } else
        owner.succeed("Game, FPS worker, Wine wait and restoration completed");
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
  return { program, completion, cancel: () => cancellation.abort() };
}
