import { describe, expect, it } from "vitest";
import { parseFpsTarget } from "./fps-target";

describe("HK4E FPS target grammar", () => {
  it("accepts every integer from 1 through 360", () => {
    for (let target = 1; target <= 360; target++) {
      expect(parseFpsTarget(String(target))).toEqual({
        ok: true,
        value: target,
      });
      expect(parseFpsTarget(target)).toEqual({ ok: true, value: target });
    }
  });

  it.each(["01", "00120", "000360"])(
    "accepts decimal leading zeros: %j",
    raw => {
      expect(parseFpsTarget(raw)).toEqual({ ok: true, value: Number(raw) });
    }
  );

  it.each([
    "0",
    "000",
    "-1",
    "361",
    "9999999999999999999999999999999999999",
    "",
    " ",
    "\t",
    "\n",
    " 120",
    "120 ",
    "120\n",
    "120\r\n",
    "12 0",
    "1.5",
    "120.0",
    ".120",
    "120.",
    "NaN",
    "Infinity",
    "-Infinity",
    "1e2",
    "1E2",
    "0x78",
    "0o170",
    "0b1111000",
    "+120",
    "-0",
    "1_20",
    "invalid",
    "１２０",
    "١٢٠",
    0,
    -1,
    361,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    true,
    false,
    {},
    [],
  ])("rejects %j without a target value", raw => {
    const result = parseFpsTarget(raw);
    expect(result).toEqual({ ok: false, error: "target" });
    expect(result).not.toHaveProperty("value");
  });
});
