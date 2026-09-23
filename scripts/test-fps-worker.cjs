/* Execute production apply_fps with inert, deterministic lifecycle/API stubs. */
const cp = require("child_process"),
  fs = require("fs"),
  os = require("os"),
  path = require("path");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-worker-unit-"));
const binary = path.join(root, "worker");
cp.execFileSync(
  process.env.FPS_MEMORY_TEST_CC || "clang",
  [
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-fsanitize=address,undefined",
    "native/fps-bridge/worker-portable-test.c",
    "-o",
    binary,
  ],
  { stdio: "inherit" }
);
cp.execFileSync(binary, [], { stdio: "inherit" });
