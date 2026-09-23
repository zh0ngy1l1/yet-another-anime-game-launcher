/* Opt-in real Wine test. Only the locally compiled fixture is launched. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");
const assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
const steam = process.argv.includes("--steam");
const artifact = JSON.parse(
  fs.readFileSync("native/fps-bridge/build-record.json", "utf8")
);
const bytes = fs.readFileSync("sidecar/fps-bridge/fps-bridge.exe");
assert.equal(bytes.length, artifact.size);
const peOffset = bytes.readUInt32LE(0x3c);
assert.equal(
  bytes.readUInt16LE(peOffset + 24 + 68),
  2,
  "bridge must use the GUI subsystem without allocating a Wine console"
);
assert.equal(
  crypto.createHash("sha256").update(bytes).digest("hex"),
  artifact.sha256
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-bridge-fixture-"));
const fixturePath = path.join(root, "fixture.exe");
const bridgePath = path.join(root, "fps-bridge.exe");
fs.writeFileSync(bridgePath, bytes);
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
    ...(steam ? ["-mwindows", "-DFPS_FIXTURE_GUI"] : []),
    "-O2",
    "-static",
    "-Wl,--no-insert-timestamp",
    "native/fps-bridge/fixture.c",
    "-o",
    fixturePath,
  ],
  { stdio: "inherit" }
);
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
  KEEP: "fixture-kept",
};
if (Object.keys(env).some(key => key.toLowerCase() === "steamgameid"))
  throw Error("Run isolated fixtures outside SteamGameId service mode");
const steamDir = path.join(root, "signed-steam");
fs.mkdirSync(steamDir);
for (const artifact of require("../native/fps-bridge/steam-artifacts.json")) {
  const bytes = fs.readFileSync(`sidecar/protonextras/${artifact.resource}`);
  assert.equal(bytes.length, artifact.size);
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    artifact.sha256
  );
  fs.writeFileSync(path.join(steamDir, artifact.filename), bytes);
}
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
function waitServer() {
  cp.execFileSync(path.join(path.dirname(wine), "wineserver"), ["-w"], {
    env,
    timeout: 30000,
  });
}
function steamState() {
  const registry = [
    ["HKEY_CURRENT_USER\\Software\\Valve\\Steam"],
    ["HKEY_LOCAL_MACHINE\\Software\\Valve\\Steam", "/reg:32"],
    ["HKEY_LOCAL_MACHINE\\Software\\Valve\\Steam", "/reg:64"],
  ].map(([key, ...view]) => {
    const result = cp.spawnSync(wine, ["reg", "query", key, "/s", ...view], {
      env,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.ok(
      [0, 1].includes(result.status),
      "fixture registry inspection failed"
    );
    return [result.status, result.stdout];
  });
  function files(directory) {
    if (!fs.existsSync(directory)) return null;
    return fs
      .readdirSync(directory)
      .sort()
      .map(name => {
        const file = path.join(directory, name),
          stat = fs.lstatSync(file);
        return [
          name,
          stat.isSymbolicLink()
            ? ["symlink", fs.readlinkSync(file)]
            : stat.isDirectory()
            ? files(file)
            : crypto
                .createHash("sha256")
                .update(fs.readFileSync(file))
                .digest("hex"),
        ];
      });
  }
  return {
    registry,
    files: files(path.join(prefix, "drive_c/Program Files (x86)/Steam")),
  };
}
async function main() {
  console.log("Wine fixture evidence:", root);
  let decoyDir = path.join(root, "decoy");
  fs.mkdirSync(decoyDir);
  let decoy = spawn(fixturePath, [], {
    FPS_FIXTURE_DIRECTORY: win(decoyDir),
  });
  await until(
    () => read(path.join(decoyDir, "root-observed")),
    "decoy ready",
    120000
  );
  const statusFixture = path.join(root, "status-fixture.exe");
  cp.execFileSync(process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc", [
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-static",
    "-municode",
    "native/fps-bridge/status-fixture.c",
    "-lpsapi",
    "-ladvapi32",
    "-o",
    statusFixture,
  ]);
  const statusDirectory = path.join(root, "status-observation");
  fs.mkdirSync(statusDirectory);
  assert.equal(
    await spawn(statusFixture, [win(statusDirectory)]).completion,
    0
  );
  console.log("PASS deterministic child/shim exit observation races");
  const diagnosticsFixture = path.join(root, "diagnostics-fixture.exe");
  cp.execFileSync(process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc", [
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-static",
    "-municode",
    "native/fps-bridge/diagnostics-fixture.c",
    "-lpsapi",
    "-ladvapi32",
    "-o",
    diagnosticsFixture,
  ]);
  const diagnosticsDirectory = path.join(root, "diagnostics-observation");
  fs.mkdirSync(diagnosticsDirectory);
  assert.equal(
    await spawn(diagnosticsFixture, [win(diagnosticsDirectory)]).completion,
    0
  );
  assert.equal(status(diagnosticsDirectory).diagnosticError, 29);
  console.log(
    "PASS durable diagnostics: mandatory open, concurrent lines, write/short-write/flush failures, no unrecorded worker writes"
  );
  const scanFixture = path.join(root, "worker-scan-fixture.exe");
  cp.execFileSync(process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc", [
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-static",
    "-municode",
    "native/fps-bridge/worker-scan-fixture.c",
    "-lpsapi",
    "-ladvapi32",
    "-o",
    scanFixture,
  ]);
  const scanDirectory = path.join(root, "worker-scan");
  fs.mkdirSync(scanDirectory);
  assert.equal(await spawn(scanFixture, [win(scanDirectory)]).completion, 0);
  console.log(
    "PASS actual PE scanner and worker: every scan read, recurring read/write, live failure and exit/stop races"
  );
  if (steam)
    for (const artifact of require("../native/fps-bridge/steam-artifacts.json"))
      fs.copyFileSync(
        path.join(steamDir, artifact.filename),
        path.join(prefix, "drive_c/windows/system32", artifact.filename)
      );
  const originalSteam = steam ? steamState() : undefined;
  if (steam) {
    // The first decoy deliberately owns Wine PID32. This reproduces a prefix
    // user racing the production wineserver wait without touching that user.
    for (const mode of ["warm-prefix", "wrong-root-image", "direct-entry"]) {
      const dir = path.join(root, `bootstrap-${mode}`);
      fs.mkdirSync(dir);
      const token = crypto.randomBytes(32).toString("hex");
      const args = [
        win(dir),
        token,
        win(fixturePath),
        win(dir),
        "d3d11.preferredMaxFrameRate=60;",
        win(path.join(dir, "game.log")),
        "C:\\windows\\system32\\steam.exe",
      ];
      const selected =
        mode === "direct-entry"
          ? bridgePath
          : path.join(
              mode === "wrong-root-image"
                ? steamDir
                : path.join(prefix, "drive_c/windows/system32"),
              "steam.exe"
            );
      const execution = spawn(
        selected,
        mode === "direct-entry" ? args : [win(bridgePath), ...args],
        {
          FPS_FIXTURE_DIRECTORY: win(dir),
        }
      );
      await until(() => status(dir), "bootstrap rejection capabilities");
      for (const [sequence, operation] of [
        [1, "launch"],
        [2, "release"],
      ]) {
        fs.writeFileSync(
          path.join(dir, "command.tmp"),
          `${token} ${sequence} ${operation} 0 0\n`
        );
        fs.renameSync(path.join(dir, "command.tmp"), path.join(dir, "command"));
        const result = await until(
          () => status(dir)?.sequence === sequence && status(dir),
          operation
        );
        assert.equal(result.pid, 0);
        assert.equal(result.shimPid, 0);
        assert.equal(result.active, 0);
        assert.equal(result.steamActive, 0);
        assert.equal(result.generation, 0);
        assert.equal(result.workerDone, 1);
        if (operation === "launch") {
          assert.equal(result.error, 10);
          assert.equal(result.steamError, 10);
          assert.equal(read(path.join(dir, "root-startup")), undefined);
          assert.match(
            read(path.join(dir, "game.log.bridge.log")),
            /Steam bootstrap rejected/
          );
        } else assert.equal(result.released, 1);
      }
      assert.equal(await execution.completion, 0);
      if (mode === "warm-prefix") {
        assert.equal(
          read(path.join(decoyDir, "root-observed")).split(" ")[1],
          "60"
        );
        assert.equal(decoy.done, false);
        stopFixture(decoyDir);
        assert.equal(await decoy.completion, 0);
      }
      waitServer();
      console.log(
        `PASS Steam bootstrap ${mode}: no game/shim created, visible failure and empty-job release, existing target untouched`
      );
    }
  }
  async function spawnBridge(args, extra = {}) {
    if (!steam) return spawn(bridgePath, args, extra);
    waitServer();
    // Never enter the signed outer shim's unsupported service branch. That
    // negative test starts the bridge directly and verifies native rejection.
    const serviceNegative = Object.keys(extra).some(
      key => key.toLowerCase() === "steamgameid"
    );
    const execution = serviceNegative
      ? spawn(bridgePath, args, extra)
      : spawn(
          path.join(prefix, "drive_c/windows/system32/steam.exe"),
          [win(bridgePath), ...args],
          extra
        );
    const directory = args[0].slice(2).replaceAll("\\", "/");
    await until(() => status(directory), "outer Steam bridge capabilities");
    decoyDir = path.join(directory, "outside-decoy");
    fs.mkdirSync(decoyDir);
    const thisDecoyDir = decoyDir;
    decoy = spawn(fixturePath, [], { FPS_FIXTURE_DIRECTORY: win(decoyDir) });
    const thisDecoy = decoy;
    await until(
      () => read(path.join(decoyDir, "root-observed")),
      "outside-job decoy ready"
    );
    const foreground = execution.completion;
    execution.completion = foreground.then(async code => {
      stopFixture(thisDecoyDir);
      assert.equal(await thisDecoy.completion, 0);
      waitServer();
      return code;
    });
    return execution;
  }
  for (const fps of [1, 60, 61, 120, 360]) {
    const dir = path.join(root, `target-${fps}`);
    fs.mkdirSync(dir);
    const token = crypto.randomBytes(32).toString("hex");
    let sequence = 0;
    const bridge = await spawnBridge(
      [
        win(dir),
        token,
        win(fixturePath),
        win(dir),
        `other=kept;d3d11.preferredMaxFrameRate=${fps <= 60 ? fps : 0};`,
        win(path.join(dir, "game.log")),
        ...(steam ? ["C:\\windows\\system32\\steam.exe"] : []),
      ],
      {
        FPS_FIXTURE_DIRECTORY: win(dir),
        FPS_FIXTURE_DETACH: "1",
        ...(steam ? { FPS_FIXTURE_CHILD_GATE: "1" } : {}),
        ...(steam && fps === 60 ? { FPS_FIXTURE_WINDOW: "1" } : {}),
      }
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
    if (steam) {
      assert.equal(s.steamReady, 1);
      assert.notEqual(s.shimPid, pid);
      await until(
        () => read(path.join(dir, "root-startup")),
        "game creation metadata"
      );
      const metadata = read(path.join(dir, "root-startup"));
      assert.match(metadata, new RegExp(`parent=${s.shimPid}\\r?\\n`));
      assert.match(
        metadata,
        /parentImage=C:\\windows\\system32\\steam.exe\r?\n/
      );
      assert.match(metadata, /argc=1\r?\n/);
      assert.match(metadata, /KEEP=fixture-kept/);
      assert.ok(metadata.includes(`cwd=${win(process.cwd())}`));
      // This fails on the former relay route: the signed shim retained its
      // relay, not the actual game. The GUI fixture follows the game's PE
      // subsystem and must be the shim's real directly created child.
      assert.match(metadata, /parentRetainsSelfProcessHandle=1\r?\n/);
      assert.match(
        read(path.join(dir, "game.log.bridge.log")),
        /Steam bootstrap retained parent=32 image=C:\\windows\\system32\\steam.exe/
      );
      const startupLog = read(path.join(dir, "game.log.bridge.log"));
      assert.match(
        startupLog,
        /desktop prepared .*gameJobMember=0 steamJobMember=0 error=0/
      );
      assert.ok(
        startupLog.indexOf("desktop prepared") <
          startupLog.indexOf("Steam direct creation")
      );
      if (fps === 60) {
        fs.writeFileSync(
          path.join(dir, "window-create"),
          "fixture-only window gate\n"
        );
        await until(
          () => read(path.join(dir, "window-ready")),
          "real fixture window ready"
        );
      }
      fs.writeFileSync(path.join(dir, "child-create"), "fixture-only gate\n");
    }
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
    assert.equal(s.diagnosticError, 0);
    await until(
      () =>
        read(path.join(dir, "game.log.bridge.log"))?.includes(
          `value=${fps} target=${fps} action=equal`
        ),
      "durable worker readback"
    );
    const diagnosticLog = read(path.join(dir, "game.log.bridge.log"));
    assert.match(diagnosticLog, /consoleWindow=0x0\r?\n/);
    assert.match(diagnosticLog, /worker applying/);
    if (fps !== 60) assert.match(diagnosticLog, /write end .*ok=1 written=4/);
    assert.ok(
      diagnosticLog
        .split("\n")
        .filter(Boolean)
        .every(
          line => line.startsWith("FPS ") && line.includes(`request=${token} `)
        )
    );
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
    for (let i = 0; i < 100 && (s.active || s.steamActive); i++) {
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
  for (const mode of ["missing", "no-pattern", "ambiguous", "memory-error"]) {
    const dir = path.join(root, mode);
    fs.mkdirSync(dir);
    const file = path.join(root, mode + ".exe");
    if (mode !== "missing")
      cp.execFileSync(process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc", [
        "-std=c11",
        "-O2",
        "-static",
        "-municode",
        ...(steam ? ["-mwindows", "-DFPS_FIXTURE_GUI"] : []),
        ...(mode === "no-pattern"
          ? ["-DFPS_FIXTURE_NO_PATTERN"]
          : mode === "ambiguous"
          ? ["-DFPS_FIXTURE_AMBIGUOUS"]
          : []),
        "native/fps-bridge/fixture.c",
        "-o",
        file,
      ]);
    const token = crypto.randomBytes(32).toString("hex");
    let sequence = 0;
    const bridge = await spawnBridge(
      [
        win(dir),
        token,
        win(file),
        win(dir),
        "d3d11.preferredMaxFrameRate=0;",
        win(path.join(dir, "game.log")),
        ...(steam ? ["C:\\windows\\system32\\steam.exe"] : []),
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
      if (mode === "memory-error") {
        await until(
          () => read(path.join(dir, "root-observed"))?.split(" ")[1] === "120",
          "live memory fixture applying"
        );
        fs.writeFileSync(
          path.join(dir, "memory-deny"),
          "deny fixture page only"
        );
      }
      for (let i = 0; i < 200; i++) {
        s = await request("probe");
        if (s.workerDone) break;
        await sleep(20);
      }
      assert.equal(s.workerDone, 1);
      assert.equal(s.workerState, 4);
      assert.notEqual(s.workerError, 0);
      assert.equal(
        read(path.join(dir, "root-observed")).split(" ")[1],
        mode === "memory-error" ? "-1" : "60"
      );
      if (mode === "memory-error") {
        assert.equal(s.primaryExited, 0);
        assert.ok(s.active > 0);
        assert.match(
          read(path.join(dir, "game.log.bridge.log")),
          /reason=live-target-failure/
        );
        fs.writeFileSync(
          path.join(dir, "live-failure-status.json"),
          JSON.stringify(s, null, 2)
        );
      }
      assert.equal(
        read(path.join(decoyDir, "root-observed")).split(" ")[1],
        "60"
      );
      stopFixture(dir);
      for (let i = 0; i < 200 && (s.active || s.steamActive); i++) {
        await sleep(20);
        s = await request("probe");
      }
      assert.equal(s.active, 0);
    }
    for (let i = 0; i < 200 && s.steamActive; i++) {
      await sleep(20);
      s = await request("probe");
    }
    assert.equal((await request("release")).released, 1);
    assert.equal(await bridge.completion, 0);
    console.log(
      `PASS ${mode}: explicit failure, no pre-existing target adoption or unconfirmed release`
    );
  }
  {
    const dir = path.join(root, "exit-before-worker");
    fs.mkdirSync(dir);
    const token = crypto.randomBytes(32).toString("hex");
    let sequence = 0;
    const bridge = await spawnBridge(
      [
        win(dir),
        token,
        win(fixturePath),
        win(dir),
        "d3d11.preferredMaxFrameRate=0;",
        win(path.join(dir, "game.log")),
        ...(steam ? ["C:\\windows\\system32\\steam.exe"] : []),
      ],
      {
        FPS_FIXTURE_DIRECTORY: win(dir),
        FPS_FIXTURE_EXIT_CODE: "0xc0000005",
      }
    );
    await until(() => status(dir), "early-exit bridge ready");
    async function request(operation) {
      fs.writeFileSync(
        path.join(dir, "command.tmp"),
        `${token} ${++sequence} ${operation} 0 0\n`
      );
      fs.renameSync(path.join(dir, "command.tmp"), path.join(dir, "command"));
      return until(
        () => status(dir)?.sequence === sequence && status(dir),
        operation
      );
    }
    let s = await request("launch");
    if (steam && !s.launched) {
      // A direct shim may reap a very short-lived child before its retained
      // handle can be acquired. Keep that an explicit launch failure; never
      // invent an attributed game exit or adopt another process.
      assert.notEqual(s.launchError, 0);
      assert.equal(s.pid, 0);
      assert.equal(s.exitCodeKnown, 0);
    } else assert.equal(s.launched, 1);
    const attributed = s.launched === 1;
    for (let i = 0; i < 300; i++) {
      s = await request("probe");
      if ((!attributed || s.primaryExited) && !s.active && !s.steamActive)
        break;
      await sleep(20);
    }
    if (attributed) {
      assert.equal(s.primaryExited, 1);
      assert.equal(s.exitCodeKnown, 1);
      assert.equal(s.exitCode, 0xc0000005);
      assert.equal(s.exitCodeError, 0);
    } else {
      assert.equal(s.pid, 0);
      assert.equal(s.exitCodeKnown, 0);
      assert.notEqual(s.launchError, 0);
    }
    assert.equal(s.generation, 0);
    assert.equal(s.workerState, 0);
    assert.equal(s.workerDone, 1);
    if (!steam) {
      const gameLog = read(path.join(dir, "game.log"));
      assert.match(gameLog, /harmless fixture stdout/);
      assert.match(gameLog, /harmless fixture stderr/);
    }
    assert.equal(s.active, 0);
    assert.equal(s.steamActive, 0);
    assert.equal((await request("release")).released, 1);
    assert.equal(await bridge.completion, 0);
    console.log(
      "PASS simulated game failure before worker start: exact attributed exit or explicit missed-handoff failure, no worker or retarget, guarded release"
    );
  }
  if (steam) {
    const faultDir = path.join(root, "fault-shim");
    fs.mkdirSync(faultDir);
    cp.execFileSync(process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc", [
      "-std=c11",
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-static",
      "-municode",
      "-mwindows",
      "native/fps-bridge/steam-fixture.c",
      "-o",
      path.join(faultDir, "steam.exe"),
    ]);
    fs.copyFileSync(
      path.join(steamDir, "lsteamclient.dll"),
      path.join(faultDir, "lsteamclient.dll")
    );
    for (const mode of [
      "before-create",
      "missing",
      "wrong-image",
      "eager",
      "late",
      "early",
      "drop-handle",
      "SteamGameId",
    ]) {
      const dir = path.join(root, "steam-" + mode);
      fs.mkdirSync(dir);
      fs.mkdirSync(path.join(dir, "decoy"));
      const wrongImage = path.join(dir, "other-fixture.exe");
      fs.copyFileSync(fixturePath, wrongImage);
      const token = crypto.randomBytes(32).toString("hex");
      let sequence = 0;
      const bridge = await spawnBridge(
        [
          win(dir),
          token,
          win(fixturePath),
          win(dir),
          "d3d11.preferredMaxFrameRate=0;",
          win(path.join(dir, "game.log")),
          win(
            path.join(mode === "SteamGameId" ? steamDir : faultDir, "steam.exe")
          ),
        ],
        {
          FPS_FIXTURE_DIRECTORY: win(dir),
          FPS_STEAM_FIXTURE_MODE: mode,
          FPS_STEAM_FIXTURE_WRONG_IMAGE: win(wrongImage),
          ...(mode === "SteamGameId" ? { SteamGameId: "test" } : {}),
        }
      );
      await until(() => status(dir), "fault bridge ready");
      async function request(op, gen = 0, fps = 0) {
        fs.writeFileSync(
          path.join(dir, "command.tmp"),
          `${token} ${++sequence} ${op} ${gen} ${fps}\n`
        );
        fs.renameSync(path.join(dir, "command.tmp"), path.join(dir, "command"));
        return until(
          () => status(dir)?.sequence === sequence && status(dir),
          op
        );
      }
      let s = await request("launch");
      if (mode === "early" || mode === "drop-handle") {
        assert.equal(s.error, 0);
        assert.equal(s.steamReady, 1);
        const gamePid = s.pid,
          shimPid = s.shimPid;
        await until(
          () => read(path.join(dir, "root-observed")),
          "early-exit fixture game"
        );
        assert.equal((await request("start", 1, 120)).error, 0);
        await until(
          () => read(path.join(dir, "root-observed"))?.split(" ")[1] === "120",
          "early-exit bound worker"
        );
        stopFixture(dir, "steam");
        if (mode === "early") {
          for (let i = 0; i < 200 && !s.shimExited; i++) {
            await sleep(20);
            s = await request("probe");
          }
          assert.equal(s.shimExited, 1);
        } else await sleep(100);
        assert.equal(s.primaryExited, 0);
        assert.equal(s.pid, gamePid);
        assert.equal(s.shimPid, shimPid);
        assert.equal(s.active, 1);
        assert.notEqual((await request("release")).error, 0);
        assert.equal((await request("stop", 1)).error, 0);
        if (mode === "drop-handle") {
          for (let i = 0; i < 200; i++) {
            s = await request("probe");
            if (s.workerDone) break;
            await sleep(20);
          }
          assert.equal(s.workerDone, 1);
          assert.equal((await request("start", 2, 61)).error, 0);
          await until(
            () => read(path.join(dir, "root-observed"))?.split(" ")[1] === "61",
            "copied game handle survives shim closing its source handle"
          );
          assert.equal((await request("stop", 2)).error, 0);
        }
      } else {
        assert.notEqual(s.error, 0);
        assert.equal(s.launched, 0);
        assert.equal(s.pid, 0);
        if (["before-create", "missing", "SteamGameId"].includes(mode))
          assert.equal(read(path.join(dir, "root-startup")), undefined);
        if (["missing", "late", "wrong-image", "eager"].includes(mode)) {
          assert.notEqual(s.steamActive, 0);
          assert.notEqual((await request("release")).error, 0);
        }
        if (mode === "SteamGameId") assert.equal(s.shimPid, 0);
      }
      for (const which of ["root", "child", "steam", "steam-exit"])
        stopFixture(dir, which);
      stopFixture(path.join(dir, "decoy"));
      for (
        let i = 0;
        i < 300 && (s.active || s.steamActive || !s.workerDone);
        i++
      ) {
        await sleep(20);
        s = await request("probe");
      }
      assert.equal(s.active, 0);
      assert.equal(s.steamActive, 0);
      assert.equal(s.workerDone, 1);
      assert.equal((await request("release")).released, 1);
      assert.equal(await bridge.completion, 0);
      assert.equal(
        read(path.join(decoyDir, "root-observed")).split(" ")[1],
        "60"
      );
      console.log(
        `PASS Steam ${mode}: explicit boundary result, actual game isolation, guarded lifetime and completion`
      );
    }
  }
  if (steam) {
    assert.deepEqual(steamState(), originalSteam);
    console.log(
      "PASS unchanged Steam registry and library files on the supported no-SteamGameId path"
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
        stopFixture(path.join(root, entry.name), "steam");
        for (const name of ["outside-decoy", "decoy"])
          if (fs.existsSync(path.join(root, entry.name, name)))
            stopFixture(path.join(root, entry.name, name));
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
              s.active === 0 && s.steamActive === 0 && s.workerDone
                ? "release"
                : "probe"
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
