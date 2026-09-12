/* Real local WebView bootstrap regression; no Wine, game or working profile.
 * Uses the actual src/index.tsx and Sophon client. Only createApp's external
 * setup and the fatal dialog/exit are replaced by the fixture boundary.
 */
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  cp = require("child_process"),
  http = require("http"),
  crypto = require("crypto"),
  assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
if (
  process.platform !== "darwin" ||
  /"IOConsoleLocked" = Yes/.test(
    cp.execFileSync("/usr/sbin/ioreg", ["-l", "-n", "Root", "-d", "1"], {
      encoding: "utf8",
    })
  )
)
  throw Error(
    "BLOCKED: this WebView fixture requires an unlocked macOS session"
  );
const { w3cwebsocket: WebSocket } = require("module").createRequire(
  require.resolve("@neutralinojs/neu/package.json")
)("websocket");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "yaagl-bootstrap-"));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = predicate();
    if (value) return value;
    await pause(100);
  }
  throw Error("Timed out " + label + "; retained " + root);
}
const snapshot = `JSON.stringify({
  visible: await Neutralino.window.isVisible(),
  text: document.getElementById('root').textContent,
  role: document.getElementById('root').getAttribute('role')
})`;
async function main() {
  console.log("Bootstrap WebView evidence:", root);
  await require("vite").build({
    configFile: false,
    logLevel: "warn",
    plugins: [
      {
        name: "isolated-bootstrap-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (importer === path.resolve("src/index.tsx")) {
            if (source === "./app") return "\0bootstrap-app";
            if (source === "./utils") return "\0bootstrap-utils";
          }
          if (importer === path.resolve("src/sophon.ts") && source === "@utils")
            return "\0bootstrap-utils";
        },
        load(id) {
          if (id === "\0bootstrap-utils")
            return `
              export const log = message => Neutralino.debug.log(message);
              export async function fatal(error) {
                await Neutralino.filesystem.writeFile(NL_PATH+'/failed', ${snapshot});
              }`;
          if (id === "\0bootstrap-app")
            return `
              import { createSophonRetry } from ${JSON.stringify(
                path.resolve("src/sophon.ts")
              )};
              import { timeout } from ${JSON.stringify(
                path.resolve("src/utils/helper.ts")
              )};
              export async function createApp() {
                await Neutralino.filesystem.writeFile(NL_PATH+'/starting', ${snapshot});
                // Allow a hidden WebView to enter the suspended state observed
                // in the actual bootstrap, before Sophon's first health retry.
                await Neutralino.os.execCommand('/bin/sleep 6', {});
                await Promise.race([
                  createSophonRetry('127.0.0.1', NL_BOOTSTRAP_PORT), timeout(30000)
                ]).catch(() => { throw Error('Fail to launch sophon.'); });
                return () => {
                  setTimeout(async () => {
                    await Neutralino.filesystem.writeFile(NL_PATH+'/rendered', ${snapshot});
                  }, 0);
                  return document.createTextNode('Launcher rendered after verified service health.');
                };
              }`;
        },
        generateBundle() {
          const modules = [...this.getModuleIds()];
          assert.ok(modules.includes("\0bootstrap-app"));
          assert.equal(modules.includes(path.resolve("src/app.tsx")), false);
          assert.equal(
            modules.some(id => id.includes("/src/wine/")),
            false
          );
        },
      },
      require("vite-plugin-solid")(),
    ],
    build: {
      target: "safari13",
      outDir: path.join(root, "dist"),
      emptyOutDir: true,
    },
  });
  fs.copyFileSync("neutralino.js", path.join(root, "dist/neutralino.js"));
  for (const mode of ["retry", "unavailable"]) {
    const dir = path.join(root, mode);
    fs.mkdirSync(dir);
    fs.cpSync(path.join(root, "dist"), path.join(dir, "dist"), {
      recursive: true,
    });
    let requests = 0;
    const server = http.createServer((request, response) => {
      assert.equal(request.url, "/health");
      ++requests;
      response.writeHead(mode === "retry" && requests > 1 ? 200 : 503, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify({ status: "healthy" }));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const config = JSON.parse(fs.readFileSync("neutralino.config.json"));
    Object.assign(config, {
      applicationId: "com.yaagl.bootstrap.fixture",
      exportAuthInfo: true,
      globalVariables: { BOOTSTRAP_PORT: server.address().port },
    });
    config.modes.window.title = "YAAGL bootstrap fixture — " + mode;
    assert.equal(config.modes.window.hidden, true);
    delete config.modes.window.icon;
    fs.writeFileSync(
      path.join(dir, "neutralino.config.json"),
      JSON.stringify(config)
    );
    const log = fs.openSync(path.join(dir, "native.log"), "a");
    const child = cp.spawn(
      path.resolve(
        `bin/hk4e-neutralino-${process.arch === "arm64" ? "arm64" : "x86_64"}`
      ),
      ["--load-dir-res", "--path=" + dir],
      { stdio: ["ignore", log, log] }
    );
    fs.closeSync(log);
    let socket, auth;
    const pending = new Map();
    const rpc = (method, data = {}) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("Fixture RPC timed out: " + method));
        }, 5000);
        pending.set(id, { resolve, reject, timer });
        socket.send(
          JSON.stringify({ id, method, data, accessToken: auth.accessToken })
        );
      });
    try {
      await until(
        () => fs.existsSync(path.join(dir, ".tmp/auth_info.json")),
        "fixture auth"
      );
      auth = JSON.parse(fs.readFileSync(path.join(dir, ".tmp/auth_info.json")));
      socket = new WebSocket("ws://127.0.0.1:" + auth.port);
      socket.onmessage = event => {
        const message = JSON.parse(event.data),
          waiter = pending.get(message.id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        pending.delete(message.id);
        if (message.data?.error) waiter.reject(message.data.error);
        else waiter.resolve(message.data);
      };
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      await until(
        () => fs.existsSync(path.join(dir, "starting")),
        "startup status"
      );
      const starting = JSON.parse(fs.readFileSync(path.join(dir, "starting")));
      assert.equal(
        starting.visible,
        true,
        "window must be visible before service initialization"
      );
      assert.equal(starting.role, "status");
      assert.equal(starting.text, "Starting launcher…");
      const resultFile = mode === "retry" ? "rendered" : "failed";
      await until(
        () => fs.existsSync(path.join(dir, resultFile)),
        mode + " result"
      );
      const result = JSON.parse(fs.readFileSync(path.join(dir, resultFile)));
      assert.equal(result.visible, true);
      if (mode === "retry") {
        assert.equal(requests, 2);
        assert.equal(result.role, null);
        assert.equal(
          result.text,
          "Launcher rendered after verified service health."
        );
        assert.equal(fs.existsSync(path.join(dir, "failed")), false);
      } else {
        assert.equal(requests, 10);
        assert.equal(result.role, "alert");
        assert.match(
          result.text,
          /Launcher startup failed.*Fail to launch sophon/s
        );
        assert.equal(fs.existsSync(path.join(dir, "rendered")), false);
      }
      const windowId = Number(
        cp
          .execFileSync(
            "osascript",
            [
              "-l",
              "JavaScript",
              "-e",
              `ObjC.import('CoreGraphics'); ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1,0))).find(w => w.kCGWindowOwnerPID === ${child.pid} && w.kCGWindowLayer === 0).kCGWindowNumber`,
            ],
            { encoding: "utf8" }
          )
          .trim()
      );
      cp.execFileSync("/usr/sbin/screencapture", [
        "-x",
        "-l",
        String(windowId),
        path.join(dir, "window.png"),
      ]);
      console.log(
        "PASS",
        mode,
        "health requests:",
        requests,
        "result:",
        result
      );
    } finally {
      // Exit only this disposable fixture through its private native endpoint.
      if (socket?.readyState === 1) {
        await rpc("app.exit", { code: 0 }).catch(() => {});
        socket.close();
      }
      server.close();
      await until(
        () => child.exitCode !== null || child.signalCode !== null,
        "fixture exit",
        5000
      );
      assert.equal(child.exitCode, 0);
    }
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
