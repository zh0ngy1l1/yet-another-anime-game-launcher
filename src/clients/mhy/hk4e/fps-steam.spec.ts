import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyFpsSteamPrefix } from "./fps-steam";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

it.each(["correct", "redirected", "missing", "dangling"])(
  "validates the actual Wine C: mapping (%s) with system Perl",
  async kind => {
    const root = await mkdtemp(join(tmpdir(), "yaagl-steam-map-"));
    roots.push(root);
    const prefix = join(root, "prefix space ' quote");
    await mkdir(join(prefix, "dosdevices"), { recursive: true });
    await mkdir(join(prefix, "drive_c"));
    await mkdir(join(root, "another-drive"));
    if (kind !== "missing")
      await symlink(
        kind === "correct"
          ? "../drive_c"
          : kind === "redirected"
          ? join(root, "another-drive")
          : join(root, "absent-drive"),
        join(prefix, "dosdevices/c:")
      );
    const check = verifyFpsSteamPrefix(prefix, ([binary, ...args]) =>
      execute(binary, args)
    );
    if (kind === "correct") await expect(check).resolves.toBeUndefined();
    else
      await expect(check).rejects.toThrow(
        "Wine C: mapping does not match the verified prefix"
      );
  }
);
