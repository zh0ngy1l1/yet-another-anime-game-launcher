import { render } from "solid-js/web";
import { createApp } from "./app";
import { HopeProvider, NotificationsProvider } from "@hope-ui/solid";
import { amber } from "@radix-ui/colors";

import { fatal } from "./utils";

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
  root.textContent = "Starting launcher…";
  root.setAttribute("role", "status");
  // Hidden macOS WebViews can suspend the retry/deadline timers used during
  // service startup. Show the window before starting asynchronous bootstrap.
  Neutralino.window
    .show()
    .then(createApp)
    .then(UI => {
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
    })
    .catch(error => {
      root.textContent = `Launcher startup failed.\n${String(error)}`;
      root.setAttribute("role", "alert");
      return fatal(error);
    });
}
