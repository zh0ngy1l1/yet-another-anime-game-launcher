import { FpsTarget, FpsValidation, parseFpsTarget } from "./fps-target";

export type FpsUnlockConfig =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly target: FpsTarget };

export type FpsUnlockDraft = {
  readonly enabled: boolean;
  readonly target: string;
};

declare module "@config/config-def" {
  interface Config {
    flushHk4eFpsSettings?: () => Promise<void>;
    // Absent on other clients. An error has no usable FPS domain value.
    // Future consumers must check ok before accessing enabled or target.
    hk4eFpsUnlock?: FpsValidation<FpsUnlockConfig>;
  }
}

export const FPS_UNLOCK_ENABLED_KEY = "config_hk4e_fps_unlock_enabled";
export const FPS_UNLOCK_TARGET_KEY = "config_hk4e_fps_unlock_target";
export const FPS_UNLOCK_READ_KEYS = [
  FPS_UNLOCK_ENABLED_KEY,
  FPS_UNLOCK_TARGET_KEY,
  "hoyoplay_genshin_fps_enabled",
  "hoyoplay_genshin_fps",
  "config_fps_unlock",
] as const;

export function resolveFpsUnlockDraft(
  stored: Readonly<Partial<Record<string, string>>>
): FpsUnlockDraft {
  for (const [enabledKey, targetKey] of [
    [FPS_UNLOCK_ENABLED_KEY, FPS_UNLOCK_TARGET_KEY],
    ["hoyoplay_genshin_fps_enabled", "hoyoplay_genshin_fps"],
  ]) {
    if (stored[enabledKey] !== undefined || stored[targetKey] !== undefined) {
      return {
        // Malformed booleans safely remain disabled, without repairing storage.
        enabled: stored[enabledKey] === "true",
        target: stored[targetKey] ?? "120",
      };
    }
  }
  const upstream = stored.config_fps_unlock;
  if (upstream === undefined || upstream === "default") {
    return { enabled: false, target: "120" };
  }
  // Unknown upstream text stays visible and must pass the same strict parser.
  return { enabled: true, target: upstream };
}

export function validateFpsUnlockDraft(
  draft: FpsUnlockDraft
): FpsValidation<FpsUnlockConfig> {
  if (!draft.enabled) return { ok: true, value: { enabled: false } };
  const parsed = parseFpsTarget(draft.target);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { enabled: true, target: parsed.value } };
}
