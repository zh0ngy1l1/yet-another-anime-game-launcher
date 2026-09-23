import { dirname, join } from "path-browserify";
import { exec, stats, warn } from "../../../utils/neu";

function checkPath(path: string) {
  // The existing command builder changes controls and leaves '?' glob syntax.
  if (
    !path.startsWith("/") ||
    path.includes("?") ||
    Array.from(path).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  ) {
    throw new Error(
      "FPS artifact requires an absolute path without control characters or '?'"
    );
  }
}

// System Perl/Digest::SHA is also the facility used by macOS shasum. Read in
// chunks from a regular, non-symlink descriptor, checking its size before hash.
// Paths are ARGV data through exec's command builder, never Perl source.
const HASH_FILE =
  "use Fcntl qw(O_RDONLY O_NOFOLLOW); use Digest::SHA; " +
  'sysopen(my $f, $ARGV[0], O_RDONLY | O_NOFOLLOW) or die "open: $!"; ' +
  '-f $f or die "not a regular file"; ' +
  '-s $f == $ARGV[1] or die "size mismatch"; ' +
  'binmode($f) or die "binmode: $!"; ' +
  "my $digest = Digest::SHA->new(256)->addfile($f)->hexdigest; " +
  'close($f) or die "close: $!"; print $digest, "\n";';

export const fpsArtifactIO = {
  stats,
  async sha256(path: string, size: number): Promise<string> {
    checkPath(path);
    const { stdOut } = await exec([
      "/usr/bin/perl",
      "-e",
      HASH_FILE,
      "--",
      path,
      String(size),
    ]);
    // Our utility emits only the digest and one LF. No filenames, extra lines,
    // surrounding whitespace, or partial/ambiguous digests are accepted.
    const digest = stdOut.endsWith("\n") ? stdOut.slice(0, -1) : stdOut;
    if (digest.length !== 64 || /[^0-9a-fA-F]/.test(digest)) {
      throw new Error(`Malformed SHA-256 output for ${path}`);
    }
    return digest.toLowerCase();
  },
  async temporary(directory: string): Promise<string> {
    checkPath(directory);
    await exec(["/bin/mkdir", "-p", directory]);
    const prefix = join(directory, ".unlockfps-");
    const { stdOut } = await exec(["/usr/bin/mktemp", `${prefix}XXXXXXXXXX`]);
    const path = stdOut.endsWith("\n") ? stdOut.slice(0, -1) : stdOut;
    if (
      !path.startsWith(prefix) ||
      path.length !== prefix.length + 10 ||
      /[^a-zA-Z0-9]/.test(path.slice(prefix.length))
    ) {
      // Never clean a path we cannot establish ownership of.
      throw new Error("Invalid FPS artifact temporary path from mktemp");
    }
    return path;
  },
  async copy(source: string, destination: string): Promise<void> {
    checkPath(source);
    checkPath(destination);
    await exec(["/bin/cp", "--", source, destination]);
  },
  async promote(source: string, destination: string): Promise<void> {
    checkPath(source);
    checkPath(destination);
    if (dirname(source) !== dirname(destination)) {
      throw new Error("FPS artifact promotion requires the same directory");
    }
    // macOS rename(2), via the system Perl builtin: atomic replacement, no
    // copy/delete fallback or mv's destination-directory interpretation.
    // Neutralino 4.11.0-1 moveFile shells out to mv; do not use it here.
    await exec([
      "/usr/bin/perl",
      "-e",
      'rename($ARGV[0], $ARGV[1]) or die "rename: $!";',
      "--",
      source,
      destination,
    ]);
  },
  async cleanup(path: string): Promise<void> {
    checkPath(path);
    // No recursive deletion, no wildcard, and no downloader sidecar files.
    await exec(["/bin/rm", "-f", "--", path]);
  },
  warn,
};

/** Copy a bundled artifact into this request, verifying before and after rename. */
export async function stageFpsArtifact(
  directory: string,
  source: string,
  manifest: {
    readonly filename: string;
    readonly size: number;
    readonly sha256: string;
  },
  io = fpsArtifactIO
): Promise<string> {
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
    stage = "copy";
    await io.copy(source, temporary);
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
        `FPS artifact ${manifest.filename}: failed to ${stage}: ${String(
          cause
        )}`
      ),
      { cause }
    );
    if (temporary !== undefined) {
      try {
        await io.cleanup(temporary);
      } catch (cleanupError) {
        const retainedTemporary = temporary;
        Object.assign(failure, {
          cleanupError,
          retainedTemporary,
          retryCleanup: () => io.cleanup(retainedTemporary),
        });
        try {
          await io.warn(
            `FPS artifact cleanup failed for ${temporary}: ${String(
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
