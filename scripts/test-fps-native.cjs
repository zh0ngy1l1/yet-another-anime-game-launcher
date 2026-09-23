/* Portable inert C regression only. Never starts Wine, a launcher, or a game. */
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  cp = require("child_process"),
  assert = require("assert/strict");
const repo = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-native-unit-"));
const cc = process.env.FPS_MEMORY_TEST_CC || "clang";
const source = fs.readFileSync(
  path.join(repo, "native/fps-bridge/memory-diagnostics.c"),
  "utf8"
);
const fixture = fs.readFileSync(
  path.join(repo, "native/fps-bridge/memory-diagnostics-portable-test.c")
);
const cases = [
  ["production", source, true],
  [
    "stale-successful-short-error",
    source.replace("? 0 : ERROR_PARTIAL_COPY", "? 0 : GetLastError()"),
    false,
  ],
  [
    "lost-original-api-error",
    source.replace(
      "result.api_error = result.api_ok ? 0 : GetLastError();",
      "result.api_error = result.api_ok ? 0 : 999;"
    ),
    false,
  ],
  [
    "unbounded-heartbeats",
    source.replace("now - counts->last_heartbeat < 5000", "0"),
    false,
  ],
  [
    "missing-mapping-change",
    source.replace("if (changed) counts->mapping_changes++;", "(void)changed;"),
    false,
  ],
];
function check(source, binary, expected) {
  cp.execFileSync(
    cc,
    [
      "-std=c11",
      "-O1",
      "-g",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-fsanitize=address,undefined",
      "-fno-omit-frame-pointer",
      source,
      "-o",
      binary,
    ],
    { stdio: "pipe" }
  );
  const result = cp.spawnSync(binary, [], { encoding: "utf8" });
  assert.equal(result.signal, null, result.stdout + result.stderr);
  assert.equal(result.status, expected ? 0 : 1, result.stdout + result.stderr);
}
try {
  check(
    path.join(repo, "native/fps-bridge/worker-portable-test.c"),
    path.join(root, "worker"),
    true
  );
  console.log("PASS production worker lifecycle");
  for (const [name, contents, expected] of cases) {
    if (!expected)
      assert.notEqual(contents, source, "mutation must change source");
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "memory-diagnostics.c"), contents);
    fs.writeFileSync(path.join(directory, "test.c"), fixture);
    check(
      path.join(directory, "test.c"),
      path.join(directory, "memory"),
      expected
    );
    console.log(`${expected ? "PASS" : "REJECTED"} ${name}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
