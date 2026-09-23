import { beforeEach, expect, it, vi } from "vitest";
import { readFile } from "@utils";
import { getGameVersion } from "../unity";
import { getInstalledGameVersion } from "./installed-version";
vi.mock("@utils", () => ({ readFile: vi.fn() }));
vi.mock("../unity", () => ({ getGameVersion: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
});
it("keeps a partially updated install eligible for update", async () => {
  vi.mocked(readFile).mockResolvedValue("[General]\r\ngame_version=7.0.0\r\n");
  vi.mocked(getGameVersion).mockResolvedValue("7.1.0");
  expect(await getInstalledGameVersion("/game", "GenshinImpact_Data")).toBe(
    "7.0.0"
  );
});
it("does not trust config ahead of the actual files", async () => {
  vi.mocked(readFile).mockResolvedValue("game_version=7.1.0");
  vi.mocked(getGameVersion).mockResolvedValue("7.0.0");
  expect(await getInstalledGameVersion("/game", "GenshinImpact_Data")).toBe(
    "7.0.0"
  );
});
it("can resume an installation missing the version anchor", async () => {
  vi.mocked(readFile).mockResolvedValue("game_version=7.0.0");
  vi.mocked(getGameVersion).mockRejectedValue(Error("missing"));
  expect(await getInstalledGameVersion("/game", "GenshinImpact_Data")).toBe(
    "7.0.0"
  );
});
it("falls back to the older Unity layout", async () => {
  vi.mocked(readFile).mockRejectedValue(Error("missing"));
  vi.mocked(getGameVersion)
    .mockRejectedValueOnce(Error("layout"))
    .mockResolvedValue("7.0.0");
  expect(await getInstalledGameVersion("/game", "GenshinImpact_Data")).toBe(
    "7.0.0"
  );
});
