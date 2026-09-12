import { dirname, join } from "path-browserify";
import { exec, resolve, writeFile } from "../../../utils/neu";

const journalIO = {
  async kind(path: string): Promise<"absent" | "directory" | "file"> {
    const result = await exec([
      "/usr/bin/perl",
      "-e",
      "my $p=shift; if(lstat($p)){ print((-d _ && !-l _) ? 'directory' : 'file') } elsif($!{ENOENT}){print 'absent'}else{die $!}",
      path,
    ]);
    return result.stdOut as "absent" | "directory" | "file";
  },
  async copy(from: string, to: string) {
    await exec(["/bin/cp", "-pP", "--", from, to]);
  },
  async remove(path: string) {
    await exec(["/bin/rm", "-f", "--", path]);
  },
  async rmdir(path: string) {
    await exec(["/bin/rmdir", "--", path]);
  },
  write: writeFile,
};

/** Snapshots remain available after a failed restore. No recursive deletion. */
export function createLaunchJournal(directory: string, io = journalIO) {
  const entries: {
    path: string;
    kind: "absent" | "directory" | "file";
    backup: string;
    restored: boolean;
  }[] = [];
  const captured = new Set<string>();
  async function capture(input: string) {
    const path = resolve(input);
    if (captured.has(path)) return;
    const kind = await io.kind(path);
    if (!["absent", "directory", "file"].includes(kind))
      throw new Error(`Unknown file state: ${path}`);
    if (kind === "absent" && dirname(path) !== path)
      await capture(dirname(path));
    const backup = join(directory, `file-${entries.length}`);
    if (kind === "file") await io.copy(path, backup);
    entries.push({ path, kind, backup, restored: false });
    captured.add(path);
    await io.write(join(directory, "journal.json"), JSON.stringify(entries));
  }
  async function restore() {
    const errors: unknown[] = [];
    for (const entry of [...entries].reverse()) {
      if (entry.restored) continue;
      try {
        const current = await io.kind(entry.path);
        if (entry.kind === "file") {
          if (current === "directory")
            throw new Error(`Refusing to replace a directory: ${entry.path}`);
          await io.remove(entry.path);
          await io.copy(entry.backup, entry.path);
        } else if (entry.kind === "absent") {
          if (current === "directory") await io.rmdir(entry.path);
          else if (current !== "absent") await io.remove(entry.path);
        } else if (current !== "directory")
          throw new Error(`Original directory changed: ${entry.path}`);
        entry.restored = true;
      } catch (error) {
        errors.push(new Error(`Restore ${entry.path}: ${String(error)}`));
      }
    }
    await io
      .write(join(directory, "journal.json"), JSON.stringify(entries))
      .catch(error => errors.push(error));
    return errors;
  }
  async function dispose() {
    if (entries.some(entry => !entry.restored))
      throw new Error(`File restoration incomplete: ${directory}`);
    for (const entry of entries)
      if (entry.kind === "file") await io.remove(entry.backup);
    await io.remove(join(directory, "journal.json"));
  }
  return { capture, restore, dispose };
}
