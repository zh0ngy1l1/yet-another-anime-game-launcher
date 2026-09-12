import { dirname, join } from "path-browserify";
import { exec, resolve, stats, warn } from "../../../utils/neu";

function checkPath(path: string) {
  // The existing command builder changes controls and leaves '?' glob syntax.
  if (
    !path.startsWith("/") ||
    path.includes("?") ||
    Array.from(path).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  ) {
    throw new Error(
      "FPS unlocker requires an absolute path without control characters or '?'"
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

export const fpsUnlockerIO = {
  cacheDirectory(tag: string, digest: string) {
    // configure.sh supplies macOS runtime binaries. Do not assume replacement
    // semantics or system utilities on other Neutralino platforms.
    if (window.NL_OS !== "Darwin") {
      throw new Error("FPS unlocker acquisition requires macOS");
    }
    const directory = resolve(join("./fps-unlocker", tag, digest));
    checkPath(directory);
    return directory;
  },
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
      throw new Error("Invalid FPS unlocker temporary path from mktemp");
    }
    return path;
  },
  async download(url: string, path: string): Promise<void> {
    checkPath(path);
    // Aria2's current poller does not reject error/removed/paused states, and
    // persists sessions without an owned cancellation boundary. Use YAAGL's
    // exec/curl pattern here: one foreground attempt, no config or retries.
    await exec([
      "/usr/bin/curl",
      "--disable",
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "--retry",
      "0",
      "--connect-timeout",
      "30",
      "--max-time",
      "600",
      "--output",
      path,
      "--url",
      url,
    ]);
  },
  async promote(source: string, destination: string): Promise<void> {
    checkPath(source);
    checkPath(destination);
    if (dirname(source) !== dirname(destination)) {
      throw new Error("FPS unlocker promotion requires the same directory");
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
