#!/usr/bin/env python3
"""Local-only Neutralino 4.11.0 build: route macOS normal quit to windowClose.

No installed application/runtime is changed. Uses the pinned upstream sources,
bundled libraries, upstream compiler options and the existing Xcode compiler.
"""
import glob
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
REVISION = "a925feb6b2a89740762e40ed673b435c1c74d466"
ARCHIVE_HASH = "5ec357aa83885c316caa8407fd00800cb84ea70e33bcbff2882c902b9673351e"
os.chdir(ROOT)
archive = ROOT / ".tmp/step7-source/neutralino.tar.gz"
archive.parent.mkdir(parents=True, exist_ok=True)
if not archive.exists():
    subprocess.run(["/usr/bin/curl", "--fail", "--silent", "--show-error", "--location",
                    f"https://codeload.github.com/3Shain/neutralinojs/tar.gz/{REVISION}", "-o", str(archive)], check=True)
if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_HASH:
    raise SystemExit("Neutralino source archive identity mismatch")
source = ROOT / ".tmp/hk4e-native-source"
source.mkdir(exist_ok=True)
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        # Exact archive, additionally refuse path traversal and links.
        relative = Path(*Path(member.name).parts[1:])
        if not relative.parts:
            continue
        if relative.is_absolute() or ".." in relative.parts or member.issym() or member.islnk():
            raise SystemExit("Unexpected archive member")
        member.name = str(relative)
        tar.extract(member, source, filter="data")
webview = source / "lib/webview/webview.h"
text = webview.read_text()
anchor = '    class_addProtocol(cls, objc_getProtocol("NSTouchBarProvider"));\n'
patch = '''    // YAAGL: normal Dock/menu quit must use the same asynchronous JS veto
    // as the window close button. app.exit remains the explicit final exit.
    class_addMethod(cls, "applicationShouldTerminate:"_sel,
                    (IMP)(+[](id, SEL, id) -> unsigned long {
                      if(windowStateChange)
                        windowStateChange(WEBVIEW_WINDOW_CLOSE);
                      return 0; // NSTerminateCancel; JS may later call app.exit.
                    }), "L@:@");
'''
if text.count(anchor) != 1:
    raise SystemExit("Native quit patch context changed")
text = text.replace(anchor, anchor + patch)
# Explicit app.exit is already approved by JS. Avoid re-entering the veto.
termination = '''    ((void (*)(id, SEL, id))objc_msgSend)("NSApp"_cls, "terminate:"_sel,
                                          nullptr);
'''
if text.count(termination) != 1:
    raise SystemExit("Native explicit-exit patch context changed")
text = text.replace(termination, "")
# Upstream orders a zero-size window before Neutralino can apply hidden=true.
# Do not briefly order any window during construction: __createWindow below
# owns the initial visibility, and hidden bootstrap shows only after DOM ready.
initial_order = '''    ((void (*)(id, SEL, id))objc_msgSend)(m_window, "makeKeyAndOrderFront:"_sel,
                                          nullptr);
'''
if text.count(initial_order) != 1:
    raise SystemExit("Native initial-window ordering patch context changed")
webview.write_text(text.replace(initial_order, ""))
# macOS 26 enforces AppKit window teardown on the main thread. The RPC thread
# must enqueue the existing close rather than invoking AppKit directly.
window_source = source / "api/window/window.cpp"
window_text = window_source.read_text()
close = "        nativeWindow->terminate(exitCode);\n        delete nativeWindow;"
if window_text.count(close) != 1:
    raise SystemExit("Native main-thread exit patch context changed")
window_source.write_text(window_text.replace(close, '''        nativeWindow->dispatch([exitCode]() {
            nativeWindow->terminate(exitCode);
        });'''))
# The native watchdog starts before WebView navigation. Its RPC clock waits on
# a condition variable, never the AppKit or sole WebSocket server thread.
bootstrap_source = ROOT / "native/bootstrap/bootstrap.cpp"
shutil.copyfile(bootstrap_source, source / "api/custom/bootstrap.cpp")
custom_header = source / "api/custom/custom.h"
custom_text = custom_header.read_text()
if custom_text.count("vector<string> getMethods();") != 1 or custom_text.count("json getMethods(const json &input);") != 1:
    raise SystemExit("Native bootstrap declaration patch context changed")
