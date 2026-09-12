/* Opt-in real Wine test. Only the locally compiled fixture is launched. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");
const assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
const artifact = JSON.parse(
  fs.readFileSync("native/fps-bridge/build-record.json", "utf8")
);
const bytes = fs.readFileSync("sidecar/fps-bridge/fps-bridge.exe");
assert.equal(bytes.length, artifact.size);
assert.equal(
  crypto.createHash("sha256").update(bytes).digest("hex"),
  artifact.sha256
);
const wine = process.env.FPS_TEST_WINE;
if (!wine || !path.isAbsolute(wine))
  throw Error(
    "Set FPS_TEST_WINE to an existing absolute Wine loader. No Wine is installed by this test."
  );
cp.execFileSync(
  process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc",
  [
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-municode",
    "-O2",
    "-static",
    "-Wl,--no-insert-timestamp",
    "native/fps-bridge/fixture.c",
    "-o",
    ".tmp/fps-fixture.exe",
  ],
  { stdio: "inherit" }
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-bridge-fixture-"));
const prefix = path.join(root, "prefix");
fs.mkdirSync(prefix);
const win = p => "Z:" + p.replaceAll("/", "\\");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const env = {
  ...process.env,
  WINEPREFIX: prefix,
  WINEDEBUG: "-all",
  WINEDLLOVERRIDES: "mscoree,mshtml=",
  DXMT_CONFIG: "other=kept;d3d11.preferredMaxFrameRate=120;",
};
const executions = [];
function spawn(exe, args, extra = {}) {
  const log = fs.openSync(
    path.join(root, `wine-${executions.length}.log`),
    "w"
  );
  const child = cp.spawn(wine, [exe, ...args], {
    env: { ...env, ...extra },
    stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  const result = { child, done: false };
  result.completion = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", code => {
      result.done = true;
      resolve(code);
    });
  });
  executions.push(result);
  return result;
}
async function until(read, label, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = read();
    if (value) return value;
    await sleep(30);
  }
  throw Error(`Timed out: ${label}; evidence retained in ${root}`);
}
function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
function status(dir) {
  try {
    return JSON.parse(read(path.join(dir, "response")));
  } catch {
    return undefined;
  }
}
function stopFixture(dir, which = "root") {
  fs.writeFileSync(path.join(dir, `${which}-stop`), "");
}
async function main() {
  console.log("Wine fixture evidence:", root);
  const decoyDir = path.join(root, "decoy");
  fs.mkdirSync(decoyDir);
  const decoy = spawn(path.resolve(".tmp/fps-fixture.exe"), [], {
    FPS_FIXTURE_DIRECTORY: win(decoyDir),
  });
  await until(
    () => read(path.join(decoyDir, "root-observed")),
    "decoy ready",
    120000
  );
  for (const fps of [1, 60, 61, 120, 360]) {
    const dir = path.join(root, `target-${fps}`);
    fs.mkdirSync(dir);
    const token = crypto.randomBytes(32).toString("hex");
    let sequence = 0;
    const bridge = spawn(
      path.resolve("sidecar/fps-bridge/fps-bridge.exe"),
      [
        win(dir),
        token,
        win(path.resolve(".tmp/fps-fixture.exe")),
        win(dir),
        `other=kept;d3d11.preferredMaxFrameRate=${fps <= 60 ? fps : 0};`,
        win(path.join(dir, "game.log")),
      ],
      { FPS_FIXTURE_DIRECTORY: win(dir), FPS_FIXTURE_DETACH: "1" }
    );
    const initial = await until(() => status(dir), "bridge capabilities");
    assert.equal(initial.token, token);
    assert.equal(initial.active, 0);
    async function request(op, generation = 0, arg = 0) {
      ++sequence;
      const temporary = path.join(dir, "command.tmp");
      fs.writeFileSync(
        temporary,
        `${token} ${sequence} ${op} ${generation} ${arg}\n`
      );
      fs.renameSync(temporary, path.join(dir, "command"));
      return await until(() => {
        const s = status(dir);
        return s?.token === token && s.sequence === sequence ? s : undefined;
      }, op);
    }
    // A stale request token and a malformed sequence cannot launch a process.
    fs.writeFileSync(
      path.join(dir, "command"),
      `${"0".repeat(64)} 1 launch 0 0\n`
    );
    await sleep(100);
    assert.equal(status(dir).launched, 0);
    fs.writeFileSync(
      path.join(dir, "command"),
      `${token} 4294967297 launch 0 0\n`
    );
    await sleep(100);
    assert.equal(status(dir).launched, 0);
    let s = await request("launch");
    assert.equal(s.error, 0);
    assert.equal(s.launched, 1);
    const pid = s.pid;
    await until(
      () => read(path.join(dir, "child-observed")),
      "detached child started"
    );
    s = await request("start", 1, fps);
    assert.equal(s.error, 0);
    await until(() => {
      const data = read(path.join(dir, "root-observed"));
      return data?.split(" ")[1] === String(fps);
    }, "target FPS write");
    assert.equal(
      read(path.join(decoyDir, "root-observed")).split(" ")[1],
      "60"
    );
    assert.match(
      read(path.join(dir, "root-observed")),
      new RegExp(
        `other=kept;d3d11.preferredMaxFrameRate=${fps <= 60 ? fps : 0};`
      )
    );
    s = await request("probe");
    assert.equal(s.pid, pid);
    assert.equal(s.workerState, 2);
    s = await request("stop", 99);
    assert.notEqual(s.error, 0);
    s = await request("stop", 1);
    assert.equal(s.error, 0);
    for (let i = 0; i < 100 && !s.workerDone; i++) {
      await sleep(20);
      s = await request("probe");
    }
    assert.equal(s.workerDone, 1);
    s = await request("start", 1, fps);
    assert.notEqual(s.error, 0); // stale generation
    s = await request("start", 2, fps);
    assert.equal(s.error, 0);
    stopFixture(dir);
    await until(
      () => (!read(path.join(dir, "root-observed")) ? false : true),
      "root evidence"
    );
    for (let i = 0; i < 100 && (!s.primaryExited || s.active !== 1); i++) {
      await sleep(20);
      s = await request("probe");
    }
    assert.equal(s.primaryExited, 1);
    assert.equal(s.active, 1);
    assert.equal(bridge.done, false);
    s = await request("release");
    assert.notEqual(s.error, 0); // detached descendant retains ownership
    s = await request("start", 3, fps);
    assert.notEqual(s.error, 0); // never retarget child/decoy
    stopFixture(dir, "child");
    for (let i = 0; i < 100 && s.active; i++) {
      await sleep(20);
      s = await request("probe");
    }
    assert.equal(s.active, 0);
    assert.equal(s.workerDone, 1);
    s = await request("release");
    assert.equal(s.error, 0);
    assert.equal(s.released, 1);
    assert.equal(await bridge.completion, 0);
    console.log(
      `PASS ${fps}: target handle, decoy, protocol, worker restart/stop, detached lifetime, no retarget, bridge completion`
    );
  }
  for (const mode of ["missing", "no-pattern", "ambiguous"]) {
    const dir = path.join(root, mode);
    fs.mkdirSync(dir);
    const file = path.join(root, mode + ".exe");
    if (mode !== "missing")
      cp.execFileSync(process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc", [
        "-std=c11",
        "-O2",
        "-static",
        "-municode",
        mode === "no-pattern"
          ? "-DFPS_FIXTURE_NO_PATTERN"
          : "-DFPS_FIXTURE_AMBIGUOUS",
        "native/fps-bridge/fixture.c",
        "-o",
        file,
      ]);
    const token = crypto.randomBytes(32).toString("hex");
    let sequence = 0;
    const bridge = spawn(
      path.resolve("sidecar/fps-bridge/fps-bridge.exe"),
      [
        win(dir),
        token,
        win(file),
        win(dir),
        "d3d11.preferredMaxFrameRate=0;",
        win(path.join(dir, "game.log")),
      ],
      { FPS_FIXTURE_DIRECTORY: win(dir) }
    );
    await until(() => status(dir), "negative fixture boot");
    async function request(op, generation = 0, arg = 0) {
      ++sequence;
      fs.writeFileSync(
        path.join(dir, "command.tmp"),
        `${token} ${sequence} ${op} ${generation} ${arg}\n`
      );
      fs.renameSync(path.join(dir, "command.tmp"), path.join(dir, "command"));
      return until(() => {
        const s = status(dir);
        return s?.sequence === sequence ? s : undefined;
      }, op);
    }
    assert.notEqual((await request("start", 1, 120)).error, 0);
    let s = await request("launch");
    if (mode === "missing") {
      assert.notEqual(s.launchError, 0);
      assert.equal(s.launched, 0);
      assert.equal(s.active, 0);
    } else {
      assert.equal(s.launched, 1);
      assert.notEqual((await request("launch")).error, 0);
      await until(
        () => read(path.join(dir, "root-observed")),
        "negative fixture game"
      );
      assert.equal((await request("start", 1, 120)).error, 0);
      for (let i = 0; i < 200; i++) {
        s = await request("probe");
        if (s.workerDone) break;
        await sleep(20);
      }
      assert.equal(s.workerDone, 1);
      assert.equal(s.workerState, 4);
      assert.notEqual(s.workerError, 0);
      assert.equal(read(path.join(dir, "root-observed")).split(" ")[1], "60");
      assert.equal(
        read(path.join(decoyDir, "root-observed")).split(" ")[1],
        "60"
      );
      stopFixture(dir);
      for (let i = 0; i < 200 && s.active; i++) {
        await sleep(20);
        s = await request("probe");
      }
      assert.equal(s.active, 0);
    }
    assert.equal((await request("release")).released, 1);
    assert.equal(await bridge.completion, 0);
    console.log(
      `PASS ${mode}: explicit failure, no pre-existing target adoption or unconfirmed release`
    );
  }
  // Registry snapshots preserve original type/bytes and unrelated values.
  const registryDir = path.join(root, "registry");
  fs.mkdirSync(registryDir);
  const key = "HKEY_CURRENT_USER\\Software\\Wine\\Mac Driver";
  const gameKey = "HKEY_CURRENT_USER\\Software\\miHoYo\\Genshin Impact";
  const reg = args =>
    cp.execFileSync(wine, ["reg", ...args], { env, encoding: "utf8" });
  reg(["add", key, "/v", "RetinaMode", "/t", "REG_DWORD", "/d", "17", "/f"]);
  reg([
    "add",
    gameKey,
    "/v",
    "Unrelated fixture value",
    "/t",
    "REG_SZ",
    "/d",
    "keep",
    "/f",
  ]);
  const bridgePath = path.resolve("sidecar/fps-bridge/fps-bridge.exe");
  const registry = operation =>
    cp.execFileSync(
      wine,
      [
        bridgePath,
        "--registry",
        operation,
        win(registryDir),
        "hk4e_global",
        "1",
        "1",
      ],
      { env, encoding: "utf8" }
    );
  registry("save");
  reg(["add", key, "/v", "RetinaMode", "/t", "REG_SZ", "/d", "changed", "/f"]);
  reg([
    "add",
    gameKey,
    "/v",
    "WINDOWS_HDR_ON_h3132281285",
    "/t",
    "REG_DWORD",
    "/d",
    "1",
    "/f",
  ]);
  registry("restore");
  assert.match(reg(["query", key, "/v", "RetinaMode"]), /REG_DWORD\s+0x11/);
  assert.match(
    reg(["query", gameKey, "/v", "Unrelated fixture value"]),
    /keep/
  );
  assert.notEqual(
    cp.spawnSync(
      wine,
      ["reg", "query", gameKey, "/v", "WINDOWS_HDR_ON_h3132281285"],
      { env }
    ).status,
    0
  );
  assert.notEqual(
    cp.spawnSync(
      wine,
      [
        bridgePath,
        "--registry",
        "save",
        win(registryDir),
        "hk4e_global",
        "1",
        "1",
      ],
      { env }
    ).status,
    0
  ); // never overwrite snapshots
  console.log(
    "PASS registry exact type/value restoration, missing value removal, unrelated value preserved, snapshot overwrite rejected"
  );
  stopFixture(decoyDir);
  assert.equal(await decoy.completion, 0);
  cp.execFileSync(path.join(path.dirname(wine), "wineserver"), ["-w"], {
    env,
    timeout: 30000,
  });
}
main()
  .then(async () => {
    console.log("All fixtures completed; logs retained:", root);
  })
  .catch(async error => {
    // Only cooperative stop files for our fixtures. No process/PID/prefix kills.
    for (const entry of fs.readdirSync(root, { withFileTypes: true }))
      if (entry.isDirectory() && entry.name !== "prefix") {
        stopFixture(path.join(root, entry.name));
        stopFixture(path.join(root, entry.name), "child");
      }
    for (const entry of fs.readdirSync(root, { withFileTypes: true }))
      if (entry.isDirectory()) {
        const dir = path.join(root, entry.name);
        for (let i = 0; i < 100; i++) {
          const s = status(dir);
          if (!s || s.released) break;
          fs.writeFileSync(
            path.join(dir, "command.tmp"),
            `${s.token} ${s.sequence + 1} ${
              s.active === 0 && s.workerDone ? "release" : "probe"
            } 0 0\n`
          );
          fs.renameSync(
            path.join(dir, "command.tmp"),
            path.join(dir, "command")
          );
          await sleep(100);
        }
      }
    console.error(error);
    process.exitCode = 1;
  });
