/* Inspect a completed app; only the harmless xdelta codec self-test executes. */
const fs = require("fs"), path = require("path"), cp = require("child_process"),
  crypto = require("crypto"), assert = require("assert/strict"), os = require("os");
const directory = path.resolve(process.argv[2] || "build/hk4eos");
const app = path.join(directory,"Yaagl OS.app"), resources = path.join(app,"Contents/Resources");
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const record = JSON.parse(fs.readFileSync(path.join(directory,"bundle-manifest.json")));
const build = JSON.parse(fs.readFileSync(path.join(resources,"manifests/build.json")));
const paths = [];
function walk(root) { for(const name of fs.readdirSync(root)) { const p = path.join(root,name), s = fs.lstatSync(p); if(s.isDirectory()) walk(p); else { assert(s.isFile()); paths.push(path.relative(app,p)); } } }
walk(app);
assert.deepEqual(paths.sort(),record.files.map(x=>x.path).sort());
for(const item of record.files) {
  const p = path.join(app,item.path), data = fs.readFileSync(p);
  assert.equal(data.length,item.bytes,item.path); assert.equal(hash(data),item.sha256,item.path);
  assert.equal(fs.statSync(p).mode & 0o777,item.mode,item.path);
}
assert.equal(record.sourceCommit,build.sourceCommit);
assert.equal(record.channel,build.channel);
assert(["hk4eos","hk4ecn","hk4euniversal"].includes(build.channel));
const neuRequire = require("module").createRequire(require.resolve("@neutralinojs/neu/package.json"));
const asar = neuRequire("asar"), archive = path.join(resources,"resources.neu");
assert.equal(hash(fs.readFileSync(archive)),build.resourcesSha256);
const members = JSON.parse(fs.readFileSync(path.join(resources,"manifests/asar-files.json")));
for(const member of members) assert.equal(hash(asar.extractFile(archive,member.path)),member.sha256);
const config = JSON.parse(asar.extractFile(archive,"neutralino.config.json"));
assert.equal(config.modes.window.title,"Yaagl OS"); assert.equal(config.modes.window.hidden,true);
const testBuild = build.testBuild === true;
assert.equal(config.applicationId,`com.zh0ngy1l1.yaagl.${build.channel}${testBuild ? ".test" : ""}`);
const profile = {hk4eos:"Yaagl OS R2",hk4ecn:"Yaagl China R2",hk4euniversal:"Yaagl Universal R2"}[build.channel] + (testBuild ? " Test" : "");
assert.equal(build.profile,`~/Library/Application Support/${profile}`);
assert(fs.readFileSync(path.join(app,"Contents/MacOS/parameterized"),"utf8").includes(`PROFILE="$HOME/Library/Application Support/${profile}"`));
const plist = JSON.parse(cp.execFileSync("plutil",["-convert","json","-o","-",path.join(app,"Contents/Info.plist")],{encoding:"utf8"}));
assert.equal(plist.CFBundleIdentifier,config.applicationId);
const js = members.filter(x=>/\/assets\/.*\.js$/.test(x.path)).map(x=>asar.extractFile(archive,x.path).toString()).join("\n");
assert(js.includes("dxmt-654f547ffab4e0c395ee368aad52bb4586b04576.zip"),"Current DXMT archive must reach the packaged frontend");
assert(!js.includes("dxmt-v0.80-builtin.tar.gz"),"Obsolete DXMT download in packaged frontend");
assert(js.includes("To update this launcher, install a complete app bundle."),"Bundled native update policy missing");
const serverMarkers = build.channel === "hk4euniversal" ? ["hk4e_global","hk4e_cn","YAAGL_OVERSEA"] : [build.channel === "hk4eos" ? "hk4e_global" : "hk4e_cn"];
for(const value of [build.bridge.sha256,build.native.version,"custom.bootstrap","decode", "Private runtime prepared:","eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7",...serverMarkers]) assert(js.includes(value),value);
for(const value of ["/usr/bin/openssl", "openssl digest length", "O_NOFOLLOW"])
  assert(js.includes(value), "Verified descriptor-based runtime hashing must reach the packaged frontend: " + value);
