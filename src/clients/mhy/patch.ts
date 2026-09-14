import { gt } from "semver";
import { dirname, join } from "path-browserify";
import { CommonUpdateProgram } from "@common-update-ui";
import { Server } from "@constants";
import {
  writeBinary,
  forceMove,
  removeFile,
  log,
  getKey,
  setKey,
  cp,
  resolve,
  removeFileIfExists,
  fileOrDirExists,
  getKeyOrDefault,
  mkdirp,
  xdelta3,
} from "@utils";
import { Config } from "@config";
import { disableUnityFeature } from "./unity";
import { Wine } from "@wine";
import { DXMT_FILES, DXVK_FILES } from "src/downloadable-resource";

export async function putLocal(url: string, dest: string) {
  return await writeBinary(dest, await (await fetch(url)).arrayBuffer());
}

export async function* patchProgram(
  gameDir: string,
  wine: Wine,
  server: Server,
  config: Config,
  beforeChange: (path: string) => Promise<void> = async () => undefined
): CommonUpdateProgram {
  // The enabled direct launch journals every destination before its first
  // mutation. Default operations retain the existing behavior for other routes.
  const move = async (from: string, to: string) => {
    await beforeChange(from);
    await beforeChange(to);
    await forceMove(from, to);
  };
  const copy = async (from: string, to: string) => {
    await beforeChange(to);
    await cp(from, to);
  };
  const put = async (url: string, to: string) => {
    await beforeChange(to);
    await putLocal(url, to);
  };
  if ((await getKeyOrDefault("patched", "NOTFOUND")) != "NOTFOUND") {
    return;
  }
  if (!config.patchOff) {
    for (const file of server.patched) {
      if (file.tag === "workaround3" && config.workaround3) continue;
      await move(join(gameDir, file.file), join(gameDir, file.file + ".bak"));
      await put(file.diffUrl, join(gameDir, file.file + ".diff"));
      await xdelta3(
        join(gameDir, file.file + ".bak"),
        join(gameDir, file.file + ".diff"),
        join(gameDir, file.file)
      );
      await log("patched " + file.file);
      await removeFile(join(gameDir, file.file + ".diff"));
    }
    for (const { file, tag } of server.removed) {
      if (tag === "workaround3" && config.workaround3) continue;
      if (await fileOrDirExists(join(gameDir, file))) {
        await move(join(gameDir, file), join(gameDir, file + ".bak"));
      }
    }
    for (const file of server.added) {
      await beforeChange(join(gameDir, dirname(file.file)));
      await mkdirp(join(gameDir, dirname(file.file)));
      await put(file.url, join(gameDir, file.file));
    }
  }

  const system32Dir = join(wine.prefix, "drive_c", "windows", "system32");
  const syswow64Dir = join(wine.prefix, "drive_c", "windows", "syswow64");

  for (const f of DXMT_FILES) {
    const wineLibPath = resolve(`./wine/lib/wine/x86_64-windows/${f}`);
    await move(wineLibPath, wineLibPath + ".bak");
    await copy(`./dxmt/${f}`, wineLibPath);
  }

  // winemetal files always go to Wine lib directories
  await copy(
    `./dxmt/winemetal.dll`,
    resolve("./wine/lib/wine/x86_64-windows/winemetal.dll")
  );

  await copy(
    `./dxmt/winemetal.so`,
    resolve("./wine/lib/wine/x86_64-unix/winemetal.so")
  );

  // winemetal.dll also to system32 for both native and builtin
  await copy(`./dxmt/winemetal.dll`, join(system32Dir, "winemetal.dll"));

  if (server.id.startsWith("hkrpg")) {
    await copy(
      `./dxmt/nvngx.dll`,
      resolve("./wine/lib/wine/x86_64-windows/nvngx.dll")
    );
    await copy(`./dxmt/nvngx.dll`, join(system32Dir, "nvngx.dll"));
  }

  if (config.reshade) {
    await copy(resolve("./reshade/dxgi.dll"), join(gameDir, "dxgi.dll"));
    await copy(
      resolve("./reshade/d3dcompiler_47.dll"),
      join(gameDir, "d3dcompiler_47.dll")
    );
  }

  if (!server.id.startsWith("hkrpg")) {
    await copy(
      resolve("./sidecar/protonextras/steam64.exe"),
      join(system32Dir, "steam.exe")
    );
    await copy(
      resolve("./sidecar/protonextras/steam32.exe"),
      join(syswow64Dir, "steam.exe")
    );
    await copy(
      resolve("./sidecar/protonextras/lsteamclient64.dll"),
      join(system32Dir, "lsteamclient.dll")
    );
    await copy(
      resolve("./sidecar/protonextras/lsteamclient32.dll"),
      join(syswow64Dir, "lsteamclient.dll")
    );
  }

  await setKey("patched", "1");
}

export async function* patchRevertProgram(
  gameDir: string,
  wine: Wine,
  server: Server,
  config: Config
): CommonUpdateProgram {
  try {
    await getKey("patched");
  } catch {
    return;
  }
  if (!config.patchOff) {
    for (const file of server.patched) {
      if (await fileOrDirExists(join(gameDir, file.file + ".bak"))) {
        await forceMove(
          join(gameDir, file.file + ".bak"),
          join(gameDir, file.file)
        );
      }
    }
    for (const { file } of server.removed) {
      if (await fileOrDirExists(join(gameDir, file + ".bak"))) {
        await forceMove(join(gameDir, file + ".bak"), join(gameDir, file));
      }
    }
    for (const file of server.added) {
      if (await fileOrDirExists(join(gameDir, file.file))) {
        await removeFile(join(gameDir, file.file));
      }
    }
  }

  const system32Dir = join(wine.prefix, "drive_c", "windows", "system32");
  if (wine.attributes.renderBackend == "dxmt") {
    for (const f of DXMT_FILES) {
      const wineLibPath = resolve(`./wine/lib/wine/x86_64-windows/${f}`);
      await forceMove(wineLibPath + ".bak", wineLibPath);
    }
  }
  if (config.reshade) {
    await removeFileIfExists(join(gameDir, "dxgi.dll"));
    await removeFileIfExists(join(gameDir, "d3dcompiler_47.dll"));
  }
  await setKey("patched", null);
}
