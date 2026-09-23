import { join } from "path-browserify";
import { lt, valid } from "semver";
import { readFile } from "@utils";
import { getGameVersion } from "../unity";

export async function getInstalledGameVersion(
  gameDir: string,
  dataDir: string
): Promise<string> {
  let committed: string | undefined;
  try {
    const config = await readFile(join(gameDir, "config.ini"));
    const match = /^game_version\s*=\s*(\d+\.\d+\.\d+)\s*$/m.exec(config);
    if (match && valid(match[1])) committed = match[1];
  } catch {
    /* A missing config does not hide an otherwise recognizable install. */
  }

  let detected: string | undefined;
  for (const offset of [0xac, 0x88]) {
    try {
      const candidate = await getGameVersion(join(gameDir, dataDir), offset);
      if (valid(candidate)) {
        detected = candidate;
        break;
      }
    } catch {
      /* Try the other Unity layout, then the committed version. */
    }
  }
  // globalgamemanagers can already be at the target after an interrupted update;
  // config.ini is committed only after the whole target set has been verified.
  if (committed && (!detected || lt(committed, detected))) return committed;
  if (detected) return detected;
  throw new Error("Cannot determine installed Genshin version");
}
