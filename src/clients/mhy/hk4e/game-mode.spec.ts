import { expect, it, vi } from "vitest";
import { admitGameMode } from "./game-mode";
import type { Wine } from "../../../wine";

vi.mock("../../../utils", () => ({ log: vi.fn(), exec: vi.fn() }));
const wine = {
  distributionId: "11.0-dxmt-signed-with-patches",
  attributes: { renderBackend: "dxmt" },
} as Wine;
it.each([false, true])(
  "Game Mode off never inspects the host (fullscreen=%s)",
  async fullscreen => {
    const host = vi.fn();
    expect(
      await admitGameMode(
        { hk4eGameMode: false, hk4eNativeFullscreen: fullscreen },
        wine,
        host
      )
    ).toBe(false);
    expect(host).not.toHaveBeenCalled();
  }
);
it("retains the saved preference without routing or enabling fullscreen", async () => {
  const config = { hk4eGameMode: true, hk4eNativeFullscreen: false };
  const host = vi.fn();
  expect(await admitGameMode(config, wine, host)).toBe(false);
  expect(config).toEqual({ hk4eGameMode: true, hk4eNativeFullscreen: false });
  expect(host).not.toHaveBeenCalled();
});
it("admits only a capable host/runtime without claiming observed activation", async () => {
  const config = { hk4eGameMode: true, hk4eNativeFullscreen: true };
  expect(await admitGameMode(config, wine, async () => true)).toBe(true);
  await expect(admitGameMode(config, wine, async () => false)).rejects.toThrow(
    "preference is saved"
  );
  await expect(
    admitGameMode(
      config,
      { ...wine, distributionId: "other" },
      async () => true
    )
  ).rejects.toThrow("no runtime was switched");
  await expect(
    admitGameMode(config, { ...wine, attributes: {} }, async () => true)
  ).rejects.toThrow("no runtime was switched");
});
