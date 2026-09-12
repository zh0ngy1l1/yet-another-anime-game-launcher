/* Builds neither Wine nor game. Run after building scripts/ui-fixture.config.ts. */
const fs = require("fs"),
  path = require("path"),
  cp = require("child_process"),
  assert = require("assert/strict"),
  crypto = require("crypto");
process.chdir(path.resolve(__dirname, ".."));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(".tmp/ui-verification");
fs.mkdirSync(root, { recursive: true });
if (
  /"IOConsoleLocked" = Yes/.test(
    cp.execFileSync("/usr/sbin/ioreg", ["-l", "-n", "Root", "-d", "1"], {
      encoding: "utf8",
    })
  )
)
  throw Error("BLOCKED: unlock the macOS session before rendering UI fixtures");
const records = [];
const hash = file =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const expected = [
  "config_hk4e_fps_unlock_enabled",
  "config_hk4e_fps_unlock_target",
];
const snapshot = dir =>
  expected.map(key => {
    const file = path.join(dir, ".storage", key + ".neustorage");
    try {
      return {
        key,
        bytes: fs.readFileSync(file, "utf8"),
        sha256: hash(file),
        mtime: fs.statSync(file).mtimeMs,
      };
    } catch {
      return { key, absent: true };
    }
  });
async function until(read, label) {
  for (let i = 0; i < 200; i++) {
    const value = read();
    if (value) return value;
    await pause(50);
  }
  throw Error("Timed out: " + label);
}
let child;
async function start(dir, channel) {
  for (const name of ["ui-command", "ui-response", "ready", "ui-error"]) {
    const file = path.join(dir, name);
    if (fs.existsSync(file))
      fs.renameSync(file, file + ".previous-" + Date.now());
  }
  const log = fs.openSync(path.join(dir, "native-output.log"), "a");
  child = cp.spawn(
    path.resolve(
      `bin/hk4e-neutralino-${process.arch === "arm64" ? "arm64" : "x86_64"}`
    ),
    ["--load-dir-res", "--path=" + dir],
    { stdio: ["ignore", log, log] }
  );
  fs.closeSync(log);
  await until(
    () => fs.existsSync(path.join(dir, "ready")),
    "native ready " + channel
  );
}
let sequence = Date.now();
async function command(dir, action, options = {}) {
  const request = { sequence: ++sequence, action, ...options };
  fs.writeFileSync(path.join(dir, "ui-command.tmp"), JSON.stringify(request));
  fs.renameSync(path.join(dir, "ui-command.tmp"), path.join(dir, "ui-command"));
  if (action === "exit") {
    await until(
      () => child.exitCode !== null || child.signalCode !== null,
      "approved native exit"
    );
    assert.equal(child.exitCode, 0);
    return;
  }
  const response = await until(() => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, "ui-response")));
      return data.sequence === sequence ? data : undefined;
    } catch {
      return undefined;
    }
  }, action);
  records.push({ channel: path.basename(dir), action, ...options, response });
  return response;
}
async function open(dir) {
  await command(dir, "click", { selector: 'button[aria-label="Settings"]' });
  return command(dir, "game");
}
const control = (response, id) =>
  response.controls.find(input => input.id === id);
