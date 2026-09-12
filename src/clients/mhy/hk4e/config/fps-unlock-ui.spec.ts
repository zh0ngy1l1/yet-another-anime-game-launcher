import { readFileSync } from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, ParentProps } from "solid-js";
import { createLocale } from "@locale";
import type { Config } from "@config/config-def";
import { createFpsUnlockConfig } from "./fps-unlock";

type InputProps = {
  type: string;
  inputMode: string;
  value: string;
  onInput: (event: { currentTarget: { value: string } }) => Promise<void>;
};
type CheckboxProps = { checked: boolean; onChange: () => Promise<void> };
type ControlProps = { id: string; invalid?: boolean };
type CapturedControls = {
  inputs: InputProps[];
  checkboxes: CheckboxProps[];
  forms: ControlProps[];
};

vi.mock("solid-js", () =>
  vi.importActual<typeof import("solid-js")>("solid-js/dist/dev.js")
);

// Replace only DOM-dependent presentation primitives. The actual HK4E factory,
// UI bindings, browser signals and Neutralino storage helpers all execute.
vi.mock("@hope-ui/solid", () => {
  const captured: CapturedControls = { inputs: [], checkboxes: [], forms: [] };
  const children = (props: ParentProps) => props.children;
  return {
    captured,
    Box: children,
    VStack: children,
    Text: children,
    FormLabel: children,
    FormErrorMessage: children,
    FormControl: (props: ParentProps<ControlProps>) => {
      captured.forms.push(props);
      return props.children;
    },
    Input: (props: InputProps) => {
      captured.inputs.push(props);
      return null;
    },
    Checkbox: (props: CheckboxProps) => {
      captured.checkboxes.push(props);
      return null;
    },
  };
});

const disposers: (() => void)[] = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose();
  const captured: CapturedControls = Reflect.get(
    await import("@hope-ui/solid"),
    "captured"
  );
  captured.inputs.length = 0;
  captured.checkboxes.length = 0;
  captured.forms.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openSettings(values: Record<string, string>) {
  const data = new Map(Object.entries({ config_uiLocale: "en", ...values }));
  const setData = vi.fn(async (key: string, value: string) => {
    data.set(key, value);
  });
  vi.stubGlobal("Neutralino", {
    storage: {
      getData: vi.fn(async (key: string) => {
        const value = data.get(key);
        if (value === undefined) throw { code: "NE_ST_NOSTKEX" };
        return value;
      }),
      setData,
    },
  });
  const config: Partial<Config> = {};
  const [UI] = await createFpsUnlockConfig({
    locale: await createLocale(),
    config,
  });
  const open = () => {
    const dispose = createRoot(dispose => {
      UI();
      return dispose;
    });
    disposers.push(dispose);
    return dispose;
  };
  const captured: CapturedControls = Reflect.get(
    await import("@hope-ui/solid"),
    "captured"
  );
  return { open, captured, config, setData };
}

describe("HK4E settings UI bindings", () => {
  it.each([
    [{}, false, "120"],
    [
      {
        config_hk4e_fps_unlock_enabled: "true",
        config_hk4e_fps_unlock_target: "120.0",
      },
      true,
      "120.0",
    ],
    [
      { hoyoplay_genshin_fps_enabled: "true", hoyoplay_genshin_fps: " 144" },
      true,
      " 144",
    ],
    [{ config_fps_unlock: "144" }, true, "144"],
  ] as const)(
    "opens and closes unchanged settings without any write: %j",
    async (values, enabled, target) => {
      const { open, captured, setData } = await openSettings(values);
      expect(setData).not.toHaveBeenCalled();
      for (let visit = 0; visit < 2; visit++) {
        const close = open();
        expect(captured.inputs[visit].value).toBe(target);
        expect(captured.checkboxes[visit].checked).toBe(enabled);
        close();
      }
      expect(setData).not.toHaveBeenCalled();
    }
  );

  it("preserves raw edits, displays invalidity, and commits only valid explicit changes", async () => {
    const { open, captured, config, setData } = await openSettings({});
    open();
    const input = captured.inputs[0];
    const checkbox = captured.checkboxes[0];
    const targetControl = captured.forms.find(
      control => control.id === "hk4eFpsUnlockTarget"
    );
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("numeric");
    await checkbox.onChange();
    expect(config.hk4eFpsUnlock).toEqual({
      ok: true,
      value: { enabled: true, target: 120 },
    });
    expect(setData).toHaveBeenCalledTimes(2);
    setData.mockClear();
    await input.onInput({ currentTarget: { value: " 144" } });
    expect(input.value).toBe(" 144");
    expect(targetControl?.invalid).toBe(true);
    expect(config.hk4eFpsUnlock).toEqual({ ok: false, error: "target" });
    expect(setData).not.toHaveBeenCalled();
    await checkbox.onChange();
    expect(targetControl?.invalid).toBe(false);
    expect(input.value).toBe(" 144");
    expect(config.hk4eFpsUnlock).toEqual({
      ok: true,
      value: { enabled: false },
    });
    expect(setData.mock.calls).toEqual([
      ["config_hk4e_fps_unlock_enabled", "false"],
      ["config_hk4e_fps_unlock_target", " 144"],
    ]);
  });
});

describe("FPS configuration composition", () => {
  // Client construction performs native/network setup; check the source wiring
  // here and type-check the full modules rather than running game bootstrap.
  it("composes the control through the HK4E configuration hook", () => {
    const source = readFileSync("src/clients/mhy/hk4e/index.tsx", "utf8");
    expect(source).toContain(
      'import { createFpsUnlockConfig } from "./config/fps-unlock"'
    );
    expect(source).toMatch(
      /async createConfig\([^]*const \[FPS\] = await createFpsUnlockConfig\(\{ locale, config \}\)/
    );
    expect(source).toContain("<FPS />");
  });

  it.each([
    "src/config/index.tsx",
    "src/clients/mhy/hkrpg/index.tsx",
    "src/clients/mhy/nap/index.tsx",
    "src/clients/mhy/bh3/index.tsx",
    "src/clients/seasun/cbjq/index.tsx",
  ])("keeps FPS controls out of %s", path => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(
      /fps-unlock|createFPSUnlock|createFpsUnlockConfig|<FO\s*\/>/
    );
  });
});
