import { render } from "solid-js/web";
import { createApp } from "./app";
import { HopeProvider, NotificationsProvider } from "@hope-ui/solid";
import { amber } from "@radix-ui/colors";

import { exit, GLOBAL_onClose, logerror } from "./utils";
import { launchOwnership } from "./launcher/launch-ownership";
import { BootstrapSession, startBootstrap } from "./bootstrap";

function createPlates(
  tag: string,
  color: Record<string, string>,
  colortag: string
) {
  return Object.fromEntries(
    new Array(12)
      .fill(1)
      .map(
        (_, i) =>
          [`${tag}${i + 1}`, color[`${colortag}${i + 1}`] as string] as const
      )
  );
}

if (typeof Neutralino == "undefined") {
  console.log(`This app doesn't work on browser.`);
} else {
  Neutralino.init();
  if (import.meta.env.PROD) {
    document.addEventListener("contextmenu", event => event.preventDefault());
  }
  const root = document.getElementById("root") as HTMLElement;
  const session = new BootstrapSession(input => {
    if (typeof Neutralino.custom?.bootstrap !== "function") {
      return Promise.reject(
        Error(
          "Yaagl OS requires the matching local native runtime (bootstrap API missing)."
        )
      );
    }
    return Neutralino.custom.bootstrap(input);
  });
  // Install the normal close gate before the first asynchronous setup call.
  // A late sidecar acknowledgement must register its hook before shutdown.
  let closing: Promise<void> | undefined;
  let exitRequested = false;
  const showFailure = async (error: unknown) => {
    void logerror(String(error)).catch(() => undefined);
    try {
      if (session.isReady()) throw error;
      const status = await session.native({
        op: "fail",
        message: String(error),
      });
      // Native ready may have committed while its response is still pending
      // and local cancellation has already stopped the startup session.
      if (status.phase === "ready") throw error;
    } catch {
      await Neutralino.os.showMessageBox(
        "Yaagl OS",
        String(error),
        "OK",
        "ERROR"
      );
    }
  };
  const requestClose = () => {
    if (closing || exitRequested) return closing ?? Promise.resolve();
    closing = (async () => {
      try {
        if (session.isStarting()) {
          session.stop("Launcher startup cancelled", true);
          try {
            await session.native({ op: "cancel" });
          } catch (error) {
            // A mismatched native API must not bypass or prevent normal cleanup.
            await logerror(
              `Startup cancellation diagnostics unavailable: ${String(error)}`
            );
          }
        }
        await session.drainSpawns();
        if (await GLOBAL_onClose(false)) {
          await exit(0);
          exitRequested = true;
        } else if (!session.isReady()) {
          await showFailure(
            "Cleanup remains guarded. Keep the launcher and logs for review."
          );
        }
      } catch (error) {
        launchOwnership.cancelClose();
        await showFailure(`Cleanup could not finish: ${String(error)}`);
      }
    })().finally(() => {
      closing = undefined;
    });
    return closing;
  };
  Neutralino.events.on("windowClose", requestClose);
  Neutralino.events.on<{ message: string }>("bootstrapFailure", event => {
    if (event) session.stop(event.detail.message);
  });
  void startBootstrap({
    session,
    create: async () => {
      await Neutralino.window.setTitle("Yaagl OS");
      session.assertActive();
      return createApp();
    },
    render: UI => {
      root.textContent = "";
      root.removeAttribute("role");
      render(
        () => (
          <HopeProvider
            config={{
              lightTheme: {
                colors: {
                  ...createPlates("primary", amber, "amber"), // 兔兔伯爵，出击
                },
              },
            }}
          >
            <NotificationsProvider>
              <UI />
            </NotificationsProvider>
          </HopeProvider>
        ),
        root
      );
    },
    failure: error => {
      root.textContent = `Launcher startup failed.\n${String(error)}`;
      root.setAttribute("role", "alert");
      void logerror(String(error));
    },
  }).catch(async error => {
    // A mismatched runtime has no watchdog. Acknowledge its visible native
    // error, then use the same guarded close; no sidecar was admitted.
    await showFailure(error);
    await requestClose();
  });
}
