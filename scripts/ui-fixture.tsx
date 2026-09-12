/* Native UI fixture: the real launcher/settings controls, real private storage.
 * Channel installation and Wine operations are prohibited here. Not a game test.
 */
import { render } from "solid-js/web";
import { HopeProvider, NotificationsProvider } from "@hope-ui/solid";
import { createLauncher } from "../src/launcher";
import { createHk4eSettings } from "../src/clients/mhy/hk4e/settings";
import { createLocale } from "../src/locale";
import { admitFpsLaunch } from "../src/clients/mhy/hk4e/fps-admission";
import { GLOBAL_onClose } from "../src/utils/neu";
import type { Config } from "../src/config";
import type { Wine } from "../src/wine";
import type { Github } from "../src/github";
import "../src/app.css";

Neutralino.init();
const root = window.NL_PATH.startsWith("/")
  ? window.NL_PATH
  : window.NL_CWD + "/" + window.NL_PATH;
const channel =
  Reflect.get(window, "NL_UI_CHANNEL") === "hk4e_cn"
    ? "hk4e_cn"
    : "hk4e_global";
const forbidden = () => {
  throw new Error("Wine/game operations are prohibited in the UI fixture");
};
const wine: Wine = {
  exec: forbidden,
  exec2: forbidden,
  waitUntilServerOff: forbidden,
  cmd: forbidden,
  openCmdWindow: forbidden,
  setProps: forbidden,
  setNVExtension: forbidden,
  prefix: root + "/no-wine-prefix",
  distributionId: "11.0-dxmt-signed-with-patches",
  executionContext: {
    loader: root + "/no-wine-loader",
    prefix: root + "/no-wine-prefix",
    environment: {},
  },
  attributes: { renderBackend: "dxmt", winePath: "wine" },
  toWinePath: forbidden,
};
let config: Partial<Config>;
async function main() {
  try {
    await Neutralino.storage.getData("wine_tag");
  } catch {
    await Neutralino.storage.setData("wine_tag", wine.distributionId);
  }
  await Neutralino.storage.setData("config_uiLocale", "en");
  const locale = await createLocale();
  const UI = await createLauncher({
    wine,
    locale,
    github: {} as Github,
    onCheckUpdate: forbidden,
    channelClient: {
      installState: () => "INSTALLED",
      installDir: () => root + "/fixture-game",
      updateRequired: () => false,
      showPredownloadPrompt: () => false,
      predownloadVersion: () => "",
      dismissPredownload: forbidden,
      uiContent: {
        url: "https://github.com/zh0ngy1l1/yet-another-anime-game-launcher",
      },
      update: forbidden,
      install: forbidden,
      predownload: forbidden,
      launch: forbidden,
      checkIntegrity: forbidden,
      async *init() {},
      async createConfig(locale, value) {
        config = value;
        return createHk4eSettings(locale, value, () => "UI fixture — no game");
      },
    },
  });
  render(
    () => (
      <HopeProvider>
        <NotificationsProvider>
          <UI />
        </NotificationsProvider>
      </HopeProvider>
    ),
    document.getElementById("root")!
  );
  await Neutralino.events.on("windowClose", async () => {
    if (await GLOBAL_onClose(false)) await Neutralino.app.exit();
  });
  await Neutralino.window.show();
  await Neutralino.filesystem.writeFile(root + "/ready", window.NL_VERSION);
  let last = 0,
    running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const command = JSON.parse(
        await Neutralino.filesystem.readFile(root + "/ui-command")
      );
      if (command.sequence <= last) return;
      last = command.sequence;
      let data: unknown;
      if (command.action === "click")
        (document.querySelector(command.selector) as HTMLElement).click();
      else if (command.action === "game")
        (
          Array.from(document.querySelectorAll('[role="tab"]')).find(
            node => node.textContent === "Game"
          ) as HTMLElement
        ).click();
      else if (command.action === "target") {
        const input = document.querySelector(
          "#hk4eFpsUnlockTarget"
        ) as HTMLInputElement;
        input.value = command.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (command.action === "flush")
        await config.flushHk4eFpsSettings?.();
      else if (command.action === "plan")
        data = await admitFpsLaunch(
          {
            config: config as Config,
            wine,
            server: channel,
            gameDir: root + "/fixture-game",
            gameExecutable:
              channel === "hk4e_cn" ? "YuanShen.exe" : "GenshinImpact.exe",
          },
          undefined,
          async path => ({
            isFile: path !== wine.prefix,
            isDirectory: path === wine.prefix,
          })
        );
      else if (command.action === "exit") {
        await Neutralino.app.exit();
        return;
      } else if (command.action !== "inspect")
        throw new Error("Unknown UI fixture command");
      await new Promise(resolve => setTimeout(resolve, 80));
      const controls = Array.from(document.querySelectorAll("input")).map(
        input => ({
          id: input.id,
          type: input.type,
          value: input.value,
          checked: input.checked,
          labels: Array.from(input.labels ?? []).map(
            label => label.textContent
          ),
          ariaLabel: input.getAttribute("aria-label"),
          rect: input.getBoundingClientRect().toJSON(),
        })
      );
      await Neutralino.filesystem.writeFile(
        root + "/ui-response",
        JSON.stringify({
          sequence: last,
          text: document.body.innerText,
          controls,
          data,
          html: document.body.innerHTML,
        })
      );
    } catch (error) {
      if (last)
        await Neutralino.filesystem.writeFile(
          root + "/ui-response",
          JSON.stringify({ sequence: last, error: String(error) })
        );
    } finally {
      running = false;
    }
  }, 100);
}
main().catch(async error => {
  await Neutralino.filesystem.writeFile(root + "/ui-error", String(error));
});
