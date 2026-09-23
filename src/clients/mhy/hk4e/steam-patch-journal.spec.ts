import { afterEach, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { patchProgram } from "../patch";
import { createLaunchJournal } from "./launch-journal";
import type { Wine } from "../../../wine";
import type { Config } from "../../../config";
import type { Server } from "../../../constants";

// Exercise the real patch generator + real journal/filesystem. Only external
// resource copies are injected. Every destination is under a disposable root.
vi.mock("src/downloadable-resource", () => ({
  DXMT_FILES: ["d3d10core.dll", "d3d11.dll", "dxgi.dll"],
}));
vi.mock("@utils", () => ({
  resolve: (path: string) => join(root, path),
  getKeyOrDefault: async () => "NOTFOUND",
  setKey: async () => undefined,
  fileOrDirExists: async (path: string) => {
    try {
      await fs.lstat(path);
      return true;
    } catch {
      return false;
    }
  },
  forceMove: async (from: string, to: string) => fs.rename(from, to),
  cp: async (from: string, to: string) => {
    if (to.includes("steam.exe") || to.includes("lsteamclient.dll")) {
      expect(captured.has(to)).toBe(true);
      expect(
        JSON.parse(
          await fs.readFile(join(root, "journal/journal.json"), "utf8")
        ).some((entry: { path: string }) => entry.path === to)
      ).toBe(true);
    }
    await fs.writeFile(to, `replacement ${from}`);
    if (to === failCopy) throw Error("partial Steam copy failed");
  },
}));
let root = "",
  failCopy = "";
const captured = new Set<string>();
afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  captured.clear();
});

it.each([0, 1, 2, 3])(
  "partial Steam preparation at destination %s restores originals and existing backups",
  async failure => {
    root = await fs.mkdtemp(join(tmpdir(), "yaagl-steam-journal-"));
    for (const path of [
      "journal",
      "game",
      "wine/lib/wine/x86_64-windows",
      "wine/lib/wine/x86_64-unix",
      "prefix/drive_c/windows/system32",
      "prefix/drive_c/windows/syswow64",
    ])
      await fs.mkdir(join(root, path), { recursive: true });
    const destinations = [
      "system32/steam.exe",
      "syswow64/steam.exe",
      "system32/lsteamclient.dll",
      "syswow64/lsteamclient.dll",
    ].map(path => join(root, "prefix/drive_c/windows", path));
    const originals = new Map<string, string>();
    for (const file of ["d3d10core.dll", "d3d11.dll", "dxgi.dll"])
      for (const suffix of ["", ".bak"])
        originals.set(
          join(root, "wine/lib/wine/x86_64-windows", file + suffix),
          `original ${file}${suffix}`
        );
    // One originally absent destination must be removed, not replaced by a stub.
    for (const destination of destinations.slice(0, 3))
      originals.set(destination, `original ${destination}`);
    originals.set(join(root, "game/removed.exe"), "game original");
    originals.set(
      join(root, "game/removed.exe.bak"),
      "pre-existing game backup"
    );
    for (const [path, bytes] of originals) await fs.writeFile(path, bytes);
    let restoreFailure = destinations[0];
    const journal = createLaunchJournal(join(root, "journal"), {
      async kind(path) {
        try {
          return (await fs.lstat(path)).isDirectory() ? "directory" : "file";
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return "absent";
          throw error;
        }
      },
      async copy(from, to) {
        if (to === restoreFailure && from.includes("/journal/"))
          throw Error("Steam restoration denied");
        await fs.copyFile(from, to);
      },
      remove: async path => fs.rm(path, { force: true }),
      rmdir: fs.rmdir,
      write: async (path, data) => {
        await fs.writeFile(path, data);
      },
    });
    failCopy = destinations[failure];
    const apply = async () => {
      for await (const _ of patchProgram(
        join(root, "game"),
        {
          prefix: join(root, "prefix"),
          attributes: { renderBackend: "dxmt" },
        } as Wine,
        {
          id: "hk4e_global",
          patched: [],
          added: [],
          removed: [{ file: "removed.exe" }],
        } as unknown as Server,
        { steamPatch: true } as Config,
        async path => {
          await journal.capture(path);
          captured.add(path);
        }
      )) {
        /* real async-generator consumer */
      }
    };
    await expect(apply()).rejects.toThrow("partial Steam copy failed");
    const errors = await journal.restore();
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("Steam restoration denied");
    expect(await fs.readFile(join(root, "game/removed.exe.bak"), "utf8")).toBe(
      "pre-existing game backup"
    );
    await expect(journal.dispose()).rejects.toThrow("incomplete");
    restoreFailure = "";
    expect(await journal.restore()).toEqual([]);
    for (const [path, bytes] of originals)
      expect(await fs.readFile(path, "utf8")).toBe(bytes);
    await expect(fs.lstat(destinations[3])).rejects.toMatchObject({
      code: "ENOENT",
    });
    await journal.dispose();
  }
);
