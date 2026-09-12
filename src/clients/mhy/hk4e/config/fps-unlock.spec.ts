import { afterEach, describe, expect, it, vi } from "vitest";
import { createEffect, createRoot } from "solid-js";
import type { Config } from "@config/config-def";
import {
  createFpsUnlockSettings,
  readFpsUnlockDraft,
  saveFpsUnlockDraft,
} from "./fps-unlock-settings";
import {
  resolveFpsUnlockDraft,
  validateFpsUnlockDraft,
} from "./fps-unlock-state";

// Node normally resolves Solid's server build, whose effects are no-ops.
// Exercise real browser reactivity without introducing a DOM test stack.
vi.mock("solid-js", () =>
  vi.importActual<typeof import("solid-js")>("solid-js/dist/dev.js")
);

const enabledKey = "config_hk4e_fps_unlock_enabled";
const targetKey = "config_hk4e_fps_unlock_target";
const legacyEnabledKey = "hoyoplay_genshin_fps_enabled";
const legacyTargetKey = "hoyoplay_genshin_fps";
const upstreamKey = "config_fps_unlock";

function storage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const getData = vi.fn(async (key: string) => {
    const value = data.get(key);
    if (value === undefined) throw { code: "NE_ST_NOSTKEX" };
    return value;
  });
  const setData = vi.fn(async (key: string, value: string | null) => {
    if (value === null) data.delete(key);
    else data.set(key, value);
  });
  vi.stubGlobal("Neutralino", { storage: { getData, setData } });
  return { data, getData, setData };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const readCases: [
  string,
  Record<string, string>,
  { enabled: boolean; target: string }
][] = [
  ["fresh installation", {}, { enabled: false, target: "120" }],
  [
    "canonical precedence",
    {
      [enabledKey]: "true",
      [targetKey]: "180",
      [legacyEnabledKey]: "false",
      [legacyTargetKey]: "150",
      [upstreamKey]: "144",
    },
    { enabled: true, target: "180" },
  ],
  [
    "invalid canonical precedence",
    {
      [enabledKey]: "true",
      [targetKey]: " 180",
      [legacyTargetKey]: "150",
      [upstreamKey]: "144",
    },
    { enabled: true, target: " 180" },
  ],
  [
    "blank canonical precedence",
    { [enabledKey]: "true", [targetKey]: "", [legacyTargetKey]: "150" },
    { enabled: true, target: "" },
  ],
  [
    "canonical enabled only",
    { [enabledKey]: "true", [legacyTargetKey]: "150", [upstreamKey]: "144" },
    { enabled: true, target: "120" },
  ],
  [
    "canonical target only",
    { [targetKey]: "180", [legacyEnabledKey]: "true", [upstreamKey]: "144" },
    { enabled: false, target: "180" },
  ],
  [
    "legacy precedence",
    {
      [legacyEnabledKey]: "true",
      [legacyTargetKey]: "150",
      [upstreamKey]: "144",
    },
    { enabled: true, target: "150" },
  ],
  [
    "invalid legacy precedence",
    {
      [legacyEnabledKey]: "true",
      [legacyTargetKey]: "120.0",
      [upstreamKey]: "144",
    },
    { enabled: true, target: "120.0" },
  ],
  [
    "legacy enabled only",
    { [legacyEnabledKey]: "true", [upstreamKey]: "144" },
    { enabled: true, target: "120" },
  ],
  [
    "legacy target only",
    { [legacyTargetKey]: "150", [upstreamKey]: "144" },
    { enabled: false, target: "150" },
  ],
  [
    "upstream default",
    { [upstreamKey]: "default" },
    { enabled: false, target: "120" },
  ],
  ["upstream 120", { [upstreamKey]: "120" }, { enabled: true, target: "120" }],
  ["upstream 144", { [upstreamKey]: "144" }, { enabled: true, target: "144" }],
  ...["", "bad", "NaN", "Infinity", "361", " 120", "120.0", "1e2"].map(
    (
      target
    ): [
      string,
      Record<string, string>,
      { enabled: boolean; target: string }
    ] => [
      "corrupt upstream " + JSON.stringify(target),
      { [upstreamKey]: target },
      { enabled: true, target },
    ]
  ),
  [
    "other valid upstream decimal",
    { [upstreamKey]: "160" },
    { enabled: true, target: "160" },
  ],
];

