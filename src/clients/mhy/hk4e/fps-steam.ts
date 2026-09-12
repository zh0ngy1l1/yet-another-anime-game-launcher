import { exec } from "../../../utils/neu";

/** The launcher Steam Patch uses the signed shim's ordinary .exe path, without
 * SteamGameId. Presence (even an empty value) enables a different Proton service
 * with additional registry/files/restarts. Do not silently remove it. */
export async function hasSteamGameId() {
  const result = await exec([
    "/usr/bin/perl",
    "-e",
    'print scalar(grep { lc($_) eq "steamgameid" } keys %ENV) ? "present" : "absent";',
  ]);
  if (!["present", "absent"].includes(result.stdOut))
    throw new Error("Cannot validate Steam Patch environment");
  return result.stdOut === "present";
}

// Existing signed artifacts, preserved byte-for-byte; not rebuilt or re-signed.
// Source/binary correspondence and signatures: native/fps-bridge/steam-source.md.
export { FPS_STEAM_ARTIFACTS } from "./fps-bridge-manifest";
