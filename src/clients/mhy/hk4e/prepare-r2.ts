import { basename, dirname } from "path-browserify";
import recipe from "./prepare-r2.pl?raw";
import fullscreenManifest from "../../../../native/wine-fullscreen/manifest.json?raw";
import gameModeManifest from "../../../../native/wine-game-mode/manifest.json?raw";
import manifest from "../../../../native/wine-r2/delta.json?raw";
import { exec, log, resolve } from "../../../utils";
import { createWine, Wine } from "../../../wine/wine";

/** The installed runtime is read only. A unique per-launch copy avoids changing
 * libraries used by another prefix, and never reuses interrupted preparation. */
export async function prepareR2Wine(
  wine: Wine,
  features: { fps: boolean; fullscreen: boolean; gameMode?: string } = {
    fps: true,
    fullscreen: false,
  }
) {
  if (features.gameMode && !features.fullscreen)
    throw new Error("Game Mode routing requires native fullscreen support");
  if (
    features.fullscreen &&
    (wine.distributionId !== "11.0-dxmt-signed-with-patches" ||
      wine.attributes.renderBackend !== "dxmt")
  )
    throw new Error(
      "Native macOS fullscreen requires the qualified Wine 11.0 DXMT signed-with-patches runtime. Your preference is saved; select that runtime or disable native fullscreen."
    );
  const context = wine.executionContext;
  await wine.waitUntilServerOff();
  const parent = resolve("./fps-runtime");
  const { stdOut } = await exec([
    "/usr/bin/perl",
    "-e",
    "use MIME::Base64; my $code = decode_base64(shift @ARGV); eval $code; die $@ if $@;",
    "--",
    btoa(recipe),
    dirname(dirname(context.loader)),
    parent,
    JSON.stringify({
      ...JSON.parse(manifest),
      applyR2: features.fps,
      ...(features.gameMode
        ? {
            gameMode: JSON.parse(gameModeManifest),
            gameModeAssets: resolve("./sidecar/wine-game-mode"),
            gameModeExecutable: features.gameMode,
            gameModePrefix: context.prefix,
          }
        : {}),
      ...(features.fullscreen
        ? {
            fullscreen: JSON.parse(fullscreenManifest),
            fullscreenAssets: resolve("./sidecar/wine-fullscreen"),
          }
        : {}),
    }),
  ]);
  const root = stdOut.replace(/\n$/, "");
  if (
    dirname(dirname(root)) !== parent ||
    basename(root) !== "wine" ||
    !/^r2-[A-Za-z0-9_]{10}$/.test(basename(dirname(root)))
  )
    throw new Error(
      "Unknown R2 preparation result; retain preparation evidence"
    );
  const prepared = await createWine({
    prefix: context.prefix,
    distro: {
      id: wine.distributionId,
      displayName: wine.distributionId,
      remoteUrl: "",
      attributes: { ...wine.attributes },
    },
    runtimeRoot: root,
    environment: {
      ...context.environment,
      ...(features.gameMode
        ? {
            YAAGL_GAME_MODE_REQUEST: `${root}/lib/wine/x86_64-unix/yaagl-game-mode.request`,
            YAAGL_GAME_MODE_IMAGE: "",
          }
        : {}),
    },
  });
  await log(
    `Private runtime prepared: ${root}; FPS=${
      features.fps
    }; native fullscreen=${
      features.fullscreen
    }; Game Mode host=${!!features.gameMode} (OS activation unobserved); ntdll SHA-256=${
      features.gameMode
        ? JSON.parse(gameModeManifest).ntdll[features.fps ? "r2" : "plain"]
            .sha256
        : features.fps
        ? JSON.parse(manifest).outputSha256
        : JSON.parse(manifest).inputSha256
    }; source=${context.loader}; prefix=${context.prefix}`
  );
  return prepared;
}

export async function disposeR2Wine(wine: Wine) {
  const directory = dirname(dirname(dirname(wine.executionContext.loader)));
  if (
    dirname(directory) !== resolve("./fps-runtime") ||
    !/^r2-[A-Za-z0-9_]{10}$/.test(basename(directory))
  )
    throw new Error("Refusing unknown prepared runtime cleanup");
  await exec(["/bin/rm", "-rf", "--", directory]);
  await log(`FPS private runtime cleanup completed: ${directory}`);
}
