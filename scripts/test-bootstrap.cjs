/* Isolated native hidden-bootstrap regression. --prepare builds only;
 * --run requires an explicit prepared path and launches fixture windows only.
 * Actual createApp, Wine, game, profiles and sidecars are forbidden at build
 * time and process APIs are denied by the fixture native permission list.
 */
const fs = require("fs"),
  path = require("path"),
  cp = require("child_process"),
  http = require("http"),
  crypto = require("crypto"),
  assert = require("assert/strict");
const repository = path.resolve(__dirname, "..");
process.chdir(repository);
const args = process.argv.slice(2),
  action = args[0],
  location = args[1];
assert.ok(
  ["--prepare", "--run"].includes(action) && location,
  "Usage: node scripts/test-bootstrap.cjs --prepare EVIDENCE_PARENT [--native ABS_BINARY] | --run PREPARED_ROOT [--cases retry,unavailable,cancel,watchdog]"
);
assert.equal(process.version, "v16.20.2");
assert.equal(
  cp.execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
  "7.33.7"
);
const option = name => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const hash = file =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJSON = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sourceNames = [
  "src/index.tsx",
  "src/bootstrap.ts",
  "src/bootstrap-artwork.ts",
  "src/bootstrap-clock.ts",
  "src/sophon.ts",
  "src/utils/helper.ts",
  "src/utils/neu.ts",
  "src/launcher/launch-ownership.ts",
  "native/bootstrap/bootstrap.cpp",
  "scripts/build-hk4e-native.py",
  "neutralino.js",
];
const nativePermissions = [
  "app.exit",
  "custom.bootstrap",
  "debug.log",
  "window.setTitle",
  "window.isVisible",
  "window.getTitle",
  "filesystem.writeFile",
  "filesystem.appendFile",
  "filesystem.readFile",
  "os.showMessageBox",
];
const fixtureApp = `
import { createSophonRetry } from ${JSON.stringify(
  path.resolve("src/sophon.ts")
)};
import { wait, timeout } from ${JSON.stringify(
  path.resolve("src/utils/helper.ts")
)};
import { addTerminationHook } from ${JSON.stringify(
  path.resolve("src/utils/neu.ts")
)};
async function snapshot() {
 return { at:Date.now(), visible:await Neutralino.window.isVisible(), title:await Neutralino.window.getTitle(),
   text:document.getElementById('root').textContent, role:document.getElementById('root').getAttribute('role'),
   stalledTimers:window.FIXTURE_STALLED_TIMERS, stalledFrames:window.FIXTURE_STALLED_FRAMES,
   firedCallbacks:window.FIXTURE_FIRED_CALLBACKS };
}
const record = async (name, extra={}) => Neutralino.filesystem.writeFile(NL_PATH+'/'+name+'.json', JSON.stringify({...await snapshot(), ...extra}));
export async function createApp() {
 let closes=0, health=0;
 addTerminationHook(async forced=>{
   await record('close-hook-'+(++closes), {forced});
   if(NL_BOOTSTRAP_MODE==='cancel') {
     try { await Neutralino.filesystem.readFile(NL_PATH+'/allow-close'); }
     catch { await record('close-veto', {forced}); return false; }
   }
   await record('cleanup-ack', {forced});
   return true;
 });
 const native=Neutralino.custom.bootstrap;
 Neutralino.custom.bootstrap=async input=>{
   const status=await native(input);
   if(input.op==='wait' && status.phase!=='starting') await record('wait-released', {status});
   if(input.op==='ready') await record('ready-result', {status});
   if(input.op==='fail') await record('failed', {status});
   return status;
 };
 const fetchHealth=window.fetch.bind(window);
 window.fetch=async (url,...args)=>{
   if(url!=='http://127.0.0.1:'+NL_BOOTSTRAP_PORT+'/health') throw Error('Unexpected fixture network request');
   await record('health-'+(++health));
   return fetchHealth(url,...args);
 };
 await record('starting');
 if(NL_BOOTSTRAP_MODE==='cancel') await wait(60000);
 else if(NL_BOOTSTRAP_MODE==='watchdog') await new Promise(()=>{});
 else await Promise.race([createSophonRetry('127.0.0.1',NL_BOOTSTRAP_PORT),timeout(30000)])
   .catch(()=>{throw Error('Fail to launch sophon.');});
 return ()=>document.createTextNode('Launcher rendered after verified service health.');
}
`;

