/* Real macOS RPC/normal-close fixture; no Wine or game. */
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const cp = require("child_process"),
  assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-native-close-"));
fs.mkdirSync(path.join(dir, "dist"));
fs.copyFileSync("neutralino.js", path.join(dir, "dist/neutralino.js"));
const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
Object.assign(config, {
  applicationId: "com.yaagl.step7.closefixture",
  url: "/",
  documentRoot: "/dist",
});
Object.assign(config.modes.window, {
  hidden: false,
  title: "YAAGL RPC/close fixture (no game)",
});
delete config.modes.window.icon;
fs.writeFileSync(
  path.join(dir, "neutralino.config.json"),
  JSON.stringify(config)
);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const script =
  'my ($d,$id)=@ARGV; open(my $f,">","$d/$id-ready") or die $!; close($f); while(!-e "$d/$id-stop"){select(undef,undef,undef,0.05);} print $id;';
const command = id =>
  ["/usr/bin/perl", "-e", script, dir, id].map(quote).join(" ");
fs.writeFileSync(
  path.join(dir, "dist/index.html"),
  `<html><body><h1>Step 7 RPC/close fixture — no game</h1><script src="neutralino.js"></script><script>
Neutralino.init();
Neutralino.events.on('windowClose', async () => { await Neutralino.filesystem.appendFile(NL_PATH+'/close-events','veto\\n'); });
(async()=>{
 await Neutralino.filesystem.writeFile(NL_PATH+'/connected','connected');
 const first=Neutralino.os.execCommand(${JSON.stringify(command("first"))},{});
 const second=Neutralino.os.execCommand(${JSON.stringify(
   command("second")
 )},{});
 await Neutralino.filesystem.writeFile(NL_PATH+'/ready',NL_VERSION);
 const a=await first; await Neutralino.filesystem.writeFile(NL_PATH+'/first-result',JSON.stringify(a));
 const b=await second; await Neutralino.filesystem.writeFile(NL_PATH+'/second-result',JSON.stringify(b));
})().catch(async error=>{await Neutralino.filesystem.writeFile(NL_PATH+'/error',String(error));});
setInterval(async()=>{try {await Neutralino.filesystem.readFile(NL_PATH+'/finish'); await Neutralino.app.exit();}catch{}},200);
</script></body></html>`
);
const child = cp.spawn(
  path.resolve(
    `bin/hk4e-neutralino-${process.arch === "arm64" ? "arm64" : "x86_64"}`
  ),
  ["--load-dir-res", "--path=" + dir],
  { stdio: "ignore" }
);
const exists = name => fs.existsSync(path.join(dir, name));
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    assert.equal(child.signalCode, null, "native fixture crashed");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("Native fixture timed out; retained " + dir);
}
(async () => {
  await until(
    () => exists("ready") && exists("first-ready") && exists("second-ready")
  );
  assert.equal(
    fs.readFileSync(path.join(dir, "ready"), "utf8"),
    "4.11.0-yaagl-owned2"
  );
  cp.execFileSync("osascript", [
    "-l",
    "JavaScript",
    "-e",
    `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).terminate`,
  ]);
  await until(() => exists("close-events"));
  assert.equal(child.exitCode, null);
  fs.writeFileSync(path.join(dir, "first-stop"), "");
  await until(() => exists("first-result"));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "first-result"))).stdOut,
    "first"
  );
  assert.equal(exists("second-result"), false);
  fs.writeFileSync(path.join(dir, "second-stop"), "");
  await until(() => exists("second-result"));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, "second-result"))).stdOut,
    "second"
  );
  fs.writeFileSync(path.join(dir, "finish"), "");
  await until(() => child.exitCode !== null);
  assert.equal(child.exitCode, 0);
  console.log(
    "PASS concurrent foreground requests retain separate results, mailbox IO and normal quit veto work while pending; approved exit is on AppKit main thread. Evidence:",
    dir
  );
})().catch(async error => {
  // Cooperative stop for only these two harmless commands, then fixture exit.
  for (const name of ["first-stop", "second-stop", "finish"])
    fs.writeFileSync(path.join(dir, name), "");
  console.error(error);
  process.exitCode = 1;
});