async function main() {
  for (const channel of ["hk4e_global", "hk4e_cn"]) {
    const dir = fs.mkdtempSync(path.join(root, channel + "-"));
    fs.cpSync(".tmp/ui-build", path.join(dir, "dist"), { recursive: true });
    fs.copyFileSync("neutralino.js", path.join(dir, "dist/neutralino.js"));
    const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
    config.applicationId = "com.yaagl.step7.ui";
    config.url = "/scripts/ui-fixture.html";
    config.documentRoot = "/dist";
    config.globalVariables = { UI_CHANNEL: channel };
    config.modes.window.hidden = false;
    config.modes.window.title = `YAAGL ${channel} settings fixture (no game)`;
    delete config.modes.window.icon;
    fs.writeFileSync(
      path.join(dir, "neutralino.config.json"),
      JSON.stringify(config)
    );
    await start(dir, channel);
    const before = snapshot(dir);
    let response = await open(dir);
    assert.ok(
      control(response, "hk4eFpsUnlockEnabled").labels.includes(
        "Enable unlocking"
      )
    );
    assert.ok(
      control(response, "hk4eFpsUnlockTarget").labels.includes("Target FPS")
    );
    assert.ok(control(response, "hk4eFpsUnlockTarget").rect.height > 0);
    assert.equal(control(response, "hk4eFpsUnlockTarget").value, "120");
    const windowId = Number(
      cp
        .execFileSync(
          "osascript",
          [
            "-l",
            "JavaScript",
            "-e",
            `ObjC.import('CoreGraphics'); const windows=ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1,0))); const w=windows.find(w=>w.kCGWindowOwnerPID===${child.pid} && w.kCGWindowLayer===0); if(!w) throw Error('Fixture window is not visible'); w.kCGWindowNumber;`,
          ],
          { encoding: "utf8" }
        )
        .trim()
    );
    assert.ok(Number.isInteger(windowId) && windowId > 0);
    cp.execFileSync("/usr/sbin/screencapture", [
      "-x",
      "-l",
      String(windowId),
      path.join(dir, "settings-game.png"),
    ]);
    await command(dir, "click", { selector: 'button[aria-label="Close"]' });
    await open(dir);
    assert.deepEqual(snapshot(dir), before);
    await command(dir, "click", { selector: "#hk4eFpsUnlockEnabled" });
    await command(dir, "target", { value: "061" });
    assert.equal((await command(dir, "flush")).error, undefined);
    const saved61 = snapshot(dir);
    response = await command(dir, "plan");
    assert.equal(response.data.plan.companion.fpsArgument, 61);
    assert.equal(
      response.data.plan.gameDxmtConfig,
      "d3d11.preferredMaxFrameRate=0;"
    );
    await command(dir, "target", { value: "0" });
    assert.match((await command(dir, "flush")).error, /Invalid enabled/);
    assert.match((await command(dir, "plan")).error, /Invalid enabled/);
    assert.deepEqual(snapshot(dir), saved61);
    await command(dir, "click", { selector: "#hk4eFpsUnlockEnabled" });
    await command(dir, "flush");
    response = await command(dir, "inspect");
    assert.equal(control(response, "hk4eFpsUnlockTarget").value, "0");
    assert.equal(control(response, "hk4eFpsUnlockEnabled").checked, false);
    await command(dir, "target", { value: "120" });
    await command(dir, "click", { selector: "#hk4eFpsUnlockEnabled" });
    await command(dir, "flush");
    await command(dir, "click", { selector: 'button[aria-label="Close"]' });
    response = await open(dir);
    assert.equal(control(response, "hk4eFpsUnlockTarget").value, "120");
    assert.equal(control(response, "hk4eFpsUnlockEnabled").checked, true);
    const saved120 = snapshot(dir);
    await command(dir, "exit");
    await start(dir, channel);
    response = await open(dir);
    assert.equal(control(response, "hk4eFpsUnlockTarget").value, "120");
    assert.equal(control(response, "hk4eFpsUnlockEnabled").checked, true);
    assert.deepEqual(snapshot(dir), saved120);
    response = await command(dir, "plan");
    assert.equal(response.data.plan.companion.fpsArgument, 120);
    assert.equal(
      response.data.plan.gameDxmtConfig,
      "d3d11.preferredMaxFrameRate=0;"
    );
    fs.writeFileSync(
      path.join(dir, "verified-state.json"),
      JSON.stringify(
        {
          before,
          saved61,
          saved120,
          afterRestart: snapshot(dir),
          last: response,
        },
        null,
        2
      )
    );
    console.log(
      `PASS ${channel}: real rendered controls, labels, edits, invalid input, saved target, no-write open/dismiss/restart, persisted plan; ${dir}`
    );
    await command(dir, "exit");
  }
}
main()
  .catch(async error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() =>
    fs.writeFileSync(
      path.join(root, "results.json"),
      JSON.stringify(records, null, 2)
    )
  );
