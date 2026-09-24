import { basename, dirname, join } from "path-browserify";
import type { Config } from "../../../config";
import type { Wine } from "../../../wine";
import {
  exec,
  getKeyOrDefault,
  log,
  readFile,
  resolve,
  setKey,
} from "../../../utils";
import {
  startOwnedWineExecution,
  OwnedWineExecution,
  OwnedWineContext,
} from "../../../wine/owned-execution";
import { stageFpsArtifact, fpsArtifactIO } from "./fps-artifact";
import manifestRaw from "../../../../native/window-state/manifest.json?raw";
const manifest: { filename: string; size: number; sha256: string } =
  JSON.parse(manifestRaw);
import {
  chooseWindowSize,
  parseWindowMemory,
  resolutionChoice,
  validWindowSize,
  validateHk4eExecutable,
} from "./window-state";

const pendingKey = "hk4e_window_controls_pending";
const memoryKey = (server: string) => `hk4e_window_size_${server}`;
const parent = () => resolve("./window-state");
function validateDirectory(directory: string) {
  if (
    dirname(directory) !== parent() ||
    !/^window-[A-Za-z0-9]{10}$/.test(basename(directory))
  )
    throw new Error("Unknown retained window-controls directory");
}
async function remove(directory: string) {
  validateDirectory(directory);
  await exec([
    "/bin/rm",
    "-f",
    "--",
    ...[
      manifest.filename,
      "window-registry.bin",
      "window-registry.tmp",
      "current.json",
      "native.json",
    ].map(name => join(directory, name)),
  ]);
  await exec([
    "/usr/bin/perl",
    "-e",
    'my $p=shift; if(lstat($p)){die "not directory" unless -d _ && !-l _; rmdir($p) or die $!}elsif(!$!{ENOENT}){die $!}',
    "--",
    directory,
  ]);
}
function commands(
  directory: string,
  context: OwnedWineContext,
  server: string,
  options: string[]
) {
  const executions = new Set<OwnedWineExecution>();
  async function settle() {
    for (const execution of executions) {
      let outcome = await execution.completion;
      if (outcome.confirmed && outcome.cleanupError && execution.retryCleanup)
        outcome = await execution.retryCleanup();
      if (!outcome.confirmed || outcome.cleanupError)
        throw new Error(`Window registry lifetime unconfirmed: ${directory}`);
      executions.delete(execution);
    }
  }
  return {
    settle,
    async run(operation: string) {
      await settle();
      const path = join(directory, manifest.filename);
      if ((await fpsArtifactIO.sha256(path, manifest.size)) !== manifest.sha256)
        throw new Error("Window registry helper changed");
      const execution = startOwnedWineExecution({
        wine: context,
        executable: path,
        args: [
          operation,
          "Z:" + directory.replaceAll("/", "\\"),
          server,
          ...options,
        ],
        environment: {},
      });
      executions.add(execution);
      const result = await execution.completion;
      await settle();
      if (!result.confirmed || result.status !== 0 || result.error)
        throw new Error(
          `Window registry ${operation} failed; retained ${directory}: ${JSON.stringify(
            result
          )}`
        );
    },
  };
}

/** An exact, durable preimage is committed before apply. The driver's event file
 * is per launch; only a confirmed normal exit promotes it to profile storage. */
