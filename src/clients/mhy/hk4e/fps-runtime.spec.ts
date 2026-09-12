import { describe, expect, it, vi } from "vitest";
import { parseFpsTarget } from "./config/fps-target";
import { validateFpsUnlockDraft } from "./config/fps-unlock-state";
import {
  buildFpsRuntimePlan,
  withDxmtPreferredMaxFrameRate,
} from "./fps-runtime";

// These modules must not enter the pure contract's runtime dependency graph.
vi.mock("../../../wine/distro", () => {
  throw new Error("Runtime Wine dependency");
});
vi.mock("../../../utils/neu", () => {
  throw new Error("Runtime native dependency");
});
vi.mock("./fps-unlocker", () => {
  throw new Error("Runtime artifact acquisition dependency");
});
vi.mock("./program-launch-game", () => {
  throw new Error("Runtime launcher dependency");
});

function validated(enabled: boolean, target: number) {
  const result = validateFpsUnlockDraft(
    Object.freeze({ enabled, target: String(target) })
  );
  if (!result.ok) throw new Error("Invalid test configuration");
  return Object.freeze(result.value);
}

function fps(target: number) {
  const result = parseFpsTarget(target);
  if (!result.ok) throw new Error("Invalid test target");
  return result.value;
}

const dxmt = Object.freeze({ renderBackend: "dxmt" } as const);
const unsupported = Object.freeze({});
const targets = Array.from({ length: 360 }, (_, index) => index + 1);
const upstream =
  "dxgi.customVendorId=1002; d3d11.preferredMaxFrameRate = 47 ;dxgi.customDeviceId=7340;";

describe("HK4E FPS runtime contract", () => {
  it.each(targets)("plans supported DXMT target %i", target => {
    const config = validated(true, target);
    const result = buildFpsRuntimePlan(config, dxmt, upstream);
    expect(result).toStrictEqual({
      ok: true,
      value: {
        gameDxmtConfig: `dxgi.customVendorId=1002;d3d11.preferredMaxFrameRate=${
          target <= 60 ? target : 0
        };dxgi.customDeviceId=7340;`,
        companion: {
          dxmtConfig: `dxgi.customVendorId=1002;d3d11.preferredMaxFrameRate=${target};dxgi.customDeviceId=7340;`,
          fpsArgument: target,
        },
      },
    });
    expect(config).toStrictEqual({ enabled: true, target });
    expect(dxmt).toStrictEqual({ renderBackend: "dxmt" });
    expect(buildFpsRuntimePlan(config, dxmt, upstream)).toStrictEqual(result);
  });

  it.each(targets)(
    "preserves disabled draft target %i with either backend",
    target => {
      // Step 3 deliberately drops the draft target from a disabled domain value.
      const config = validated(false, target);
      for (const current of [
        undefined,
        "",
        "d3d11.preferredMaxFrameRate=60;",
        upstream,
        "d3d11.preferredMaxFrameRate=37;d3d11.preferredMaxFrameRate=48;",
      ]) {
        const expected = {
          ok: true,
          value: { gameDxmtConfig: current, companion: undefined },
        };
        expect(buildFpsRuntimePlan(config, dxmt, current)).toStrictEqual(
          expected
        );
        expect(buildFpsRuntimePlan(config, unsupported, current)).toStrictEqual(
          expected
        );
      }
      expect(config).toStrictEqual({ enabled: false });
      expect(dxmt).toStrictEqual({ renderBackend: "dxmt" });
      expect(unsupported).toStrictEqual({});
    }
  );

  it.each(targets)("fails closed for enabled non-DXMT target %i", target => {
    const config = validated(true, target);
    const result = buildFpsRuntimePlan(config, unsupported, upstream);
    expect(result).toStrictEqual({ ok: false, error: "dxmt-unsupported" });
    expect(result).not.toHaveProperty("value");
    expect(result).not.toHaveProperty("companion");
    expect(config).toStrictEqual({ enabled: true, target });
    expect(unsupported).toStrictEqual({});
    expect(buildFpsRuntimePlan(config, unsupported, upstream)).toStrictEqual(
      result
    );
  });

  it.each([
    ["lower boundary 1", 1, 1],
    ["threshold 60", 60, 60],
    ["threshold 61", 61, 0],
    ["ordinary target 150", 150, 0],
    ["upper boundary 360", 360, 0],
  ] as const)("handles %s", (_, target, game) => {
    expect(buildFpsRuntimePlan(validated(true, target), dxmt)).toStrictEqual({
      ok: true,
      value: {
        gameDxmtConfig: `d3d11.preferredMaxFrameRate=${game};`,
        companion: {
          dxmtConfig: `d3d11.preferredMaxFrameRate=${target};`,
          fpsArgument: target,
        },
      },
    });
  });
});