describe("HK4E compatibility reads", () => {
  it.each(readCases)(
    "resolves %s without writing or removing anything",
    async (_, values, expected) => {
      const { data, setData } = storage(values);
      expect(resolveFpsUnlockDraft(values)).toEqual(expected);
      expect(await readFpsUnlockDraft()).toEqual(expected);
      expect(setData).not.toHaveBeenCalled();
      expect(Object.fromEntries(data)).toEqual(values);
    }
  );

  it.each(["false", "", "TRUE", "1", "yes", "null", "undefined"])(
    "never enables a malformed/false boolean %j through truthiness",
    async raw => {
      for (const key of [enabledKey, legacyEnabledKey]) {
        const { setData } = storage({ [key]: raw, [upstreamKey]: "144" });
        const draft = await readFpsUnlockDraft();
        expect(draft).toEqual({ enabled: false, target: "120" });
        expect(validateFpsUnlockDraft(draft)).toEqual({
          ok: true,
          value: { enabled: false },
        });
        expect(setData).not.toHaveBeenCalled();
      }
    }
  );

  it("propagates storage failures instead of falling back to another source", async () => {
    const { getData, setData } = storage({ [upstreamKey]: "144" });
    const failure = new Error("Storage unavailable");
    getData.mockRejectedValueOnce(failure);
    await expect(readFpsUnlockDraft()).rejects.toBe(failure);
    expect(setData).not.toHaveBeenCalled();
  });
});

