import { stats } from "../../../utils/neu";
import { join } from "path-browserify";
import type { Config } from "../../../config";
import type { Wine } from "../../../wine";
import { readFpsUnlockDraft } from "./config/fps-unlock-settings";
import { validateFpsUnlockDraft } from "./config/fps-unlock-state";
import { buildFpsRuntimePlan } from "./fps-runtime";

export async function admitFpsLaunch(
  input: {
    config: Config;
    wine: Wine;
    server: string;
    gameDir: string;
    gameExecutable: string;
  },
  native = { os: window.NL_OS, version: window.NL_VERSION },
  inspect: (
    path: string
  ) => Promise<{ isFile: boolean; isDirectory: boolean }> = stats
) {
  await input.config.flushHk4eFpsSettings?.();
  if (input.config.hk4eFpsUnlock && !input.config.hk4eFpsUnlock.ok)
    throw new Error(
      "Invalid enabled Target FPS; expected an integer from 1 to 360"
    );
  const settings = validateFpsUnlockDraft(await readFpsUnlockDraft());
  if (!settings.ok)
    throw new Error(
      "Invalid enabled Target FPS; expected an integer from 1 to 360"
    );
  if (!settings.value.enabled) return undefined;
  const { config, wine, server, gameDir, gameExecutable } = input;
  if (native.os !== "Darwin" || native.version !== "4.11.0-yaagl-owned1")
    throw new Error(
      "FPS unlocking requires the local HK4E runtime with normal-quit protection; run scripts/build-hk4e-native.py"
    );
  if (
    !(
      (server === "hk4e_global" && gameExecutable === "GenshinImpact.exe") ||
      (server === "hk4e_cn" && gameExecutable === "YuanShen.exe")
    )
  )
    throw new Error("FPS unlocking supports direct global or China HK4E only");
  if (config.steamPatch)
    throw new Error(
      "FPS unlocking cannot attribute Steam handoff; disable Steam patch for this launch"
    );
  if (config.blockNet)
    throw new Error(
      "FPS unlocking does not support the background privileged network-blocking script; disable network blocking for this launch"
    );
  if (
    !["11.0-dxmt-signed-with-patches", "11.0-dxmt-signed"].includes(
      wine.distributionId
    ) ||
    typeof wine.attributes.winePath !== "string" ||
    !wine.attributes.winePath
  )
    throw new Error(
      "FPS unlocking requires a supported Wine 11.0 DXMT distribution with complete capability metadata"
    );
  const context = wine.executionContext;
  for (const path of [gameDir, context?.loader, context?.prefix])
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.includes("?") ||
      path.includes('"') ||
      Array.from(path).some(
        character =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ) ||
      path === "/"
    )
      throw new Error("Invalid absolute FPS launch identity or Wine context");
  const plan = buildFpsRuntimePlan(
    settings.value,
    wine.attributes,
    "d3d11.preferredMaxFrameRate=60;"
  );
  if (!plan.ok || !plan.value.companion || !plan.value.gameDxmtConfig)
    throw new Error("FPS unlocking requires a valid DXMT runtime plan");
  const executable = join(gameDir, gameExecutable);
  for (const [path, directory] of [
    [executable, false],
    [context.loader, false],
    [context.prefix, true],
  ] as const) {
    const info = await inspect(path);
    if (directory ? !info.isDirectory : !info.isFile || info.isDirectory)
      throw new Error(
        `Invalid FPS launch ${directory ? "directory" : "file"}: ${path}`
      );
  }
  return Object.freeze({
    executable,
    gameDirectory: gameDir,
    wine: context,
    plan: Object.freeze({
      ...plan.value,
      companion: plan.value.companion,
      gameDxmtConfig: plan.value.gameDxmtConfig,
    }),
  });
}
