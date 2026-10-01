/* Developer-only fixture. No game path, game executable or launch API is used. */
import { createWine } from "../src/wine/wine";
import { createWindowSession } from "../src/clients/mhy/hk4e/window-session";
import { basename, dirname } from "path-browserify";
import { readFile, resolve, writeFile } from "../src/utils/neu";
import type { Config } from "../src/config";

Neutralino.init();
const rows: {
  run: number;
  phase: string;
  atMs: number;
  elapsedMs: number;
  outcome: "ok" | "error";
}[] = [];
const origin = performance.now();
const clockStartedUtc = new Date().toISOString();
async function measure<T>(
  run: number,
  phase: string,
  action: () => Promise<T>
) {
  const start = performance.now();
  let outcome: "ok" | "error" = "error";
  try {
    const result = await action();
    outcome = "ok";
    return result;
  } finally {
    rows.push({
      run,
      phase,
      atMs: start - origin,
      elapsedMs: performance.now() - start,
      outcome,
    });
    await writeFile(
      resolve("measurements.json"),
      JSON.stringify(rows, null, 2)
    );
  }
}
async function main() {
  const authorization = Reflect.get(window, "NL_MEASUREMENT_TOKEN");
  if (
    typeof authorization !== "string" ||
    authorization !== (await readFile(resolve("fixture-authorization")))
  )
    throw Error("Missing disposable fixture authorization");
  const runtime = (await readFile(resolve("runtime-path"))).trim();
  if (
    dirname(dirname(runtime)) !== resolve("fps-runtime") ||
    basename(runtime) !== "wine" ||
    !/^r2-[A-Za-z0-9_]{10}$/.test(basename(dirname(runtime)))
  )
    throw Error("Runtime must belong to this disposable profile");
  const wine = await createWine({
    prefix: resolve("prefix"),
    runtimeRoot: runtime,
    distro: {
      id: "11.0-dxmt-signed-with-patches",
      displayName: "fixture",
      remoteUrl: "",
      attributes: { renderBackend: "dxmt" },
    },
    environment: { WINEDEBUG: "-all", WINEDLLOVERRIDES: "mscoree,mshtml=" },
  });
  const config = {
    retina: false,
    leftCmd: false,
    hk4eNativeFullscreen: true,
    resolutionCustom: false,
    hk4eEnableHDR: false,
  } as Config;
  try {
    await measure(0, "first-use-prefix-initialization", async () => {
      await wine.exec("wineboot", ["-u"]);
      await wine.waitUntilServerOff();
    });
    for (let run = 1; run <= 3; run++) {
      await measure(run, "wine-properties", () => wine.setProps(config));
      const session = await measure(run, "window-session-admission", () =>
        createWindowSession({
          wine,
          config,
          server: { id: "hk4e_global" },
          gameExecutable: "GenshinImpact.exe",
        })
      );
      try {
        await measure(run, "window-registry-prepare", () => session.prepare());
      } finally {
        // false: no game ran and no remembered geometry may be promoted.
        await measure(run, "window-registry-restore-cleanup", () =>
          session.finish(false)
        );
      }
    }
  } finally {
    await wine.waitUntilServerOff();
  }
  // Host independently checks process/file references before removing this
  // runtime and prefix. Keep the bytes available until that check completes.
  await writeFile(
    resolve("result.json"),
    JSON.stringify(
      {
        rows,
        completed: true,
        boundary:
          "No game supplied; only wineboot, configuration and owned registry helpers executed",
        settings: {
          retina: false,
          nativeFullscreen: true,
          fpsRuntime: true,
          gameModeRouting: false,
        },
        clock: {
          source: "performance.now",
          originUtc: clockStartedUtc,
          relationship:
            "frontend origin; host process samples have a separate monotonic origin",
        },
        measuredThrough:
          "production createWine.setProps and createWindowSession.prepare/finish over native RPC",
      },
      null,
      2
    )
  );
  await Neutralino.app.exit();
}
void main().catch(async error => {
  await writeFile(
    resolve("result.json"),
    JSON.stringify({ completed: false, error: String(error), rows }, null, 2)
  );
  await Neutralino.app.exit();
});