custom_text = custom_text.replace("vector<string> getMethods();", "vector<string> getMethods();\nvoid armBootstrap();\nvoid observeBootstrapClose();")
custom_text = custom_text.replace("json getMethods(const json &input);", "json getMethods(const json &input);\njson bootstrap(const json &input);")
custom_header.write_text(custom_text)
router_source = source / "server/router.cpp"
router_text = router_source.read_text()
router_anchor = '    {"custom.getMethods", custom::controllers::getMethods},'
if router_text.count(router_anchor) != 1:
    raise SystemExit("Native bootstrap router patch context changed")
router_source.write_text(router_text.replace(router_anchor, router_anchor + '\n    {"custom.bootstrap", custom::controllers::bootstrap},'))
window_text = window_source.read_text()
initial_visibility = '''    if(windowProps.hidden)
        window::hide();'''
if window_text.count(initial_visibility) != 1:
    raise SystemExit("Native configured-window visibility patch context changed")
window_text = window_text.replace(initial_visibility, initial_visibility + '''
    else
        window::show();''')
close_event = "        case WEBVIEW_WINDOW_CLOSE:"
if window_text.count(close_event) != 1:
    raise SystemExit("Native bootstrap close patch context changed")
window_text = window_text.replace(close_event, close_event + "\n            custom::observeBootstrapClose();")
navigation = "    nativeWindow->navigate(windowProps.url);"
if window_text.count(navigation) != 1:
    raise SystemExit("Native bootstrap navigation patch context changed")
window_source.write_text('#include "api/custom/custom.h"\n' + window_text.replace(navigation, "    if(windowProps.hidden) custom::armBootstrap();\n" + navigation))
# Upstream runs handleMessage inline on the sole asio server thread. A live
# foreground command would block its own ready/stop mailbox RPCs. Dispatch only
# execCommand; preserve each complete request/message and its response id.
server_source = source / "server/neuserver.cpp"
server_text = server_source.read_text()
message = "        neuserver::handleMessage(handler, msg);"
if server_text.count(message) != 1:
    raise SystemExit("Native foreground dispatch patch context changed")
server_source.write_text(server_text.replace(message, """        auto request = json::parse(msg->get_payload(), nullptr, false);
        if(request.is_object() && request.contains("method") && request["method"].is_string() && (request["method"] == "os.execCommand" || request["method"] == "custom.bootstrap")) {
            std::thread([handler, msg]() {
                neuserver::handleMessage(handler, msg);
            }).detach();
        }
        else neuserver::handleMessage(handler, msg);"""))
config = json.loads((source / "buildzri.config.json").read_text())
arch = os.environ.get("FPS_NATIVE_ARCH", platform.machine())
if arch not in ("arm64", "x86_64"):
    raise SystemExit("Unsupported macOS architecture")
target = ROOT / "bin" / ("hk4e-neutralino-" + arch)
args = ["/usr/bin/clang++", "-ObjC++", "-std=" + config["std"], "-arch", arch]
for directory in config["include"]["*"]:
    args.extend(["-I", directory])
for pattern in config["source"]["*"] + config["source"]["darwin"]:
    args.extend(sorted(glob.glob(str(source / pattern), recursive=True)))
for definition in config["definitions"]["*"] + config["definitions"]["darwin"]:
    definition = definition.replace(chr(92) + chr(34), chr(34)).replace("${BZ_VERSION}", "4.11.0-yaagl-owned3").replace("${BZ_COMMIT}", REVISION)
    args.append("-D" + definition)
for option in config["options"]["darwin"]:
    args.extend(option.split())
args.extend(["-o", str(target)])
print("Building local HK4E normal-close runtime:", target, flush=True)
subprocess.run(args, cwd=source, env={**os.environ, "MACOSX_DEPLOYMENT_TARGET": "11.0"}, check=True)
subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(target)], check=True)
record = {"upstreamRevision": REVISION, "archiveSha256": ARCHIVE_HASH,
          "version": "4.11.0-yaagl-owned3", "architecture": arch,
          "compiler": subprocess.check_output(["/usr/bin/clang++", "--version"], text=True).splitlines()[0],
          "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
          "recipeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          "patchedServerSha256": hashlib.sha256(server_source.read_bytes()).hexdigest(),
          "patchedWindowSha256": hashlib.sha256(window_source.read_bytes()).hexdigest(),
          "patchedWebviewSha256": hashlib.sha256(webview.read_bytes()).hexdigest()}
record["bootstrapSourceSha256"] = hashlib.sha256(bootstrap_source.read_bytes()).hexdigest()
record["patchedRouterSha256"] = hashlib.sha256(router_source.read_bytes()).hexdigest()
record["patchedCustomHeaderSha256"] = hashlib.sha256(custom_header.read_bytes()).hexdigest()
(target.with_suffix(".json")).write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record), flush=True)
