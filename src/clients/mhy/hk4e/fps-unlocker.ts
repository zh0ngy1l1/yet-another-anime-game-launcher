import { join } from "path-browserify";
import { FPS_UNLOCKER_MANIFEST as manifest } from "./fps-unlocker-manifest";
import { fpsUnlockerIO } from "./fps-unlocker-io";

/** Materialize verified bytes only. Intentionally unused by launch code. */
export async function acquireFpsUnlocker(io = fpsUnlockerIO): Promise<string> {
  const directory = io.cacheDirectory(manifest.tag, manifest.sha256);
  const finalPath = join(directory, manifest.filename);
  let temporary: string | undefined;
  let stage = "inspect cache";

  async function matches(path: string, allowMissing = false) {
    let stat;
    try {
      stat = await io.stats(path);
    } catch (error) {
      // Neutralino conflates missing/inaccessible paths. Neither is trusted;
      // only cache inspection may proceed to a single verified replacement.
      if (
        allowMissing &&
        typeof error === "object" &&
        error !== null &&
        Reflect.get(error, "code") === "NE_FS_NOPATHE"
      ) {
        return false;
      }
      throw error;
    }
    if (!stat.isFile || stat.isDirectory) {
      throw new Error(`Not a regular file: ${path}`);
    }
    if (stat.size !== manifest.size) return false;
    return (await io.sha256(path, manifest.size)) === manifest.sha256;
  }

  try {
    if (await matches(finalPath, true)) return finalPath;
    stage = "create temporary file";
    temporary = await io.temporary(directory);
    stage = "download";
    await io.download(manifest.url, temporary);
    stage = "verify temporary file";
    if (!(await matches(temporary))) {
      throw new Error(`Size or SHA-256 mismatch: ${temporary}`);
    }
    stage = "atomically promote";
    await io.promote(temporary, finalPath);
    temporary = undefined; // rename consumed our file; never remove finalPath.
    stage = "verify final file";
    // The UI task queue serializes one launcher, but independent callers or
    // instances can overlap. Each owns a mktemp file and independently checks
    // the winning final path. Failed promotions reject; no blind race fallback.
    if (!(await matches(finalPath))) {
      throw new Error(`Size or SHA-256 mismatch: ${finalPath}`);
    }
    return finalPath;
  } catch (cause) {
    const failure = Object.assign(
      new Error(
        `FPS unlocker ${manifest.tag}: failed to ${stage}: ${String(cause)}`
      ),
      { cause }
    );
    if (temporary !== undefined) {
      try {
        await io.cleanup(temporary);
      } catch (cleanupError) {
        Object.assign(failure, { cleanupError });
        try {
          await io.warn(
            `FPS unlocker cleanup failed for ${temporary}: ${String(
              cleanupError
            )}`
          );
        } catch (loggingError) {
          Object.assign(failure, { loggingError });
        }
      }
    }
    throw failure;
  }
}
