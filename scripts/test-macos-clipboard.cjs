/* Native keyboard integration test. Uses the supplied packaged executable with
 * isolated fixture resources; never changes the app, a profile, Wine or a game.
 * Requires an unlocked desktop and Accessibility access for System Events. */
const fs = require("fs"), path = require("path"), os = require("os"),
  cp = require("child_process"), assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
const executable = path.resolve(process.argv[2] || "bin/hk4e-neutralino-arm64");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-clipboard-"));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const script = text => cp.execFileSync("osascript", ["-e", text], {encoding:"utf8"});
const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
config.applicationId = "com.yaagl.clipboard-test";
Object.assign(config.modes.window, {hidden:false, title:"Yaagl clipboard verification"});
config.modes.window.icon = "/icon.png";
fs.copyFileSync("src/icons/Paimon.cr.png", path.join(directory,"icon.png"));
fs.mkdirSync(path.join(directory,"dist"));
fs.copyFileSync("neutralino.js", path.join(directory,"dist/neutralino.js"));
fs.writeFileSync(path.join(directory,"neutralino.config.json"), JSON.stringify(config));
const running = "Game is running (DO NOT CLOSE THE LAUNCHER)";
const error = "A genuine launch failure remains visible.";
fs.writeFileSync(path.join(directory,"dist/index.html"), `<!doctype html><html><body>
<p id="status">${running}</p><p id="error" role="alert">${error}</p>
<input id="field" type="text" value="original editable text"><script src="neutralino.js"></script><script>
Neutralino.init();
let sequence = 0;
setInterval(async () => {
  try {
    const c=JSON.parse(await Neutralino.filesystem.readFile(NL_PATH+'/command'));
    if(c.sequence===sequence)return; sequence=c.sequence;
    if(c.action==='select') {
      document.activeElement.blur();
      const range=document.createRange(); range.selectNodeContents(document.getElementById(c.id));
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    }
    if(c.action==='focus') document.getElementById('field').focus();
    if(c.action==='exit') {await Neutralino.app.exit();return;}
    await Neutralino.filesystem.writeFile(NL_PATH+'/response',JSON.stringify({sequence,value:document.getElementById('field').value,selection:window.getSelection().toString()}));
  } catch {}
},100);
Neutralino.window.setIcon('/icon.png').then(() => Neutralino.filesystem.writeFile(NL_PATH+'/ready','ready'));
</script></body></html>`);
const log = fs.openSync(path.join(directory,"native.log"),"w");
const child = cp.spawn(executable,["--load-dir-res","--path="+directory],{stdio:["ignore",log,log]});
fs.closeSync(log);
let sequence=0;
async function until(read) {for(let i=0;i<100;i++){const value=read();if(value)return value;await pause(100);}throw Error("Timed out; evidence: "+directory);}
async function command(action,id) {
  const request={sequence:++sequence,action,id};
  fs.writeFileSync(path.join(directory,"command"),JSON.stringify(request));
  if(action==='exit')return;
  return until(()=>{try{const r=JSON.parse(fs.readFileSync(path.join(directory,"response")));return r.sequence===sequence&&r;}catch{}});
}
function key(letter) {
  script(`tell application "System Events"
    set p to first application process whose unix id is ${child.pid}
    set frontmost of p to true
    tell p to keystroke "${letter}" using command down
  end tell`);
}
(async()=>{
  await until(()=>fs.existsSync(path.join(directory,"ready")));
  script(`tell application "System Events" to set frontmost of (first application process whose unix id is ${child.pid}) to true`);
  await pause(300);
  for(const [id,text] of [["status",running],["error",error]]) {
    await command("select",id);key("c");await pause(200);
    assert.equal(cp.execFileSync("pbpaste",{encoding:"utf8"}),text);
  }
  // A separate native application receives the actual system clipboard.
  script('tell application "TextEdit" to make new document');
  script('tell application "TextEdit" to activate');
  await pause(300);
  script('tell application "System Events" to keystroke "v" using command down');
  await pause(300);
  const pasted=script('tell application "TextEdit" to get text of front document').trim();
  assert.equal(pasted,error);
  script('tell application "TextEdit" to close front document saving no');
  await command("focus");key("a");key("v");await pause(200);
  assert.equal((await command("read")).value,error);
  key("a");key("x");await pause(200);
  assert.equal((await command("read")).value,"");
  assert.equal(cp.execFileSync("pbpaste",{encoding:"utf8"}),error);
  key("v");await pause(200);
  assert.equal((await command("read")).value,error);
  const result={executable,directory,copyStatus:true,copyError:true,pasteIntoTextEdit:true,selectAll:true,paste:true,cut:true,productionResources:false};
  fs.writeFileSync(path.join(directory,"result.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(child.exitCode===null)await command("exit");
});