async function prepare() {
  assert.ok(path.isAbsolute(location), "Evidence parent must be absolute");
  fs.mkdirSync(location, { recursive: true });
  const root = fs.mkdtempSync(path.join(location, "bootstrap-native-"));
  fs.chmodSync(root, 0o700);
  const nativeInput = path.resolve(
    option("--native") ||
      `bin/hk4e-neutralino-${process.arch === "arm64" ? "arm64" : "x86_64"}`
  );
  const nativeRecord = JSON.parse(
    fs.readFileSync(
      `bin/hk4e-neutralino-${
        process.arch === "arm64" ? "arm64" : "x86_64"
      }.json`
    )
  );
  assert.equal(hash(nativeInput), nativeRecord.sha256);
  assert.equal(nativeRecord.version, "4.11.0-yaagl-owned3");
  assert.equal(
    hash("native/bootstrap/bootstrap.cpp"),
    nativeRecord.bootstrapSourceSha256
  );
  const nativeCopy = path.join(root, "native/Yaagl-bootstrap-fixture");
  fs.mkdirSync(path.dirname(nativeCopy));
  fs.copyFileSync(nativeInput, nativeCopy);
  fs.chmodSync(nativeCopy, 0o755);
  fs.writeFileSync(path.join(root, "fixture-app.ts"), fixtureApp);
  let includedModules;
  await require("vite").build({
    configFile: false,
    logLevel: "warn",
    plugins: [
      {
        name: "isolated-hidden-bootstrap-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (importer === path.resolve("src/index.tsx")) {
            if (source === "./app") return "\0bootstrap-app";
            if (source === "./utils") return "\0bootstrap-utils";
          }
          if (importer === path.resolve("src/sophon.ts") && source === "@utils")
            return "\0bootstrap-utils";
        },
        load(id) {
          if (id === "\0bootstrap-app") return fixtureApp;
          if (id === "\0bootstrap-utils")
            return `
          export { log, logerror, exit, GLOBAL_onClose } from ${JSON.stringify(
            path.resolve("src/utils/neu.ts")
          )};
          export { wait } from ${JSON.stringify(
            path.resolve("src/utils/helper.ts")
          )};`;
        },
        transformIndexHtml(html) {
          return html.replace(
            "<head>",
            `<head><style>body{background:#173326;color:#edfff3;font:24px sans-serif;padding:32px}</style><script>
          window.FIXTURE_STALLED_TIMERS=0; window.FIXTURE_STALLED_FRAMES=0;
          window.setTimeout=window.setInterval=()=>++window.FIXTURE_STALLED_TIMERS;
          window.requestAnimationFrame=()=>++window.FIXTURE_STALLED_FRAMES;
          window.clearTimeout=window.clearInterval=window.cancelAnimationFrame=()=>{};
          window.FIXTURE_FIRED_CALLBACKS=0;
          setTimeout(()=>window.FIXTURE_FIRED_CALLBACKS++,1);
          setInterval(()=>window.FIXTURE_FIRED_CALLBACKS++,1);
          requestAnimationFrame(()=>window.FIXTURE_FIRED_CALLBACKS++);
        </script>`
          );
        },
        generateBundle() {
          includedModules = [...this.getModuleIds()];
          assert.ok(includedModules.includes("\0bootstrap-app"));
          assert.ok(includedModules.includes(path.resolve("src/index.tsx")));
          assert.ok(includedModules.includes(path.resolve("src/bootstrap.ts")));
          assert.ok(includedModules.includes(path.resolve("src/sophon.ts")));
          for (const id of includedModules) {
            assert.notEqual(
              id,
              path.resolve("src/app.tsx"),
              "real application setup is forbidden"
            );
            assert.ok(
              !id.includes("/src/wine/") && !id.includes("/src/clients/"),
              "Wine/game/channel code is forbidden: " + id
            );
          }
        },
      },
      require("vite-plugin-solid")(),
    ],
    build: {
      target: "safari13",
      outDir: path.join(root, "dist"),
      emptyOutDir: true,
    },
  });
  fs.copyFileSync("neutralino.js", path.join(root, "dist/neutralino.js"));
  const files = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else
        files.push({
          path: path.relative(root, p),
          bytes: fs.statSync(p).size,
          sha256: hash(p),
        });
    }
  };
  walk(path.join(root, "dist"));
  walk(path.join(root, "native"));
  writeJSON(path.join(root, "prepared.json"), {
    schema: 1,
    preparedAt: new Date().toISOString(),
    sourceCommit: cp
      .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
      .trim(),
    harnessSha256: hash(__filename),
    nativeInput,
    nativeRecord,
    sources: sourceNames.map(name => ({ path: name, sha256: hash(name) })),
    includedModules,
    permissions: nativePermissions,
    files,
    cases: ["retry", "unavailable", "cancel", "watchdog"],
  });
  console.log("PREPARED ONLY; no application launched:", root);
}

