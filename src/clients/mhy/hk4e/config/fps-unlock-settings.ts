import { createSignal } from "solid-js";
import type { Config } from "@config/config-def";
import { getKey, setKey } from "../../../../utils/neu";
import {
  FPS_UNLOCK_ENABLED_KEY,
  FPS_UNLOCK_READ_KEYS,
  FPS_UNLOCK_TARGET_KEY,
  FpsUnlockDraft,
  resolveFpsUnlockDraft,
  validateFpsUnlockDraft,
} from "./fps-unlock-state";

export async function readFpsUnlockDraft() {
  const stored: Partial<Record<string, string>> = {};
  await Promise.all(
    FPS_UNLOCK_READ_KEYS.map(async key => {
      try {
        stored[key] = await getKey(key);
      } catch (error) {
        // Only absence permits defaults/fallback. A storage failure must not
        // disguise an unreadable higher-priority preference as a missing key.
        if (
          typeof error !== "object" ||
          error === null ||
          Reflect.get(error, "code") !== "NE_ST_NOSTKEX"
        ) {
          throw error;
        }
      }
    })
  );
  return resolveFpsUnlockDraft(stored);
}

export async function saveFpsUnlockDraft(draft: FpsUnlockDraft) {
  const snapshot = { ...draft };
  const result = validateFpsUnlockDraft(snapshot);
  if (!result.ok) return result;
  await setKey(FPS_UNLOCK_ENABLED_KEY, snapshot.enabled ? "true" : "false");
  await setKey(FPS_UNLOCK_TARGET_KEY, snapshot.target);
  return result;
}

/** The settings lifetime spans modal openings. Only change() may persist. */
export async function createFpsUnlockSettings(config: Partial<Config>) {
  const initial = await readFpsUnlockDraft();
  const [draft, setDraft] = createSignal(initial);
  const [validation, setValidation] = createSignal(
    validateFpsUnlockDraft(initial)
  );
  const [saveFailed, setSaveFailed] = createSignal(false);
  config.hk4eFpsUnlock = validation();
  let pending: Promise<unknown> = Promise.resolve();

  async function change(next: FpsUnlockDraft) {
    const previous = draft();
    const snapshot = { ...next };
    const result = validateFpsUnlockDraft(snapshot);
    setDraft(snapshot);
    setValidation(result);
    config.hk4eFpsUnlock = result;
    if (
      !result.ok ||
      (!saveFailed() &&
        previous.enabled === next.enabled &&
        previous.target === next.target)
    ) {
      return result;
    }

    // Keep each explicitly requested pair together across rapid user changes.
    const saving = pending.then(() => saveFpsUnlockDraft(snapshot));
    pending = saving.catch(() => undefined);
    try {
      await saving;
      setSaveFailed(false);
    } catch (error) {
      setSaveFailed(true);
      throw error;
    }
    return result;
  }

  return { draft, validation, saveFailed, change };
}
