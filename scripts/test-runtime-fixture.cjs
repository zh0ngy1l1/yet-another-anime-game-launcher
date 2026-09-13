/* Live production boundary test using only the locally built harmless fixture. */
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  cp = require("child_process"),
  crypto = require("crypto"),
  assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
// --rpc runs the exact built production transaction/client library in a Node VM
// against the real local native server. Only the fixture's text display is
// replaced; this is OS/Wine integration evidence, never rendered UI evidence.
const rpc = process.argv.includes("--rpc");
const handoff = !process.argv.includes("--no-handoff");
const steam = process.argv.includes("--steam");
const tamperSteam = process.argv.includes("--tamper-steam");
if (tamperSteam && !steam) throw Error("--tamper-steam requires --steam");
if (
  !rpc &&
  /"IOConsoleLocked" = Yes/.test(
    cp.execFileSync("/usr/sbin/ioreg", ["-l", "-n", "Root", "-d", "1"], {
      encoding: "utf8",
    })
  )
)
  throw Error(
    "BLOCKED: unlock the macOS session before the UI-driven runtime fixture"
  );
const wine = process.env.FPS_TEST_WINE;
if (!wine || !path.isAbsolute(wine))
  throw Error("FPS_TEST_WINE must be an existing absolute loader");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-runtime-fixture-"));
