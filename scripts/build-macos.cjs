/* Public local build. All acquisition is pinned; no profile or installed app inputs. */
const fs = require("fs"), path = require("path"), cp = require("child_process"),
  crypto = require("crypto"), assert = require("assert/strict");
const root = path.resolve(__dirname, "..");
const python = process.env.YAAGL_BUILD_PYTHON || "python3.13";
process.chdir(root);
const run = (command, args, options = {}) => cp.execFileSync(command, args, {stdio: "inherit", ...options});
const output = (command, args) => cp.execFileSync(command, args, {encoding: "utf8"}).trim();
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value,null,2)+"\n"); };
function copyTracked(prefix, destination) {
  for(const file of output("git",["ls-files","--",prefix]).split("\n").filter(Boolean)) {
    const target = path.join(destination,path.relative(prefix,file));
    fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(file,target);
  }
}
function inventory(directory) {
  const files = [];
  function walk(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current,name), stat = fs.lstatSync(file), relative = path.relative(directory,file);
      if(stat.isDirectory()) walk(file);
      else {
        assert(stat.isFile(), `Unexpected link/special package input: ${relative}`);
        files.push({path:relative,bytes:stat.size,mode:stat.mode & 0o777,sha256:sha(file)});
      }
    }
  }
  walk(directory); return files;
}
async function main() {
  assert.equal(process.version,"v16.20.2");
  assert.equal(output("pnpm",["--version"]),"7.33.7");
  assert.equal(process.platform,"darwin");
  assert.equal(output("uname",["-m"]),"arm64", "This app build is qualified for Apple Silicon only");
  const channel = process.env.YAAGL_CHANNEL_CLIENT || "hk4eos";
  assert(["hk4eos","hk4ecn"].includes(channel),"Use the existing build-app.js for other channels");
  const destination = path.resolve(process.env.YAAGL_BUILD_OUTPUT || `build/${channel}`);
  assert(!fs.existsSync(destination), "Build output already exists; set YAAGL_BUILD_OUTPUT to a new directory");
  const commit = output("git",["rev-parse","HEAD"]);
  assert.equal(output("git",["status","--porcelain","--untracked-files=no"]),"", "Commit source changes before building");
  run("pnpm",["install","--frozen-lockfile"]);
  fs.mkdirSync(".tmp",{recursive:true});
  const js = ".tmp/neutralino-client.js";
  if(!fs.existsSync(js)) run("curl",["-fL","--max-time","180","https://github.com/neutralinojs/neutralino.js/releases/download/v3.9.0/neutralino.js","-o",js]);
  assert.equal(sha(js),"577771c2728e8d8fab112c7da95cb02fc98cca31a9e5e065459bcac20cfb1272");
  fs.copyFileSync(js,"neutralino.js");
  fs.writeFileSync("src/clients/secret.ts",Buffer.from(fs.readFileSync("src/clients/secret.b64","utf8"),"base64"));
  run(process.execPath,["scripts/build-fps-bridge.cjs","--build-manifest"]);
  run(python,["scripts/build-hk4e-native.py"]);
  run(python,["scripts/build-sophon.py"]);
  run("pnpm",["exec","tsc"]);
  const native = JSON.parse(fs.readFileSync("bin/hk4e-neutralino-arm64.json"));
  const bridge = JSON.parse(fs.readFileSync(".tmp/build-fps-bridge-record.json"));
  assert.equal(native.sha256,sha("bin/hk4e-neutralino-arm64"));
  assert.equal(bridge.sha256,sha("sidecar/fps-bridge/fps-bridge.exe"));
  assert.equal(JSON.parse(fs.readFileSync("native/xdelta/build.json")).sha256,sha("sidecar/xdelta/xdelta3"));
  for(const [name,hash] of Object.entries(JSON.parse(fs.readFileSync("native/notices/inventory.json")))) assert.equal(sha(path.join("native/notices",name)),hash);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const temporary = fs.mkdtempSync(path.join(path.dirname(destination),".yaagl-package-"));
  const stage = path.join(temporary,"stage"), result = path.join(temporary,"result");
  const app = path.join(result,"Yaagl OS.app"), resources = path.join(app,"Contents/Resources"), mac = path.join(app,"Contents/MacOS");
  fs.mkdirSync(resources,{recursive:true}); fs.mkdirSync(mac,{recursive:true});
  const env = {...process.env,YAAGL_CHANNEL_CLIENT:channel,YAAGL_LOCAL_BUILD:"1"};
  run("pnpm",["exec","vite","build","--outDir",path.join(stage,"dist")],{env});
  fs.copyFileSync("neutralino.js",path.join(stage,"dist/neutralino.js"));
  copyTracked("src/icons",path.join(stage,"src/icons"));
  const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
  config.applicationId = `com.zh0ngy1l1.yaagl.${channel}`;
  assert.equal(config.modes.window.title,"Yaagl OS"); assert.equal(config.modes.window.hidden,true);
  write(path.join(stage,"neutralino.config.json"),config);
  const neuRequire = require("module").createRequire(require.resolve("@neutralinojs/neu/package.json"));
  const asar = neuRequire("asar");
  await asar.createPackage(stage,path.join(resources,"resources.neu"));
  fs.copyFileSync("bin/hk4e-neutralino-arm64",path.join(mac,"Yaagl"));
  copyTracked("sidecar",path.join(resources,"sidecar"));
  for(const name of ["fps-bridge.exe","LICENSE.upstream","LICENSE.steam"]) {
    const target = path.join(resources,"sidecar/fps-bridge",name);
    fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(path.join("sidecar/fps-bridge",name),target);
  }
  fs.cpSync("sophon_server/build/server.dist",path.join(resources,"sidecar/sophon_server"),{recursive:true});
  copyTracked("native/notices",path.join(resources,"licenses"));
  copyTracked("native/wine-r2",path.join(resources,"runtime-r2"));
  copyTracked("native/xdelta",path.join(resources,"sources/xdelta"));
  fs.copyFileSync("scripts/build-xdelta.py",path.join(resources,"sources/xdelta/build-xdelta.py"));
  const profile = channel === "hk4eos" ? "Yaagl OS R2" : "Yaagl China R2";
  fs.writeFileSync(path.join(mac,"parameterized"),`#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
CONTENTS_DIR="$(dirname -- "$SCRIPT_DIR")"
PROFILE="$HOME/Library/Application Support/${profile}"
mkdir -p "$PROFILE/.storage"
if [[ ! -e "$PROFILE/.storage/config_steam_patch.neustorage" ]]; then
  (set -C; printf true > "$PROFILE/.storage/config_steam_patch.neustorage")
fi
/usr/bin/rsync -rlpt "$CONTENTS_DIR/Resources/" "$PROFILE/"
cd -- "$PROFILE"
PATH_LAUNCH="$(dirname -- "$CONTENTS_DIR")" exec "$SCRIPT_DIR/Yaagl" --path="$PROFILE"
`);
  fs.chmodSync(path.join(mac,"parameterized"),0o755);
  const {IconIcns} = require("@shockpkg/icon-encoder"), icon = new IconIcns();
  icon.addFromPng(fs.readFileSync("src/icons/Paimon.cr.png"),["ic09"],true);
  fs.writeFileSync(path.join(resources,"icon.icns"),icon.encode());
  const plist = {NSHighResolutionCapable:true,CFBundleExecutable:"parameterized",CFBundleIconFile:"icon.icns",CFBundleIdentifier:config.applicationId,CFBundleName:"Yaagl OS",CFBundleDisplayName:"Yaagl OS",CFBundlePackageType:"APPL",CFBundleVersion:"1.0.0",CFBundleShortVersionString:"1.0.0",LSMinimumSystemVersion:"14.0",NSAppTransportSecurity:{NSAllowsArbitraryLoads:true}};
  write(path.join(app,"Contents/Info.plist"),plist);
  run("plutil",["-convert","xml1",path.join(app,"Contents/Info.plist")]);
  for(const name of ["Yaagl","parameterized"]) run("/bin/test",["-x",path.join(mac,name)]);
  run("codesign",["--verify","--strict",path.join(mac,"Yaagl")]);
  run("codesign",["--verify","--strict",path.join(resources,"sidecar/xdelta/xdelta3")]);
  write(path.join(resources,"manifests/native-runtime.json"),native);
  write(path.join(resources,"manifests/fps-bridge-build.json"),bridge);
  write(path.join(resources,"manifests/sophon-files.json"),inventory(path.join(resources,"sidecar/sophon_server")));
  write(path.join(resources,"manifests/sidecar-files.json"),inventory(path.join(resources,"sidecar")));
  const members = asar.listPackage(path.join(resources,"resources.neu")).map(name=>name.replace(/^\//, "")).filter(name=>!asar.statFile(path.join(resources,"resources.neu"),name).files).map(name=>({path:name,sha256:crypto.createHash("sha256").update(asar.extractFile(path.join(resources,"resources.neu"),name)).digest("hex")}));
  write(path.join(resources,"manifests/asar-files.json"),members);
  write(path.join(resources,"manifests/build.json"),{sourceCommit:commit,channel,node:process.version,pnpm:"7.33.7",native,bridge,resourcesSha256:sha(path.join(resources,"resources.neu")),runtimeDeltaSha256:sha("native/wine-r2/delta.json"),lockfiles:{"pnpm-lock.yaml":sha("pnpm-lock.yaml"),"sophon_server/uv.lock":sha("sophon_server/uv.lock")},profile:`~/Library/Application Support/${profile}`,signing:"ad-hoc native; outer bundle unsigned, not notarized",procedureReproducible:true,byteIdenticalBuildClaim:false});
  const files = inventory(app);
  assert(!files.some(x=> /(^|\/)(\.storage|wineprefix|logs|authorization)(\/|$)/i.test(x.path)),"Private package data");
  write(path.join(result,"bundle-manifest.json"),{sourceCommit:commit,channel,files});
  assert.equal(output("git",["status","--porcelain","--untracked-files=no"]),"");
  fs.renameSync(result,destination);
  fs.rmSync(temporary,{recursive:true});
  run(process.execPath,["scripts/verify-macos-package.cjs",destination]);
  console.log(`Built ${path.join(destination,"Yaagl OS.app")} from ${commit}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
