/* Shared development staging; HK4E uses the owned native runtime. */
const cp = require("child_process"),
  fs = require("fs"),
  path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const channel = process.argv[2];
const directories = {
  hk4ecn: "yaaglwd",
  hk4eos: "yaaglwdos",
  bh3glb: "bh3glb",
  hkrpgos: "hkrpgos",
  hkrpgcn: "hkrpgcn",
  cbjq: "cbjq",
  cbjqcn: "cbjqcn",
  napcn: "napcn",
  napos: "napos",
};
if (!Object.hasOwn(directories, channel))
  throw Error("Unknown development channel");
const directory = directories[channel],
  hk4e = channel.startsWith("hk4e");
const run = (command, args, options = {}) =>
  cp.execFileSync(command, args, { stdio: "inherit", ...options });
if (hk4e) run(process.execPath, ["scripts/prepare-hk4e-dev.cjs"]);
run("vite", ["build", "--mode=development"], {
  env: { ...process.env, YAAGL_CHANNEL_CLIENT: channel },
});
fs.copyFileSync("neutralino.js", "dist/neutralino.js");
fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(
  "neutralino.config.json",
  path.join(directory, "neutralino.config.json")
);
run("rsync", ["-rlptu", "dist", directory]);
if (hk4e)
  run("rsync", [
    "-rlptu",
    "sophon_server/build/server.dist/",
    "sidecar/sophon_server/",
  ]);
run("rsync", ["-rlptu", "sidecar", directory]);
run("rsync", ["-rlptu", "src/icons", path.join(directory, "src")]);
const binary = path.resolve(
  `bin/hk4e-neutralino-${process.arch === "arm64" ? "arm64" : "x86_64"}`
);
const child = cp.spawn(
  hk4e ? binary : "neu",
  hk4e
    ? ["--load-dir-res", "--path=./" + directory, "--window-title=Yaagl OS"]
    : ["run", "--", "--path=./" + directory],
  { stdio: "inherit" }
);
child.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) console.error("Development runtime ended by signal:", signal);
  process.exitCode = code ?? 1;
});
