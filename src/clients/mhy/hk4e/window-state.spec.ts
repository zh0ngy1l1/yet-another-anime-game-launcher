import { expect, it } from "vitest";
import type { Config } from "../../../config";
import {
  chooseWindowSize,
  parseWindowMemory,
  resolutionChoice,
  validWindowSize,
  validateHk4eExecutable,
} from "./window-state";
const config = {
  resolutionCustom: true,
  resolutionWidth: "1280",
  resolutionHeight: "720",
  retina: false,
} as Config;
it("a later in-game size wins over unchanged custom defaults; a new edit wins over memory", () => {
  const memory = {
    schema: 1 as const,
    width: 1152,
    height: 648,
    retina: false,
    choice: resolutionChoice(config),
  };
  expect(chooseWindowSize(config, memory)).toEqual({
    width: 1152,
    height: 648,
    remembered: true,
  });
  expect(
    chooseWindowSize({ ...config, hk4eResolutionRevision: "new-edit" }, memory)
  ).toEqual({ width: 1280, height: 720, remembered: false });
  expect(
    chooseWindowSize({ ...config, resolutionWidth: "1024" }, memory)?.width
  ).toBe(1024);
});
it("does not invent default resolution when custom resolution is disabled", () => {
  expect(
    chooseWindowSize({ ...config, resolutionCustom: false })
  ).toBeUndefined();
});
it.each([
  "",
  "{",
  '{"schema":1,"width":0,"height":720}',
  '{"schema":1,"width":999999,"height":720}',
  '{"schema":1,"width":1280,"height":720}',
])("rejects missing/corrupt memory %s", raw => {
  expect(parseWindowMemory(raw)).toBeUndefined();
});
it("preserves logical size if the user's Retina choice changes", () => {
  const memory = {
    schema: 1 as const,
    width: 1280,
    height: 720,
    retina: false,
    choice: resolutionChoice(config),
  };
  expect(chooseWindowSize({ ...config, retina: true }, memory)).toEqual({
    width: 2560,
    height: 1440,
    remembered: true,
  });
});
it.each([0, -1, 1.5, NaN, Infinity, 16385])(
  "rejects invalid dimensions %s",
  width => {
    expect(validWindowSize({ width, height: 720 })).toBe(false);
  }
);
it("binds server identity to the actual executable", () => {
  validateHk4eExecutable("hk4e_global", "GenshinImpact.exe");
  validateHk4eExecutable("hk4e_cn", "YuanShen.exe");
  expect(() =>
    validateHk4eExecutable("hk4e_cn", "GenshinImpact.exe")
  ).toThrow();
  expect(() => validateHk4eExecutable("hk4e_global", "steam.exe")).toThrow();
});