export async function createWindowSession(input: {
  wine: Wine;
  config: Config;
  server: { id: string };
  gameExecutable: string;
}) {
  const { wine, config, gameExecutable } = input,
    server = input.server.id;
  validateHk4eExecutable(server, gameExecutable);
  if (await getKeyOrDefault(pendingKey, ""))
    throw new Error(
      "Window controls recovery is pending; restart the launcher before launching again"
    );
  const memory = parseWindowMemory(
    await getKeyOrDefault(memoryKey(server), "")
  );
  const size = chooseWindowSize(config, memory);
  await exec(["/bin/mkdir", "-p", parent()]);
  const { stdOut } = await exec([
    "/usr/bin/mktemp",
    "-d",
    join(parent(), "window-XXXXXXXXXX"),
  ]);
  const directory = stdOut.replace(/\n$/, "");
  validateDirectory(directory);
  try {
    await stageFpsArtifact(
      directory,
      resolve("./sidecar/window-state/window-registry.exe"),
      manifest
    );
  } catch (error) {
    await remove(directory);
    throw error;
  }
  const options = [
    config.hk4eNativeFullscreen ? "1" : "0",
    String(size?.width ?? 0),
    String(size?.height ?? 0),
    size?.remembered ? "1" : "0",
  ];
  const command = commands(directory, wine.executionContext, server, options);
  let started = false,
    restored = false,
    observed = false,
    disposed = false;
  const record = {
    schema: 1,
    directory,
    server,
    context: wine.executionContext,
    options,
    restored: false,
    saved: false,
  };
  const environment: Record<string, string> = config.hk4eNativeFullscreen
    ? {
        YAAGL_WINDOW_STATE_EXE: gameExecutable,
        YAAGL_WINDOW_STATE_FILE: join(directory, "native.json"),
      }
    : {};
  return {
    environment,
    async prepare() {
      if (started) throw new Error("Window controls preparation is single-use");
      await wine.waitUntilServerOff();
      started = true;
      await setKey(pendingKey, JSON.stringify(record));
      await command.run("save");
      record.saved = true;
      await setKey(pendingKey, JSON.stringify(record));
      await command.run("apply");
      await wine.waitUntilServerOff();
      await log(
        `Window controls: native=${
          config.hk4eNativeFullscreen === true
        }; size=${
          size ? `${size.width}x${size.height}` : "game preference"
        }; source=${
          size?.remembered ? "remembered" : "explicit/game"
        }; ${directory}`
      );
    },
    async finish(normal: boolean) {
      if (disposed) return;
      await command.settle();
      await wine.waitUntilServerOff();
      if (started && normal && !observed) {
        await command.run("observe");
        let value: unknown;
        try {
          value = JSON.parse(
            await readFile(
              join(
                directory,
                config.hk4eNativeFullscreen ? "native.json" : "current.json"
              )
            )
          );
        } catch {
          /* No attributed valid state: preserve the previous record. */
        }
        if (
          validWindowSize(value) &&
          (config.hk4eNativeFullscreen || Reflect.get(value, "mode") === 0)
        ) {
          const scale = config.hk4eNativeFullscreen && config.retina ? 2 : 1;
          const next = {
            schema: 1,
            width: value.width * scale,
            height: value.height * scale,
            choice: resolutionChoice(config),
            retina: config.retina === true,
          };
          if (validWindowSize(next)) {
            await setKey(memoryKey(server), JSON.stringify(next));
            await log(
              `Remembered windowed Wine client size ${next.width}x${next.height}; Retina=${next.retina}`
            );
          }
        }
        observed = true;
      }
      if (started && !restored) {
        await command.run(record.saved ? "restore" : "discard");
        await wine.waitUntilServerOff();
        record.restored = true;
        await setKey(pendingKey, JSON.stringify(record));
        restored = true;
      }
      // Remove the durable pointer last. Repeating restore uses the same preimage.
      await remove(directory);
      if (started) await setKey(pendingKey, null);
      disposed = true;
    },
  };
}

export async function recoverWindowSession(wine: Wine) {
  const raw = await getKeyOrDefault(pendingKey, "");
  if (!raw) return;
  const saved = JSON.parse(raw);
  if (
    saved.schema !== 1 ||
    typeof saved.saved !== "boolean" ||
    typeof saved.restored !== "boolean" ||
    saved.context?.prefix !== wine.prefix ||
    !Array.isArray(saved.options) ||
    saved.options.length !== 4
  )
    throw new Error(
      "Unrecognized window controls recovery record; retain it for inspection"
    );
  validateDirectory(saved.directory);
  validateHk4eExecutable(
    saved.server,
    saved.server === "hk4e_global" ? "GenshinImpact.exe" : "YuanShen.exe"
  );
  // The retained loader/server remain necessary until Wine has drained.
  const wait = () =>
    exec(
      [join(dirname(saved.context.loader), "wineserver"), "-w"],
      saved.context.environment
    );
  await wait();
  const command = commands(
    saved.directory,
    saved.context,
    saved.server,
    saved.options
  );
  if (!saved.restored) {
    await command.run(saved.saved ? "restore" : "discard");
    await wait();
    saved.restored = true;
    await setKey(pendingKey, JSON.stringify(saved));
  }
  await remove(saved.directory);
  await setKey(pendingKey, null);
  await log(
    "Interrupted window controls restored exactly; previous remembered size retained"
  );
}