const fullscreen = JSON.parse(fs.readFileSync(path.join(resources,"sources/wine-fullscreen/manifest.json")));
for (const asset of fullscreen.outputs) {
  assert(js.includes(asset.sha256), "Frontend must pin packaged fullscreen driver");
  assert.equal(hash(fs.readFileSync(path.join(resources,"sidecar/wine-fullscreen",asset.path))),asset.sha256);
}
const windowHelper = JSON.parse(fs.readFileSync(path.join(resources,"sources/window-state/manifest.json")));
const gameMode = JSON.parse(fs.readFileSync(path.join(resources,"sources/wine-game-mode/manifest.json")));
for (const [executable, host] of Object.entries(gameMode.hosts)) {
  // esbuild escapes Unicode literals; the raw JSON import instead retains
  // JSON's lowercase Unicode escape inside a JS string (two backslashes).
  const escapedHost = host.replace(/[^\x20-\x7e]/g, c => "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4,"0"));
  const jsonHost = host.replace(/[^\x20-\x7e]/g, c => "\\\\u" + c.charCodeAt(0).toString(16).padStart(4,"0"));
  assert(js.includes(executable) && [host, escapedHost, jsonHost].some(value => js.includes(value)), "Frontend must select both packaged regional hosts");
}
for (const asset of gameMode.files) {
  assert(js.includes(asset.sha256), "Frontend must pin packaged Game Mode asset");
  assert.equal(hash(fs.readFileSync(path.join(resources,"sidecar/wine-game-mode",asset.path))),asset.sha256);
}
cp.execFileSync(process.env.YAAGL_BUILD_PYTHON || "python3.13", [path.join(__dirname,"verify-game-mode-assets.py"), "--resources", resources], {stdio:"inherit"});
assert(js.includes(windowHelper.sha256));
assert.equal(hash(fs.readFileSync(path.join(resources,"sidecar/window-state",windowHelper.filename))),windowHelper.sha256);
assert(!/Starting [Ll]auncher/.test(js));
assert(!/\/Users\/[^/]+\//.test(js));
const machos = [];
for(const item of record.files) {
  const p = path.join(app,item.path), data = fs.readFileSync(p);
  if(data.length < 4 || !["cffaedfe","cefaedfe","cafebabe","bebafeca"].includes(data.subarray(0,4).toString("hex"))) continue;
  const loads = cp.execFileSync("otool",["-l",p],{encoding:"utf8"});
  // LC_ID_DYLIB is a module's own install name, not a load dependency.
  const deps = loads.split("Load command").filter(block => /cmd LC_(?:LOAD|LOAD_WEAK|REEXPORT|LAZY_LOAD|LOAD_UPWARD)_DYLIB\b/.test(block)).map(block => block.match(/\n\s*name (.*?) \(offset/)[1]);
  for(const dep of deps) assert(/^(\/usr\/lib\/|\/System\/Library\/|@loader_path\/|@rpath\/|@executable_path\/)/.test(dep),`${item.path}: ${dep}`);
  assert(!/path \/(Users|opt|usr\/local)\//.test(loads),item.path);
  const signature = cp.spawnSync("codesign",["-dv",p],{encoding:"utf8"});
  if(signature.status === 0) cp.execFileSync("codesign",["--verify","--strict",p]);
  machos.push({path:item.path,dependencies:deps,signature:signature.status === 0 ? "verified" : "unsigned"});
}
const xdelta = path.join(resources,"sidecar/xdelta/xdelta3");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"yaagl-xdelta-check-"));
try {
  const source = path.join(temporary,"before"), target = path.join(temporary,"after");
  fs.writeFileSync(source,Buffer.from("original data ".repeat(8192)));
  fs.writeFileSync(target,Buffer.from("modified data ".repeat(8192)+"tail"));
  for(const secondary of ["none","djw","fgk","lzma"]) {
    const delta = path.join(temporary,secondary+".delta"), restored = path.join(temporary,secondary+".out");
    cp.execFileSync(xdelta,["-e","-S",secondary,"-s",source,target,delta]);
    cp.execFileSync(xdelta,["-d","-s",source,delta,restored]);
    assert.deepEqual(fs.readFileSync(restored),fs.readFileSync(target));
  }
} finally { fs.rmSync(temporary,{recursive:true}); }
const result = {sourceCommit:build.sourceCommit,channel:build.channel,fileCount:paths.length,asarMembers:members.length,machos,xdeltaRoundTrips:4,gameExecuted:false};
fs.writeFileSync(path.join(directory,"verification.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({verified:app,files:paths.length,xdeltaRoundTrips:4}));
