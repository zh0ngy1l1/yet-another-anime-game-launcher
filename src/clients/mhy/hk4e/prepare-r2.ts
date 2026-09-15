import { basename, dirname } from "path-browserify";
import recipe from "./prepare-r2.pl?raw";
import manifest from "../../../../native/wine-r2/delta.json?raw";
import { exec, log, resolve } from "../../../utils";
import { createWine, Wine } from "../../../wine/wine";

/** The installed runtime is read only. A unique per-launch copy avoids changing
 * libraries used by another prefix, and never reuses interrupted preparation. */
export async function prepareR2Wine(wine: Wine) {
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
    JSON.stringify(JSON.parse(manifest)),
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
    environment: context.environment,
  });
  await log(
    `FPS runtime prepared: ${root}; R2 ntdll SHA-256=${
      JSON.parse(manifest).outputSha256
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