fs.cpSync(".tmp/runtime-fixture-build", path.join(root, "dist"), {
  recursive: true,
});
fs.copyFileSync("neutralino.js", path.join(root, "dist/neutralino.js"));
fs.mkdirSync(path.join(root, "sidecar/fps-bridge"), { recursive: true });
fs.copyFileSync(
  "sidecar/fps-bridge/fps-bridge.exe",
  path.join(root, "sidecar/fps-bridge/fps-bridge.exe")
);
if (steam) {
  fs.mkdirSync(path.join(root, "sidecar/protonextras"));
  for (const artifact of require("../native/fps-bridge/steam-artifacts.json"))
    fs.copyFileSync(
      `sidecar/protonextras/${artifact.resource}`,
      path.join(root, "sidecar/protonextras", artifact.resource)
    );
}
fs.mkdirSync(path.join(root, "prefix"));
fs.mkdirSync(path.join(root, "game"));
cp.execFileSync(process.env.FPS_BRIDGE_CC || "x86_64-w64-mingw32-gcc", [
  "-std=c11",
  "-O2",
  "-municode",
  "-static",
  "native/fps-bridge/fixture.c",
  "-o",
  path.join(root, "game/GenshinImpact.exe"),
]);
const token = crypto.randomBytes(32).toString("hex");
fs.writeFileSync(path.join(root, "fixture-authorization"), token);
const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
config.applicationId = "com.yaagl.step7.runtimefixture";
config.documentRoot = "/dist";
config.url = "/scripts/runtime-fixture.html";
config.globalVariables = {
  FPS_TEST_WINE: wine,
  FIXTURE_TOKEN: token,
  FIXTURE_HANDOFF: handoff,
  FIXTURE_STEAM: steam,
  FIXTURE_TAMPER_STEAM: tamperSteam,
};
config.modes.window.hidden = false;
config.modes.window.title = "YAAGL harmless lifecycle fixture (no game)";
delete config.modes.window.icon;
if (rpc) {
  config.url = "/rpc.html";
  config.exportAuthInfo = true;
  fs.writeFileSync(
    path.join(root, "dist/rpc.html"),
    "<html><body>Harmless RPC fixture; no game or UI test.</body></html>"
  );
}
fs.writeFileSync(
  path.join(root, "neutralino.config.json"),
  JSON.stringify(config)
);
const log = fs.openSync(path.join(root, "native.log"), "a");
const child = cp.spawn(
  path.resolve(
    `bin/hk4e-neutralino-${process.arch === "arm64" ? "arm64" : "x86_64"}`
  ),
  ["--load-dir-res", "--path=" + root],
  { stdio: ["ignore", log, log] }
);
fs.closeSync(log);
const timers = new Set();
child.once("exit", () => {
  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
});
function read(name) {
  try {
    return fs.readFileSync(path.join(root, name), "utf8");
  } catch {
    return undefined;
  }
}
async function until(predicate, label, ms = 150000) {
  for (let i = 0; i < ms / 100; i++) {
    if (read("fixture-error")) throw Error(read("fixture-error"));
    if (predicate()) return;
    assert.equal(child.signalCode, null, "native process crashed");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("Timed out " + label + "; retained " + root);
}
(async () => {
  console.log("Production runtime fixture:", root);
  if (rpc) {
    await until(() => read(".tmp/auth_info.json"), "private native endpoint");
    const { port } = JSON.parse(read(".tmp/auth_info.json"));
    const globals = await new Promise((resolve, reject) => {
      require("http")
        .get(`http://127.0.0.1:${port}/__neutralino_globals.js`, response => {
          let text = "";
          response.on("data", data => (text += data));
          response.on("end", () => resolve(text));
          response.on("error", reject);
        })
        .on("error", reject);
    });
    const vm = require("vm"),
      events = new (require("events").EventEmitter)();
    const storage = new Map();
    const neuRequire = require("module").createRequire(
      require.resolve("@neutralinojs/neu/package.json")
    );
    const sandbox = {
      console,
      performance: require("perf_hooks").performance,
      crypto: crypto.webcrypto,
      AbortController,
      TextEncoder,
      TextDecoder,
      WebSocket: neuRequire("websocket").w3cwebsocket,
      location: { hostname: "127.0.0.1" },
      sessionStorage: {
        getItem: key => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
      },
      addEventListener: (name, fn) => events.on(name, fn),
      removeEventListener: (name, fn) => events.off(name, fn),
      dispatchEvent: event => events.emit(event.type, event),
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options.detail;
        }
      },
      setTimeout: (...args) => {
        const timer = setTimeout(...args);
        timers.add(timer);
        return timer;
      },
      setInterval: (...args) => {
        const timer = setInterval(...args);
        timers.add(timer);
        return timer;
      },
      clearTimeout,
      clearInterval,
      atob: value => Buffer.from(value, "base64").toString("binary"),
      btoa: value => Buffer.from(value, "binary").toString("base64"),
      document: {
        createElement: () => ({ relList: { supports: () => true } }),
        getElementById: () => ({ textContent: "" }),
      },
    };
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    vm.runInContext(
      globals + fs.readFileSync("neutralino.js", "utf8"),
      context
    );
    const html = fs.readFileSync(
      path.join(root, "dist/scripts/runtime-fixture.html"),
      "utf8"
    );
    const asset = /src="(\/assets\/runtime-fixture\.[^"]+\.js)"/.exec(html);
    assert.ok(asset, "built runtime fixture entry missing");
    vm.runInContext(
      fs.readFileSync(path.join(root, "dist", asset[1]), "utf8"),
      context
    );
  }
  if (!tamperSteam) {
    await until(
      () => read("game/root-observed")?.split(" ")[1] === "61",
      "target-bound worker"
    );
    assert.match(read("game/root-observed"), /d3d11.preferredMaxFrameRate=0;/);
    if (steam)
      assert.match(
        read("game/root-startup"),
        /parentImage=C:\\windows\\system32\\steam.exe\r?\n/
      );
    assert.equal(read("original-file"), "changed");
    assert.equal(JSON.parse(read("state.json")).held, true);
    cp.execFileSync("osascript", [
      "-l",
      "JavaScript",
      "-e",
      `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).terminate`,
    ]);
    await until(() => read("close-veto") === "veto", "normal quit veto");
    fs.writeFileSync(path.join(root, "game/root-stop"), "stop");
    if (handoff) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      assert.equal(JSON.parse(read("state.json")).held, true);
      assert.equal(read("original-file"), "changed");
      fs.writeFileSync(path.join(root, "game/child-stop"), "stop");
    }
  }
  await until(() => read("result.json"), "full cleanup");
  const result = JSON.parse(read("result.json"));
  if (tamperSteam) {
    assert.match(result.error, /Steam execution artifact changed/);
    assert.equal(read("game/root-startup"), undefined);
    assert.equal(read("game/root-observed"), undefined);
  } else if (handoff) assert.match(result.error, /remaining job descendants/);
  else assert.equal(result.error, null);
  assert.equal(result.state.failed, handoff || tamperSteam);
  assert.equal(result.state.held, false);
  assert.equal(result.file, "original");
  if (steam)
    for (const name of ["steam.exe", "lsteamclient.dll"])
      assert.equal(
        read(`prefix/drive_c/windows/system32/${name}`),
        `fixture original ${name}`
      );
  if (!tamperSteam) {
    const logs = fs
      .readdirSync(path.join(root, "logs"))
      .filter(name => name.endsWith(".wine.log"));
    assert.equal(logs.length, 1);
    const output = read(path.join("logs", logs[0]));
    for (const event of [
      "bridge version=3",
      "game created suspended",
      "game resumed",
      "worker start requested",
      "write begin",
      "write end",
      "game exit",
    ])
      assert.ok(
        output.includes(event),
        "missing persistent bridge/Wine diagnostic: " + event
      );
    assert.match(output, /game exit game=\d+ code=0x00000000/);
    assert.equal(
      fs.statSync(path.join(root, "logs", logs[0])).mode & 0o777,
      0o600
    );
  }
  fs.writeFileSync(path.join(root, "finish"), "exit");
  await until(() => child.exitCode !== null, "approved native exit");
  assert.equal(child.exitCode, 0);
  console.log(
    tamperSteam
      ? "PASS prepared system32 Steam artifact replacement rejected before game/relay/worker creation; exact registry/file restoration completed. Evidence:"
      : "PASS actual Native IO/acquisition/hash staging, supervisor, bridge target/job/worker, controller, normal quit veto, duplicate admission, Wine waits, registry and file restoration. Evidence:",
    root
  );
})().catch(async error => {
  // Leave the transaction in charge. Ask only our harmless fixtures to exit.
  for (const name of ["root-stop", "child-stop"])
    fs.writeFileSync(path.join(root, "game", name), "stop");
  fs.writeFileSync(path.join(root, "finish"), "exit after cleanup");
  console.error(error);
  process.exitCode = 1;
});
