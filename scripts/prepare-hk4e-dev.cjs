/* Build only repository-local resources. Never install a Wine distribution. */
const cp = require("child_process"),
  fs = require("fs"),
  crypto = require("crypto"),
  path = require("path");
process.chdir(path.resolve(__dirname, ".."));
cp.execFileSync(process.execPath, ["scripts/build-fps-bridge.cjs"], {
  stdio: "inherit",
});
const arch = process.arch === "arm64" ? "arm64" : "x86_64";
const binary = `bin/hk4e-neutralino-${arch}`;
const hash = file =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let current = false;
try {
  const record = JSON.parse(fs.readFileSync(binary + ".json"));
  current =
    record.version === "4.11.0-yaagl-owned2" &&
    record.recipeSha256 === hash("scripts/build-hk4e-native.py") &&
    record.bootstrapSourceSha256 === hash("native/bootstrap/bootstrap.cpp") &&
    record.sha256 === hash(binary);
} catch {}
if (!current)
  cp.execFileSync("python3", ["scripts/build-hk4e-native.py"], {
    stdio: "inherit",
    env: { ...process.env, FPS_NATIVE_ARCH: arch },
  });