describe("DXMT exact-key update", () => {
  it.each([
    ["missing", undefined, "d3d11.preferredMaxFrameRate=144;"],
    ["empty", "", "d3d11.preferredMaxFrameRate=144;"],
    ["whitespace only", " \t\r", "d3d11.preferredMaxFrameRate=144;"],
    ["empty entries", ";; \t;", "d3d11.preferredMaxFrameRate=144;"],
    [
      "one exact key",
      "d3d11.preferredMaxFrameRate=60;",
      "d3d11.preferredMaxFrameRate=144;",
    ],
    [
      "beginning",
      "d3d11.preferredMaxFrameRate=60;a=1;b=2",
      "d3d11.preferredMaxFrameRate=144;a=1;b=2;",
    ],
    [
      "middle",
      "a=1;d3d11.preferredMaxFrameRate=60;b=2;",
      "a=1;d3d11.preferredMaxFrameRate=144;b=2;",
    ],
    [
      "end",
      "a=1;b=2;d3d11.preferredMaxFrameRate=60",
      "a=1;b=2;d3d11.preferredMaxFrameRate=144;",
    ],
    ["absent", " a = 1 ;b=2;", " a = 1 ;b=2;d3d11.preferredMaxFrameRate=144;"],
    [
      "adjacent duplicates",
      "d3d11.preferredMaxFrameRate=60;d3d11.preferredMaxFrameRate=90;",
      "d3d11.preferredMaxFrameRate=144;",
    ],
    [
      "separated duplicates",
      "a=1;d3d11.preferredMaxFrameRate=60;b=2; d3d11.preferredMaxFrameRate = 90 ;c=3;d3d11.preferredMaxFrameRate=120;",
      "a=1;d3d11.preferredMaxFrameRate=144;b=2;c=3;",
    ],
    [
      "permitted whitespace",
      "\t\r d3d11.preferredMaxFrameRate \t\r=\r\t 60 \t\r; a = 2 ;",
      "d3d11.preferredMaxFrameRate=144; a = 2 ;",
    ],
    [
      "similarly named keys",
      "d3d11.preferredMaxFrameRateExtra=7;prefix.d3d11.preferredMaxFrameRate=8;d3d11.preferredMaxFrameRate.backup=9;",
      "d3d11.preferredMaxFrameRateExtra=7;prefix.d3d11.preferredMaxFrameRate=8;d3d11.preferredMaxFrameRate.backup=9;d3d11.preferredMaxFrameRate=144;",
    ],
    [
      "key-like value text",
      'dxgi.customDeviceDesc="d3d11.preferredMaxFrameRate=60 GPU";a=d3d11.preferredMaxFrameRate=90;',
      'dxgi.customDeviceDesc="d3d11.preferredMaxFrameRate=60 GPU";a=d3d11.preferredMaxFrameRate=90;d3d11.preferredMaxFrameRate=144;',
    ],
    [
      "unrelated duplicate ordering",
      "a=1;a=2;d3d11.preferredMaxFrameRate=60;a=3;",
      "a=1;a=2;d3d11.preferredMaxFrameRate=144;a=3;",
    ],
    // DXMT's parser skips only space/tab/CR: do not broaden it to JS \s/trim.
    [
      "newline is not key whitespace",
      "\nd3d11.preferredMaxFrameRate=60;",
      "\nd3d11.preferredMaxFrameRate=60;d3d11.preferredMaxFrameRate=144;",
    ],
    [
      "nonbreaking space is not key whitespace",
      "\u00a0d3d11.preferredMaxFrameRate=60;",
      "\u00a0d3d11.preferredMaxFrameRate=60;d3d11.preferredMaxFrameRate=144;",
    ],
  ] as const)("handles %s deterministically", (_, input, expected) => {
    const result = withDxmtPreferredMaxFrameRate(input, fps(144));
    expect(result).toBe(expected);
    expect(withDxmtPreferredMaxFrameRate(result, fps(144))).toBe(expected);
    expect(withDxmtPreferredMaxFrameRate(input, fps(144))).toBe(expected);
  });

  it.each([0, ...targets])(
    "updates to %i without retaining an older duplicate",
    target => {
      const value = target === 0 ? 0 : fps(target);
      const input =
        "a=1; d3d11.preferredMaxFrameRate = 47 ;b=2;d3d11.preferredMaxFrameRate=95;";
      const result = withDxmtPreferredMaxFrameRate(input, value);
      expect(result).toBe(`a=1;d3d11.preferredMaxFrameRate=${target};b=2;`);
      expect(withDxmtPreferredMaxFrameRate(result, value)).toBe(result);
      expect(withDxmtPreferredMaxFrameRate(result, fps(23))).toBe(
        "a=1;d3d11.preferredMaxFrameRate=23;b=2;"
      );
    }
  );
});

