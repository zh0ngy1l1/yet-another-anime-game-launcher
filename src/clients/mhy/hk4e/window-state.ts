import type { Config } from "../../../config";

export type WindowSize = { width: number; height: number };
export type WindowMemory = WindowSize & {
  schema: 1;
  choice: string;
  retina: boolean;
};

export function validWindowSize(value: unknown): value is WindowSize {
  if (!value || typeof value !== "object") return false;
  const width = Reflect.get(value, "width"),
    height = Reflect.get(value, "height");
  return (
    Number.isInteger(width) &&
    width >= 320 &&
    width <= 16384 &&
    Number.isInteger(height) &&
    height >= 200 &&
    height <= 16384
  );
}
export function resolutionChoice(config: Config) {
  return JSON.stringify([
    config.resolutionCustom === true,
    config.resolutionWidth,
    config.resolutionHeight,
    config.hk4eResolutionRevision ?? "",
  ]);
}
export function parseWindowMemory(raw: string): WindowMemory | undefined {
  try {
    const value = JSON.parse(raw);
    if (
      validWindowSize(value) &&
      Reflect.get(value, "schema") === 1 &&
      typeof Reflect.get(value, "choice") === "string" &&
      typeof Reflect.get(value, "retina") === "boolean"
    )
      return value as WindowMemory;
  } catch {
    /* Retain malformed/missing state; never infer new geometry. */
  }
}
export function chooseWindowSize(config: Config, memory?: WindowMemory) {
  const explicit = {
    width: Number(config.resolutionWidth),
    height: Number(config.resolutionHeight),
  };
  if (
    memory &&
    (!config.resolutionCustom || memory.choice === resolutionChoice(config))
  ) {
    const scale = (config.retina ? 2 : 1) / (memory.retina ? 2 : 1);
    const size = { width: memory.width * scale, height: memory.height * scale };
    if (validWindowSize(size)) return { ...size, remembered: true };
  }
  if (config.resolutionCustom && validWindowSize(explicit))
    return { ...explicit, remembered: false };
}
export function validateHk4eExecutable(server: string, executable: string) {
  if (
    !(
      (server === "hk4e_global" && executable === "GenshinImpact.exe") ||
      (server === "hk4e_cn" && executable === "YuanShen.exe")
    )
  )
    throw new Error(
      "Window controls require the selected server's exact HK4E executable"
    );
}
