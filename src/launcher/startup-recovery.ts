import type { CommonUpdateProgram } from "../common-update-ui";
import {
  LaunchFailure,
  launchOwnership,
  createLaunchOwnership,
} from "./launch-ownership";

export function queueStartupRecovery(
  queue: { next(task: () => CommonUpdateProgram): Promise<unknown> },
  initialize: () => CommonUpdateProgram,
  ownership: ReturnType<typeof createLaunchOwnership> = launchOwnership
) {
  // Reserve synchronously, before the queue starts its async generator. A UI
  // action or close request cannot enter between scheduling and the first step.
  const reservation = ownership.reserve();
  if (!reservation) return Promise.resolve();
  return queue
    .next(() => runStartupRecovery(initialize, ownership))
    .finally(() => reservation.release());
}

/** Keep startup restoration owned until its complete generator acknowledges. */
export async function* runStartupRecovery(
  initialize: () => CommonUpdateProgram,
  ownership: ReturnType<typeof createLaunchOwnership> = launchOwnership
): CommonUpdateProgram {
  const owner = ownership.claim();
  owner.phase("Checking startup restoration");
  try {
    yield* initialize();
  } catch (error) {
    const message = `Startup restoration remains unresolved: ${String(
      error
    )}. Keep the launcher and logs for review.`;
    owner.problem(message);
    // A rejected restore is not proof that every operation/sidecar is done.
    // Keep the existing close/launch guard; do not offer an unproven retry.
    throw new LaunchFailure(message, error);
  }
  owner.succeed("Startup restoration completed");
  owner.finish();
}