describe("FPS contract purity and immutability", () => {
  it("returns fresh frozen records and shares only immutable primitive values", () => {
    const config = validated(true, 60);
    const result = buildFpsRuntimePlan(config, dxmt, upstream);
    const repeated = buildFpsRuntimePlan(config, dxmt, upstream);
    if (!result.ok || !repeated.ok || !result.value.companion) {
      throw new Error("Expected supported companion plan");
    }
    expect(result).not.toBe(repeated);
    expect(result.value).not.toBe(repeated.value);
    expect(result.value.companion).not.toBe(repeated.value.companion);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.companion)).toBe(true);
    expect(typeof result.value.gameDxmtConfig).toBe("string");
    expect(typeof result.value.companion.dxmtConfig).toBe("string");
    expect(typeof result.value.companion.fpsArgument).toBe("number");
    expect(Reflect.set(result.value.companion, "dxmtConfig", "changed")).toBe(
      false
    );
    expect(Reflect.set(result.value, "gameDxmtConfig", "changed")).toBe(false);
    expect(result).toStrictEqual(repeated);
    const disabled = buildFpsRuntimePlan(validated(false, 60), dxmt, upstream);
    if (!disabled.ok) throw new Error("Expected disabled success");
    expect(Object.isFrozen(disabled)).toBe(true);
    expect(Object.isFrozen(disabled.value)).toBe(true);
    expect(
      Object.isFrozen(buildFpsRuntimePlan(config, unsupported, upstream))
    ).toBe(true);
  });

  it("does not retain caller state or contaminate interleaved calls", () => {
    const config = { enabled: true, target: fps(61) } as const;
    const attributes = { renderBackend: "dxmt" } as const;
    const first = buildFpsRuntimePlan(config, attributes, upstream);
    const saved = JSON.parse(JSON.stringify(first));
    buildFpsRuntimePlan(validated(true, 23), dxmt, "other=2;");
    buildFpsRuntimePlan(validated(false, 360), unsupported, "other=3;");
    buildFpsRuntimePlan(validated(true, 120), unsupported, "other=4;");
    withDxmtPreferredMaxFrameRate("other=5;", 0);
    expect(first).toStrictEqual(saved);
    expect(buildFpsRuntimePlan(config, attributes, upstream)).toStrictEqual(
      first
    );
    // Even a JS caller mutating its original objects cannot change a plan.
    Reflect.set(config, "target", fps(1));
    Reflect.deleteProperty(attributes, "renderBackend");
    expect(first).toStrictEqual(saved);
  });

  it("does not read or write ambient environment, platform or native state", () => {
    const enabled = validated(true, 61);
    const disabled = validated(false, 61);
    const expected = buildFpsRuntimePlan(enabled, dxmt, upstream);
    const descriptor = Object.getOwnPropertyDescriptor(process, "env");
    if (!descriptor) throw new Error("Missing test environment descriptor");
    const forbidden = () => {
      throw new Error("Ambient access in pure runtime contract");
    };
    const native = new Proxy({}, { get: forbidden, set: forbidden });
    vi.stubGlobal("window", native);
    vi.stubGlobal("Neutralino", native);
    let results;
    try {
      Object.defineProperty(process, "env", {
        configurable: true,
        get: forbidden,
        set: forbidden,
      });
      // Restore before assertions so the test runner can use its own environment.
      results = [
        buildFpsRuntimePlan(enabled, dxmt, upstream),
        buildFpsRuntimePlan(disabled, unsupported, upstream),
        buildFpsRuntimePlan(enabled, unsupported, upstream),
        withDxmtPreferredMaxFrameRate(undefined, 0),
      ];
    } finally {
      Object.defineProperty(process, "env", descriptor);
      vi.unstubAllGlobals();
    }
    expect(results).toStrictEqual([
      expected,
      { ok: true, value: { gameDxmtConfig: upstream, companion: undefined } },
      { ok: false, error: "dxmt-unsupported" },
      "d3d11.preferredMaxFrameRate=0;",
    ]);
  });
});