describe("HK4E initialization and immediate user changes", () => {
  it("runs initialization effects in the no-write test harness", () => {
    const effect = vi.fn();
    const dispose = createRoot(dispose => {
      createEffect(effect);
      return dispose;
    });
    try {
      expect(effect).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });
  it.each(readCases)(
    "initializes, opens and closes %s without FPS writes",
    async (_, values, expected) => {
      const { data, setData } = storage(values);
      const config: Partial<Config> = {};
      const settings = await createFpsUnlockSettings(config);
      // The real controller survives modal openings, just like createConfiguration.
      // Each view reads its signals inside a Solid owner, then disposes that owner.
      for (let open = 0; open < 2; open++) {
        createRoot(dispose => {
          try {
            expect(settings.draft()).toEqual(expected);
            expect(settings.validation()).toEqual(
              validateFpsUnlockDraft(expected)
            );
          } finally {
            dispose();
          }
        });
      }
      await Promise.resolve();
      expect(config.hk4eFpsUnlock).toEqual(validateFpsUnlockDraft(expected));
      expect(setData).not.toHaveBeenCalled();
      expect(Object.fromEntries(data)).toEqual(values);
    }
  );

  it("keeps invalid enabled text visible and reports a Config field error with no domain value", async () => {
    const { setData } = storage({ [enabledKey]: "true", [targetKey]: "120.0" });
    const config: Partial<Config> = {};
    const settings = await createFpsUnlockSettings(config);
    expect(settings.draft()).toEqual({ enabled: true, target: "120.0" });
    expect(config.hk4eFpsUnlock).toEqual({ ok: false, error: "target" });
    await expect(
      settings.change({ enabled: true, target: "361" })
    ).resolves.toEqual({ ok: false, error: "target" });
    expect(settings.draft().target).toBe("361");
    expect(config.hk4eFpsUnlock).not.toHaveProperty("value");
    expect(setData).not.toHaveBeenCalled();
  });

  it("removes the previous valid result when the enabled draft becomes invalid", async () => {
    const { setData } = storage({ [enabledKey]: "true", [targetKey]: "144" });
    const config: Partial<Config> = {};
    const settings = await createFpsUnlockSettings(config);
    expect(config.hk4eFpsUnlock).toEqual({
      ok: true,
      value: { enabled: true, target: 144 },
    });
    await settings.change({ enabled: true, target: "" });
    expect(config.hk4eFpsUnlock).toEqual({ ok: false, error: "target" });
    expect(setData).not.toHaveBeenCalled();
  });

  it("does not migrate when an unchanged control value or unrelated setting is committed", async () => {
    const { setData } = storage({ [upstreamKey]: "144" });
    const config: Partial<Config> = {};
    const settings = await createFpsUnlockSettings(config);
    config.hk4eEnableHDR = true;
    await settings.change(settings.draft());
    expect(setData).not.toHaveBeenCalled();
  });

  it("writes only canonical strings after a valid explicit change and selects them on reread", async () => {
    const old = {
      [legacyEnabledKey]: "false",
      [legacyTargetKey]: "150",
      [upstreamKey]: "144",
    };
    const { data, setData } = storage(old);
    const config: Partial<Config> = {};
    const settings = await createFpsUnlockSettings(config);
    await settings.change({ enabled: true, target: "00180" });
    expect(config.hk4eFpsUnlock).toEqual({
      ok: true,
      value: { enabled: true, target: 180 },
    });
    expect(setData.mock.calls).toEqual([
      [enabledKey, "true"],
      [targetKey, "00180"],
    ]);
    expect(Object.fromEntries(data)).toEqual({
      ...old,
      [enabledKey]: "true",
      [targetKey]: "00180",
    });
    expect(await readFpsUnlockDraft()).toEqual({
      enabled: true,
      target: "00180",
    });
    expect(setData).toHaveBeenCalledTimes(2);
  });

  it.each(["", "bad", " 120", "120.0"])(
    "explicitly disables while preserving invalid text %j",
    async target => {
      const { data, setData } = storage({
        [legacyEnabledKey]: "true",
        [legacyTargetKey]: target,
      });
      const config: Partial<Config> = {};
      const settings = await createFpsUnlockSettings(config);
      await settings.change({ enabled: false, target });
      expect(config.hk4eFpsUnlock).toEqual({
        ok: true,
        value: { enabled: false },
      });
      expect(settings.draft()).toEqual({ enabled: false, target });
      expect(setData.mock.calls).toEqual([
        [enabledKey, "false"],
        [targetKey, target],
      ]);
      expect(data.get(legacyTargetKey)).toBe(target);
    }
  );

  it("validates before the first write even when calling persistence directly", async () => {
    const { setData } = storage();
    expect(await saveFpsUnlockDraft({ enabled: true, target: "361" })).toEqual({
      ok: false,
      error: "target",
    });
    expect(setData).not.toHaveBeenCalled();
  });

  it("serializes consecutive valid changes so their canonical pairs cannot interleave", async () => {
    const { setData } = storage();
    const settings = await createFpsUnlockSettings({});
    await Promise.all([
      settings.change({ enabled: true, target: "144" }),
      settings.change({ enabled: false, target: "bad" }),
    ]);
    expect(setData.mock.calls).toEqual([
      [enabledKey, "true"],
      [targetKey, "144"],
      [enabledKey, "false"],
      [targetKey, "bad"],
    ]);
    expect(await readFpsUnlockDraft()).toEqual({
      enabled: false,
      target: "bad",
    });
  });

  it("snapshots the validated input before awaiting either storage write", async () => {
    const { data, setData } = storage();
    const draft = { enabled: true, target: "144" };
    const saving = saveFpsUnlockDraft(draft);
    draft.target = "invalid";
    draft.enabled = false;
    await saving;
    expect(setData.mock.calls).toEqual([
      [enabledKey, "true"],
      [targetKey, "144"],
    ]);
    expect(data.get(targetKey)).toBe("144");
  });

  it("surfaces storage failures, retains the draft, and allows an explicit retry", async () => {
    const { setData } = storage();
    const failure = new Error("Storage unavailable");
    setData.mockRejectedValueOnce(failure);
    const settings = await createFpsUnlockSettings({});
    const draft = { enabled: true, target: "144" };
    await expect(settings.change(draft)).rejects.toBe(failure);
    expect(settings.saveFailed()).toBe(true);
    expect(settings.draft()).toEqual(draft);
    await settings.change(draft);
    expect(settings.saveFailed()).toBe(false);
    expect(await readFpsUnlockDraft()).toEqual(draft);
  });
});
