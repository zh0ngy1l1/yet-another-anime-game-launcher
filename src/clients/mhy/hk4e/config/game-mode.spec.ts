import { expect, it, vi } from "vitest";
import { createRoot, ParentProps } from "solid-js";
import { createLocale } from "@locale";
import type { Config } from "@config/config-def";
import { createGameModeConfig } from "./game-mode";

vi.mock("solid-js", () =>
  vi.importActual<typeof import("solid-js")>("solid-js/dist/dev.js")
);
vi.mock("@hope-ui/solid", () => {
  const captured: { checked: boolean; onChange: () => void }[] = [];
  const children = (p: ParentProps) => p.children;
  return {
    captured,
    Box: children,
    Text: children,
    FormLabel: children,
    FormControl: children,
    Checkbox: (p: { checked: boolean; onChange: () => void }) => {
      captured.push(p);
      return null;
    },
  };
});
it("defaults off, persists independently, and reopening does not write or launch", async () => {
  const values = new Map<string, string>([["config_uiLocale", "en"]]);
  const write = vi.fn(async (k: string, v: string) => {
    values.set(k, v);
  });
  vi.stubGlobal("Neutralino", {
    storage: {
      getData: async (k: string) => {
        if (!values.has(k)) throw { code: "NE_ST_NOSTKEX" };
        return values.get(k);
      },
      setData: write,
    },
  });
  const config: Partial<Config> = {
    hk4eNativeFullscreen: false,
    retina: false,
  };
  const captured = Reflect.get(await import("@hope-ui/solid"), "captured") as {
    checked: boolean;
    onChange: () => void;
  }[];
  const disposers: (() => void)[] = [];
  try {
    for (const expected of [false, true, false]) {
      const [UI] = await createGameModeConfig({
        config,
        locale: await createLocale(),
      });
      createRoot(dispose => {
        disposers.push(dispose);
        UI();
      });
      const checkbox = captured[captured.length - 1];
      expect(checkbox.checked).toBe(expected);
      expect(config.hk4eGameMode).toBe(expected);
      write.mockClear();
      checkbox.onChange();
      await Promise.resolve();
      expect(write).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledWith(
        "config_hk4e_game_mode",
        String(!expected)
      );
      expect(config.hk4eNativeFullscreen).toBe(false);
      expect(config.retina).toBe(false);
    }
  } finally {
    disposers.forEach(dispose => dispose());
    vi.unstubAllGlobals();
  }
});
