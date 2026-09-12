const cp = require("child_process"),
  path = require("path");
process.chdir(path.resolve(__dirname, ".."));
const directory = process.argv[2];
if (!["yaaglwd", "yaaglwdos"].includes(directory))
  throw Error("Unknown direct HK4E development directory");
const binary = `bin/hk4e-neutralino-${
  process.arch === "arm64" ? "arm64" : "x86_64"
}`;
const child = cp.spawn(
  path.resolve(binary),
  ["--load-dir-res", "--path=./" + directory],
  { stdio: "inherit" }
);
child.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) console.error("Native runtime ended by signal:", signal);
  process.exitCode = code ?? 1;
});
