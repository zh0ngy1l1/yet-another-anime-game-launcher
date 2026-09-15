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
const neuRequire = require("module").createRequire(require.resolve("@neutralinojs/neu/package.json"));
const asar = neuRequire("asar"), archive = path.join(resources,"resources.neu");
assert.equal(hash(fs.readFileSync(archive)),build.resourcesSha256);
const members = JSON.parse(fs.readFileSync(path.join(resources,"manifests/asar-files.json")));
for(const member of members) assert.equal(hash(asar.extractFile(archive,member.path)),member.sha256);
const config = JSON.parse(asar.extractFile(archive,"neutralino.config.json"));
assert.equal(config.modes.window.title,"Yaagl OS"); assert.equal(config.modes.window.hidden,true);
const js = members.filter(x=>/\/assets\/.*\.js$/.test(x.path)).map(x=>asar.extractFile(archive,x.path).toString()).join("\n");
for(const value of [build.bridge.sha256,build.native.version,"custom.bootstrap","decode", "FPS runtime prepared:","eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7",build.channel === "hk4eos" ? "hk4e_global" : "hk4e_cn"]) assert(js.includes(value),value);
assert(!/Starting [Ll]auncher/.test(js));
assert(!/\/Users\/[^/]+\//.test(js));
const machos = [];
for(const item of record.files) {
  const p = path.join(app,item.path), data = fs.readFileSync(p);
  if(data.length < 4 || !["cffaedfe","cefaedfe","cafebabe","bebafeca"].includes(data.subarray(0,4).toString("hex"))) continue;
  const deps = cp.execFileSync("otool",["-L",p],{encoding:"utf8"}).split("\n").slice(1).filter(Boolean);
  for(const dep of deps) assert(/^\s+(\/usr\/lib\/|\/System\/Library\/|@loader_path\/|@rpath\/|@executable_path\/)/.test(dep),`${item.path}: ${dep}`);
  const loads = cp.execFileSync("otool",["-l",p],{encoding:"utf8"});
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