async function run() {
  assert.equal(process.platform, "darwin");
  const root = fs.realpathSync(location),
    manifest = JSON.parse(fs.readFileSync(path.join(root, "prepared.json")));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.harnessSha256, hash(__filename));
  for (const input of manifest.sources)
    assert.equal(
      hash(input.path),
      input.sha256,
      "source changed: " + input.path
    );
  for (const file of manifest.files)
    assert.equal(
      hash(path.join(root, file.path)),
      file.sha256,
      "prepared artifact changed: " + file.path
    );
  const selected = (option("--cases") || manifest.cases.join(",")).split(",");
  assert.equal(new Set(selected).size, selected.length);
  for (const mode of selected)
    assert.ok(manifest.cases.includes(mode), "Unknown fixture case");
  assert.ok(
    !/"IOConsoleLocked" = Yes/.test(
      cp.execFileSync("/usr/sbin/ioreg", ["-l", "-n", "Root", "-d", "1"], {
        encoding: "utf8",
      })
    ),
    "Unlocked desktop required"
  );
  const results = [];
  for (const mode of selected) {
    const dir = path.join(root, mode);
    assert.ok(
      !fs.existsSync(dir),
      "Retain existing case; prepare a new fixture instead of overwriting"
    );
    fs.mkdirSync(dir);
    fs.cpSync(path.join(root, "dist"), path.join(dir, "dist"), {
      recursive: true,
    });
    const health = [];
    const server = http.createServer((request, response) => {
      health.push({ at: new Date().toISOString(), url: request.url });
      const status =
        request.url === "/health" && mode === "retry" && health.length > 3
          ? 200
          : 503;
      response.writeHead(status, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify({ status: "healthy" }));
      writeJSON(path.join(dir, "health-requests.json"), health);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
    Object.assign(config, {
      applicationId: "com.yaagl.bootstrap.fixture",
      url: "/",
      documentRoot: "/dist",
      exportAuthInfo: false,
      nativeAllowList: nativePermissions,
      globalVariables: {
        BOOTSTRAP_PORT: server.address().port,
        BOOTSTRAP_MODE: mode,
      },
    });
    Object.assign(config.modes.window, {
      title: "Yaagl OS",
      hidden: true,
      enableInspector: false,
      exitProcessOnClose: false,
    });
    delete config.modes.window.icon;
    writeJSON(path.join(dir, "neutralino.config.json"), config);
    assert.ok(
      !config.nativeAllowList.some(p =>
        /execCommand|spawnProcess|restart|kill|\*$/.test(p)
      ),
      "Process APIs must remain denied"
    );
    const output = fs.openSync(path.join(dir, "native-output.log"), "a"),
      start = Date.now();
    const child = cp.spawn(
      path.join(root, "native/Yaagl-bootstrap-fixture"),
      ["--load-dir-res", "--path=" + dir],
      { stdio: ["ignore", output, output] }
    );
    fs.closeSync(output);
    writeJSON(path.join(dir, "run.json"), {
      mode,
      pid: child.pid,
      startedAt: new Date(start).toISOString(),
      nativeSha256: manifest.nativeRecord.sha256,
      stalledDOMTimers: true,
      root,
    });
    let spawnError;
    child.once("error", error => {
      spawnError = error;
    });
    child.once("exit", (code, signal) => {
      writeJSON(path.join(dir, "native-exit.json"), {
        at: new Date().toISOString(),
        pid: child.pid,
        code,
        signal,
        cleanupAcknowledged: fs.existsSync(path.join(dir, "cleanup-ack.json")),
      });
    });
    const alive = () =>
      !spawnError && child.exitCode === null && child.signalCode === null;
    const exists = name => fs.existsSync(path.join(dir, name + ".json"));
    const read = name =>
      JSON.parse(fs.readFileSync(path.join(dir, name + ".json")));
    async function until(predicate, label, ms = 45000, requireAlive = true) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (spawnError) throw spawnError;
        const value = predicate();
        if (value) return value;
        if (requireAlive) assert.ok(alive(), "Fixture exited before " + label);
        await pause(100);
      }
      throw Error("Timed out " + label + "; retained " + dir);
    }
    function normalQuit() {
      if (!alive()) return;
      const script = `ObjC.import('AppKit'); const app=$.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}); if(!app) throw Error('Fixture app missing'); app.terminate;`;
      cp.execFileSync(
        "/usr/bin/osascript",
        ["-l", "JavaScript", "-e", script],
        { encoding: "utf8" }
      );
    }
    function windows() {
      const script = `ObjC.import('CoreGraphics'); JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1,0))).filter(w=>w.kCGWindowOwnerPID===${child.pid}&&w.kCGWindowLayer===0));`;
      return JSON.parse(
        cp
          .execFileSync(
            "/usr/bin/osascript",
            ["-l", "JavaScript", "-e", script],
            { encoding: "utf8" }
          )
          .trim()
      );
    }
    function screenshot(label) {
      const own = windows();
      writeJSON(path.join(dir, label + "-windows.json"), own);
      assert.ok(own.length, "A native fixture window must be visible");
      for (let i = 0; i < own.length; i++)
        cp.execFileSync("/usr/sbin/screencapture", [
          "-x",
          "-l",
          String(own[i].kCGWindowNumber),
          path.join(dir, label + "-" + i + ".png"),
        ]);
    }
    let failed;
    try {
      await until(() => exists("starting"), "startup entry");
      const starting = read("starting");
      assert.equal(starting.visible, false);
      assert.equal(starting.text, "");
      assert.equal(starting.role, null);
      assert.equal(starting.title, "Yaagl OS");
      const startingWindows = windows();
      writeJSON(path.join(dir, "starting-windows.json"), startingWindows);
      assert.deepEqual(
        startingWindows,
        [],
        "Main window must remain genuinely hidden"
      );
      assert.equal(starting.firedCallbacks, 0);
      assert.ok(starting.stalledTimers >= 2);
      assert.ok(starting.stalledFrames >= 1);
      if (mode === "cancel") {
        // Extend past the delivered native's observed six-second hidden stall.
        await pause(10000);
        normalQuit();
        await until(
          () => exists("close-veto") && exists("wait-released"),
          "cancelled wait and close veto"
        );
        assert.ok(alive());
        assert.equal(exists("ready-result"), false);
        assert.equal(read("close-veto").forced, false);
        assert.equal(read("wait-released").status.phase, "cancelled");
        screenshot("guarded-cancel");
        fs.writeFileSync(
          path.join(dir, "allow-close"),
          "fixture lifetime known; no child was spawned\n"
        );
      } else if (mode === "retry") {
        await until(() => exists("ready-result"), "hidden retry readiness");
        const ready = read("ready-result");
        assert.equal(ready.status.phase, "ready");
        assert.equal(ready.visible, true);
        assert.equal(
          ready.text,
          "Launcher rendered after verified service health."
        );
        assert.equal(health.length, 4);
        assert.equal(exists("failed"), false);
        for (let i = 1; i <= health.length; i++)
          assert.equal(read("health-" + i).visible, false);
        for (let i = 1; i < health.length; i++) {
          const delta = Date.parse(health[i].at) - Date.parse(health[i - 1].at);
          assert.ok(
            delta >= 2900 && delta < 15000,
            "native retry interval " + delta
          );
        }
        assert.equal(ready.firedCallbacks, 0);
        screenshot("ready");
      } else {
        await until(
          () => exists("failed"),
          "visible " + mode + " failure",
          mode === "watchdog" ? 100000 : 45000
        );
        const failure = read("failed");
        assert.equal(failure.firedCallbacks, 0);
        assert.equal(failure.visible, false);
        assert.equal(failure.role, "alert");
        assert.equal(failure.status.phase, "failed");
        assert.equal(exists("ready-result"), false);
        assert.match(
          failure.text,
          mode === "watchdog" ? /90 seconds/ : /Fail to launch sophon/
        );
        assert.equal(health.length, mode === "watchdog" ? 0 : 10);
        if (mode === "watchdog")
          assert.ok(
            Date.now() - start >= 89000,
            "watchdog must use real elapsed deadline"
          );
        screenshot("failure");
      }
      normalQuit();
      await until(
        () => child.exitCode !== null || child.signalCode !== null,
        "normal fixture exit",
        10000,
        false
      );
      assert.equal(child.exitCode, 0);
      assert.equal(child.signalCode, null);
      assert.ok(exists("cleanup-ack"));
      assert.equal(read("cleanup-ack").forced, false);
      const log = fs.readFileSync(path.join(dir, "neutralinojs.log"), "utf8");
      assert.match(
        log,
        /Bootstrap inactive scheduling disabled while initialization\/cleanup is pending/
      );
      assert.equal(
        (
          log.match(
            /Bootstrap inactive scheduling restored after showing initialized window/g
          ) || []
        ).length,
        mode === "retry" ? 1 : 0
      );
      assert.equal(
        (log.match(/Bootstrap DOM ready; showing launcher once/g) || []).length,
        mode === "retry" ? 1 : 0
      );
      const result = {
        mode,
        pass: true,
        startedAt: new Date(start).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        healthRequests: health.length,
        normalExitCode: child.exitCode,
        cleanupAcknowledged: true,
      };
      results.push(result);
      writeJSON(path.join(dir, "result.json"), result);
      console.log("PASS", mode, JSON.stringify(result));
    } catch (error) {
      failed = error;
      writeJSON(path.join(dir, "failure.json"), {
        message: String(error),
        at: new Date().toISOString(),
        pid: child.pid,
        alive: alive(),
      });
      throw error;
    } finally {
      if (alive()) {
        // Only remove this inert fixture veto; never bypass the production
        // close gate, call app.exit externally, or kill a process on failure.
        fs.writeFileSync(
          path.join(dir, "allow-close"),
          "fixture-only normal shutdown allowed\n"
        );
        try {
          normalQuit();
          await until(() => !alive(), "guarded fixture cleanup", 10000, false);
        } catch (cleanup) {
          console.error("RETAINED fixture", child.pid, dir, String(cleanup));
          if (!failed) throw cleanup;
        }
      }
      server.close();
    }
  }
  writeJSON(path.join(root, "results-" + Date.now() + ".json"), results);
  console.log("Native bootstrap fixture evidence:", root);
}
(action === "--prepare" ? prepare() : run()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
