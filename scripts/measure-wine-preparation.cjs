/* Opt-in production helper measurements, no game. Pinned Node 16/pnpm required.
 * node scripts/measure-wine-preparation.cjs /absolute/qualified/runtime /new/output
 * Output contains only fixture evidence; native state is removed after drain. */
const fs = require("fs"), path = require("path"), cp = require("child_process"),
  crypto = require("crypto"), assert = require("assert/strict");
const root = path.resolve(__dirname, "..");
process.chdir(root);
const source = fs.realpathSync(process.argv[2]);
// Resolve existing ancestors before creating anything, including symlinked
// parents. The fixture output must never be inside its read-only source tree.
let output = path.resolve(process.argv[3]), ancestor = output;
while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
output = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, output));
assert(output !== source && !output.startsWith(source + path.sep) &&
  !source.startsWith(output + path.sep), "Runtime source and fixture output must be disjoint");
assert(!fs.existsSync(output), "Use a new output directory");
fs.mkdirSync(output, {recursive:true});
const profile = path.join(output, "profile"); fs.mkdirSync(profile);
const run = (command, args, options = {}) => cp.execFileSync(command, args, {encoding:"utf8", ...options});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const token = crypto.randomBytes(32).toString("hex");
let child, sampler;
(async () => {
  const manifest = {...JSON.parse(fs.readFileSync("native/wine-r2/delta.json")), applyR2:true,
    fullscreen: JSON.parse(fs.readFileSync("native/wine-fullscreen/manifest.json")),
    fullscreenAssets: path.join(root,"sidecar/wine-fullscreen")};
  // Production admission/copy/patch receipt; outside the measured helper phases.
  const runtime = run("/usr/bin/perl", ["src/clients/mhy/hk4e/prepare-r2.pl", source,
    path.join(profile,"fps-runtime"), JSON.stringify(manifest)]).trim();
  assert.equal(path.dirname(path.dirname(runtime)),path.join(profile,"fps-runtime"));
  assert.equal(path.basename(runtime),"wine");
  assert(/^r2-[A-Za-z0-9_]{10}$/.test(path.basename(path.dirname(runtime))));
  assert.equal(fs.realpathSync(runtime),runtime);
  fs.writeFileSync(path.join(profile,"runtime-path"),runtime);
  fs.writeFileSync(path.join(profile,"fixture-authorization"),token);
  fs.mkdirSync(path.join(profile,"prefix"));
  fs.mkdirSync(path.join(profile,"sidecar/window-state"),{recursive:true});
  fs.copyFileSync("sidecar/window-state/window-registry.exe",path.join(profile,"sidecar/window-state/window-registry.exe"));
  await require("vite").build({configFile:path.join(root,"vite.config.ts"),
    build:{outDir:path.join(profile,"dist"),emptyOutDir:true,
      rollupOptions:{input:path.join(root,"scripts/measure-wine-preparation.html")}}});
  fs.copyFileSync("neutralino.js",path.join(profile,"dist/neutralino.js"));
  const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
  Object.assign(config,{applicationId:"com.yaagl.preparation-measurement",
    url:"/scripts/measure-wine-preparation.html",documentRoot:"/dist",
    globalVariables:{MEASUREMENT_TOKEN:token}});
  Object.assign(config.modes.window,{hidden:false,title:"YAAGL helper measurement (no game)"});
  delete config.modes.window.icon;
  fs.writeFileSync(path.join(profile,"neutralino.config.json"),JSON.stringify(config));
  const log = fs.openSync(path.join(output,"native.log"),"w");
  child = cp.spawn("/usr/bin/time",["-l","-o",path.join(output,"time.txt"),
    path.join(root,"bin/hk4e-neutralino-arm64"),"--load-dir-res","--path="+profile],
    {cwd:profile,stdio:["ignore",log,log]});fs.closeSync(log);
  const started=process.hrtime.bigint();
  fs.writeFileSync(path.join(output,"process-clock.json"),JSON.stringify({
    source:"process.hrtime.bigint",originUtc:new Date().toISOString(),
    relationship:"host origin; frontend phase measurements have a separate monotonic origin"
  },null,2));
  sampler=setInterval(()=>{
    // Samples are coarse supporting evidence, not an additive phase CPU total.
    // Generic Wine names may not show a path; lsof checks those before deletion.
    cp.execFile("ps",["-axo","pid,ppid,etime,time,%cpu,state,command"],{encoding:"utf8"},(error,text)=>{
      if(!error)fs.appendFileSync(path.join(output,"process-samples.jsonl"),JSON.stringify({atMs:Number(process.hrtime.bigint()-started)/1e6,
        processes:text.split("\n").filter(line=>line.includes(profile)||line.includes(runtime))})+"\n");
    });
  },1000);
  await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(code,signal)=>code===0?resolve():reject(Error(`Native exit ${code}/${signal}`)));});
  clearInterval(sampler);
  const result = JSON.parse(fs.readFileSync(path.join(profile,"result.json")));
  fs.writeFileSync(path.join(output,"result.json"),JSON.stringify(result,null,2));
  for(const name of ["measurements.json","neutralinojs.log"])
    if(fs.existsSync(path.join(profile,name)))fs.copyFileSync(path.join(profile,name),path.join(output,name));
  assert(result.completed,result.error);
  assert(!fs.existsSync(path.join(profile,".storage/hk4e_window_controls_pending.neustorage")),"window recovery still pending");
  // Never remove a live prefix or unresolved recovery state, even in this fixture.
  run(path.join(runtime,"bin/wineserver"),["-w"],{env:{...process.env,WINEPREFIX:path.join(profile,"prefix"),WINEDEBUG:"-all"}});
  await pause(250);
  const remaining=run("ps",["-axo","pid,command"]).split("\n").filter(line=>line.includes(runtime)||line.includes(profile));
  assert.deepEqual(remaining,[],"owned processes remain; retaining profile");
  // No pathname arguments: generic Wine helper names are identified by open
  // cwd/executable/module references. Keep only owned paths from the response.
  const files=cp.spawnSync("/usr/sbin/lsof",["-nP","-Fpn"],{encoding:"utf8",maxBuffer:64*1024*1024});
  assert(!files.error && files.status===0 && !String(files.stderr||"").trim(),
    "Unable to confirm open-file ownership; retaining profile");
  let pid;
  const references=[];
  for(const line of files.stdout.split("\n")) {
    if(line.startsWith("p"))pid=line.slice(1);
    if(line.startsWith("n")) {
      const name=line.slice(1), prefix=path.join(profile,"prefix");
      if(name===runtime || name.startsWith(runtime+path.sep) || name===prefix || name.startsWith(prefix+path.sep))
        references.push({pid,path:name});
    }
  }
  assert.deepEqual(references,[],"runtime/prefix still referenced; retaining profile");
  assert.equal(fs.realpathSync(profile),profile,"fixture profile identity changed");
  fs.rmSync(profile,{recursive:true});
  fs.writeFileSync(path.join(output,"cleanup.json"),JSON.stringify({completed:true,
    ownedWineDrained:true,ownedReferencesRemaining:false,profileRemoved:true,
    removedProfile:profile,removedRuntime:runtime},null,2));
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{clearInterval(sampler);console.error(error);console.error("Retained fixture state:",profile);process.exitCode=1;});
