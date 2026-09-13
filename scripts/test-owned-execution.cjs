/* Real OS children; no substituted fork/wait/signal operations and no Wine. */
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  cp = require("child_process"),
  assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "yaagl-supervisor-fixture-")
);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function exists(file) {
  for (let i = 0; i < 200; i++) {
    if (fs.existsSync(file)) return;
    await pause(20);
  }
  throw Error("fixture timed out: " + file);
}
function supervised(name, code, prestop = false, outputLog) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  if (prestop) fs.writeFileSync(path.join(dir, "stop"), "stop");
  const child = cp.spawn("/usr/bin/perl", [
    path.resolve("src/wine/owned-execution.pl"),
    dir,
    "100",
    ...(outputLog === undefined ? [] : ["--output-log", outputLog, "--"]),
    "/usr/bin/perl",
    "-e",
    code,
    dir,
  ]);
  let out = "",
    err = "";
  child.stdout.on("data", chunk => (out += chunk));
  child.stderr.on("data", chunk => (err += chunk));
  const completion = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      try {
        assert.equal(code, 0, err);
        assert.equal(signal, null);
        resolve(JSON.parse(out));
      } catch (error) {
        reject(error);
      }
    });
  });
  return { dir, child, completion };
}
(async () => {
  console.log("Real supervisor fixture evidence:", root);
  const normal = supervised(
    "normal",
    `open(my $f,'>',"$ARGV[0]/ran") or die $!; print $f 'ran'; close $f; exit 0;`
  );
  assert.deepEqual(await normal.completion, {
    spawned: 1,
    confirmed: 1,
    status: 0,
    error: "",
  });
  assert.equal(fs.readFileSync(path.join(normal.dir, "ran"), "utf8"), "ran");
  const outputLog = path.join(root, "child's $output `literal`.log");
  const logged = supervised(
    "logged",
    `print STDOUT 'child stdout'; print STDERR 'child stderr'; exit 17;`,
    false,
    outputLog
  );
  assert.deepEqual(await logged.completion, {
    spawned: 1,
    confirmed: 1,
    status: 17 << 8,
    error: "",
  });
  assert.equal(fs.readFileSync(outputLog, "utf8"), "child stderrchild stdout");
  assert.equal(fs.statSync(outputLog).mode & 0o777, 0o600);
  for (const kind of ["existing", "symlink", "missing-parent"]) {
    const target =
      kind === "existing"
        ? outputLog
        : path.join(root, kind === "symlink" ? "link.log" : "absent/out.log");
    if (kind === "symlink") fs.symlinkSync(outputLog, target);
    const rejected = supervised(
      kind,
      `open(my $f,'>',"$ARGV[0]/must-not-run");`,
      false,
      target
    );
    const result = await rejected.completion;
    assert.equal(result.confirmed, 1);
    assert.equal(result.spawned, 0);
    assert.match(result.error, /exec:/);
    assert.equal(fs.existsSync(path.join(rejected.dir, "must-not-run")), false);
    assert.equal(
      fs.readFileSync(outputLog, "utf8"),
      "child stderrchild stdout"
    );
  }
  console.log(
    "PASS retained Unix stdout/stderr, exact nonzero child status, exclusive log creation and no child execution on log failure"
  );
  const cancelled = supervised(
    "prestop",
    `open(my $f,'>',"$ARGV[0]/must-not-run");`,
    true
  );
  assert.deepEqual(await cancelled.completion, {
    spawned: 0,
    confirmed: 1,
    status: 0,
    error: "",
  });
  assert.equal(fs.existsSync(path.join(cancelled.dir, "must-not-run")), false);
  const decoy = supervised(
    "decoy",
    `while(!-e "$ARGV[0]/cooperative-exit"){select undef,undef,undef,.02} exit 0;`
  );
  await exists(path.join(decoy.dir, "ready"));
  const owned = supervised(
    "owned",
    `$SIG{TERM}=sub{}; open(my $f,'>',"$ARGV[0]/running") or die $!; print $f $$; close $f; while(1){select undef,undef,undef,.02}`
  );
  await exists(path.join(owned.dir, "running"));
  fs.writeFileSync(path.join(owned.dir, "stop"), "stop");
  const result = await owned.completion;
  assert.equal(result.confirmed, 1);
  assert.equal(result.spawned, 1);
  assert.equal(result.status & 127, 9);
  assert.equal(decoy.child.exitCode, null);
  fs.writeFileSync(path.join(decoy.dir, "cooperative-exit"), "exit");
  assert.equal((await decoy.completion).status, 0);
  console.log(
    "PASS natural exit, pre-spawn cancellation, TERM grace/KILL of unreaped direct child, untouched decoy and confirmed reap"
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
