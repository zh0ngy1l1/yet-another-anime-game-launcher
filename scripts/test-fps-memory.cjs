/* Portable inert C regression only. Never starts Wine, a launcher, or a game. */
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  cp = require("child_process"),
  assert = require("assert/strict");
const repo = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-memory-unit-"));
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
for (const [name, contents, expected] of cases) {
  if (!expected)
    assert.notEqual(contents, source, "mutation must change source");
  const directory = path.join(root, name);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "memory-diagnostics.c"), contents);
  fs.writeFileSync(path.join(directory, "test.c"), fixture);
  const binary = path.join(directory, "inert-memory-unit");
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
      path.join(directory, "test.c"),
      "-o",
      binary,
    ],
    { stdio: "pipe" }
  );
  const result = cp.spawnSync(binary, [], { encoding: "utf8" });
  fs.writeFileSync(
    path.join(directory, "result.json"),
    JSON.stringify(
      {
        status: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      null,
      2
    )
  );
  assert.equal(
    result.signal,
    null,
    "unit must exit normally, including mutants"
  );
  assert.equal(result.status, expected ? 0 : 1, result.stdout + result.stderr);
  console.log(`${expected ? "PASS" : "REJECTED"} ${name}`);
}
console.log("Inert unit evidence:", root);
