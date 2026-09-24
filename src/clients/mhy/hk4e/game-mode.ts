import type { Config } from "../../../config";
import type { Wine } from "../../../wine";
import { exec, log } from "../../../utils";

/** Desired preference, effective routing, and OS activation are separate facts. */
export async function admitGameMode(
  config: Pick<Config, "hk4eGameMode" | "hk4eNativeFullscreen">,
  wine: Wine,
  host = async () => {
    if (window.NL_OS !== "Darwin") return false;
    const arm = await exec(["/usr/sbin/sysctl", "-n", "hw.optional.arm64"]);
    const version = await exec(["/usr/bin/sw_vers", "-productVersion"]);
    return arm.stdOut.trim() === "1" && parseInt(version.stdOut, 10) >= 14;
  }
) {
  if (!config.hk4eGameMode) return false;
  if (!config.hk4eNativeFullscreen) {
    await log(
      "Game Mode preference saved but inactive: enable Native macOS fullscreen, then relaunch."
    );
    return false;
  }
  if (
    wine.distributionId !== "11.0-dxmt-signed-with-patches" ||
    wine.attributes.renderBackend !== "dxmt" ||
    !(await host())
  )
    throw new Error(
      "Game Mode support requires Apple Silicon, macOS 14 or newer, and Wine 11.0 DXMT signed-with-patches. Your preference is saved; no runtime was switched."
    );
  return true;
}
