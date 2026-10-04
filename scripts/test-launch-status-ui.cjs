/* Rendered production launcher status in native WebKit, with inert game gates.
 * Never loads Wine, a game, or the user's launcher profile. */
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  cp = require("child_process"),
  assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-status-ui-"));
fs.cpSync(".tmp/ui-build", path.join(root, "dist"), { recursive: true });
fs.copyFileSync("neutralino.js", path.join(root, "dist/neutralino.js"));
const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
config.applicationId = "com.yaagl.launchstatusfixture";
config.documentRoot = "/dist";
config.url = "/scripts/ui-fixture.html";
config.globalVariables = { UI_STATUS_FIXTURE: true };
config.modes.window.hidden = false;
config.modes.window.title = "YAAGL rendered launch status fixture (no game)";
delete config.modes.window.icon;
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
const read = name => {
  try {
    return fs.readFileSync(path.join(root, name), "utf8");
  } catch {
    return undefined;
  }
};
async function until(fn) {
  for (let n = 0; n < 600; ++n) {
    if (read("ui-error")) throw Error(read("ui-error"));
    assert.equal(child.exitCode, null, "native fixture exited early");
    const value = fn();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("UI fixture timeout; evidence retained at " + root);
}
let sequence = 0;
const evidence = [];
async function command(action, extra = {}) {
  fs.writeFileSync(
    path.join(root, "ui-command"),
    JSON.stringify({ sequence: ++sequence, action, ...extra })
  );
  const result = await until(() => {
    const raw = read("ui-response");
    if (!raw) return;
    const value = JSON.parse(raw);
    if (value.sequence === sequence) return value;
  });
  assert.equal(result.error, undefined);
  evidence.push({
    action,
    ...extra,
    status: result.status,
    launchDisabled: result.launchDisabled,
  });
  fs.writeFileSync(
    path.join(root, "assertions.json"),
    JSON.stringify(evidence, null, 2)
  );
  return result;
}
function status(result, text, disabled) {
  assert.equal(result.status, text);
  assert.equal(result.launchDisabled, disabled);
  if (text)
    assert.ok(
      result.text.includes(text),
      "status must be rendered innerText, not hidden state"
    );
}
(async () => {
  console.log("Rendered launcher fixture:", root);
  await until(() => read("ready"));
  status(await command("inspect"), "", false);
  for (let run = 0; run < 2; ++run) {
    status(
      await command("click", { selector: ".launch-button button" }),
      "Preparing launch",
      true
    );
    if (run)
      status(
        await command("late", { previous: true }),
        "Preparing launch",
        true
      );
    status(
      await command("observed"),
      "Game is running. DO NOT QUIT THE LAUNCHER",
      true
    );
    status(
      await command("late"),
      "Game is running. DO NOT QUIT THE LAUNCHER",
      true
    );
    // Native focus changes must not alter the production rendered status.
    cp.execFileSync("osascript", [
      "-l",
      "JavaScript",
      "-e",
      `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).hide;`,
    ]);
    status(
      await command("inspect"),
      "Game is running. DO NOT QUIT THE LAUNCHER",
      true
    );
    cp.execFileSync("osascript", [
      "-l",
      "JavaScript",
      "-e",
      `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).activateWithOptions(3);`,
    ]);
    status(await command("ended"), "Game has exited. Finishing cleanup…", true);
    status(await command("late"), "Game has exited. Finishing cleanup…", true);
    status(await command("restored"), "", false);
    status(await command("late"), "", false);
  }
  fs.writeFileSync(
    path.join(root, "ui-command"),
    JSON.stringify({ sequence: ++sequence, action: "exit" })
  );
  await new Promise(resolve => child.once("exit", resolve));
  console.log(
    "PASS: rendered preparation → attributed running → cleanup → blank idle, late callbacks, stale launch, focus and relaunch"
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
