import { exec } from "../../../utils/neu";
import { join } from "path-browserify";

/** Match the existing disabled Steam route's Windows image identity. A signed
 * copy in a private Z: directory is not the same parent image path. */
export const FPS_STEAM_WINDOWS_PATH = "C:\\windows\\system32\\steam.exe";

/** The C: executable must resolve to the host files whose hashes we verify. */
export async function verifyFpsSteamPrefix(
  prefix: string,
  run: (command: string[]) => Promise<unknown> = exec
) {
  await run([
    "/usr/bin/perl",
    "-e",
    "use Cwd qw(realpath); " +
      "my $mapped = realpath($ARGV[0]); my $expected = realpath($ARGV[1]); " +
      "defined($mapped) && defined($expected) && -d $mapped && $mapped eq $expected " +
      'or die "Wine C: mapping does not match the verified prefix\\n";',
    "--",
    join(prefix, "dosdevices/c:"),
    join(prefix, "drive_c"),
  ]);
}

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
