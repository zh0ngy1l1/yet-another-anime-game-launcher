import type { WineDistributionAttributes } from "../../../wine/distro";
import type { FpsTarget } from "./config/fps-target";
import type { FpsUnlockConfig } from "./config/fps-unlock-state";

/**
 * Update the semicolon-separated DXMT_CONFIG assignment list used by YAAGL.
 * DXMT v0.80 src/util/config/config.cpp permits space, tab and CR around keys
 * and '=' (not all JS whitespace). Its last assignment wins. Semicolons split
 * entries before value parsing, even inside quotes; no escaping is added here.
 * Keep the first exact-key position, discard later duplicates and empty entries,
 * and append if absent. Other entry text/order survives; output ends in ';'.
 * Zero is an internal game value, not an additional validated user target.
 */
export function withDxmtPreferredMaxFrameRate(
  config: string | undefined,
  target: FpsTarget | 0
): string {
  const replacement = `d3d11.preferredMaxFrameRate=${target}`;
  const entries: string[] = [];
  let replaced = false;
  for (const entry of (config ?? "").split(";")) {
    if (/^[ \t\r]*d3d11\.preferredMaxFrameRate[ \t\r]*=/.test(entry)) {
      if (!replaced) entries.push(replacement);
      replaced = true;
    } else if (!/^[ \t\r]*$/.test(entry)) {
      entries.push(entry);
    }
  }
  if (!replaced) entries.push(replacement);
  return entries.join(";") + ";";
}

export type FpsRuntimeResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly gameDxmtConfig: string | undefined;
        readonly companion:
          | {
              readonly dxmtConfig: string;
              readonly fpsArgument: FpsTarget;
            }
          | undefined;
      };
    }
  | { readonly ok: false; readonly error: "dxmt-unsupported" };

/**
 * Pure contract only; intentionally unused by the launcher. Callers supply the
 * validated Step 3 value, Wine's existing backend attribute and upstream config.
 * Disabled preserves even an absent config, without supplying today's 60 limit.
 * Only immutable strings/numbers are shared; every output record is new/frozen.
 * The companion argument stays numeric until a future execution boundary.
 */
export function buildFpsRuntimePlan(
  config: FpsUnlockConfig,
  attributes: Readonly<
    Partial<Pick<WineDistributionAttributes, "renderBackend">>
  >,
  dxmtConfig?: string
): FpsRuntimeResult {
  if (!config.enabled) {
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        gameDxmtConfig: dxmtConfig,
        companion: undefined,
      }),
    });
  }
  if (attributes.renderBackend !== "dxmt") {
    return Object.freeze({ ok: false, error: "dxmt-unsupported" });
  }
  const target = config.target;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      gameDxmtConfig: withDxmtPreferredMaxFrameRate(
        dxmtConfig,
        target <= 60 ? target : 0
      ),
      companion: Object.freeze({
        dxmtConfig: withDxmtPreferredMaxFrameRate(dxmtConfig, target),
        fpsArgument: target,
      }),
    }),
  });
}
