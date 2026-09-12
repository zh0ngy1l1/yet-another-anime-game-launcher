import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  lstat,
  copyFile,
  unlink,
  rmdir,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLaunchJournal } from "./launch-journal";
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "yaagl-journal-test-"));
  directories.push(root);
  const backups = join(root, "backups");
  await mkdir(backups);
  let failure: string | undefined;
  const io = {
    async kind(path: string): Promise<"absent" | "directory" | "file"> {
      try {
        return (await lstat(path)).isDirectory() ? "directory" : "file";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
        throw error;
      }
    },
    async copy(from: string, to: string) {
      if (failure === to) throw Error("fixture write denied");
      await copyFile(from, to);
    },
    async remove(path: string) {
      try {
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    rmdir,
    write: async (path: string, data: string) => {
      await writeFile(path, data);
    },
  };
  return {
    root,
    backups,
    journal: createLaunchJournal(backups, io),
    deny: (path?: string) => {
      failure = path;
    },
  };
}
it("restores pre-existing files and removes only new files/directories after partial setup", async () => {
  const { root, journal } = await fixture();
  const original = join(root, "original"),
    created = join(root, "new/sub/file");
  await writeFile(original, "original bytes");
  await journal.capture(original);
  await writeFile(original, "changed");
  await journal.capture(original);
  await journal.capture(created);
  await mkdir(join(root, "new/sub"), { recursive: true });
  await writeFile(created, "new");
  expect(await journal.restore()).toEqual([]);
  expect(await readFile(original, "utf8")).toBe("original bytes");
  await expect(lstat(join(root, "new"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await journal.dispose();
});
it("attempts independent restoration after a failure and retains backups for retry", async () => {
  const rig = await fixture();
  const a = join(rig.root, "a"),
    b = join(rig.root, "b");
  for (const path of [a, b]) {
    await writeFile(path, path);
    await rig.journal.capture(path);
    await writeFile(path, "changed");
  }
  rig.deny(b);
  expect(await rig.journal.restore()).toHaveLength(1);
  expect(await readFile(a, "utf8")).toBe(a);
  await expect(rig.journal.dispose()).rejects.toThrow("incomplete");
  rig.deny();
  expect(await rig.journal.restore()).toEqual([]);
  expect(await readFile(b, "utf8")).toBe(b);
  await rig.journal.dispose();
});
it("refuses recursive deletion when a new directory acquired unrelated content", async () => {
  const { root, journal } = await fixture();
  const directory = join(root, "new");
  await journal.capture(directory);
  await mkdir(directory);
  await writeFile(join(directory, "unrelated"), "keep");
  expect(await journal.restore()).toHaveLength(1);
  expect(await readFile(join(directory, "unrelated"), "utf8")).toBe("keep");
});
