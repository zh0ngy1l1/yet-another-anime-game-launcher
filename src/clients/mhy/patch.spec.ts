import { expect, it, vi } from "vitest";
import { patchRevertProgram } from "./patch";
import { getKey, setKey } from "@utils";
import { deferred } from "../../utils/operation";
import type { Wine } from "@wine";
import type { Server } from "@constants";
import type { Config } from "@config";

vi.mock("@utils", () => ({ getKey: vi.fn(), setKey: vi.fn() }));
vi.mock("./unity", () => ({}));
vi.mock("src/downloadable-resource", () => ({
  DXMT_FILES: [],
}));
const wine = {
  prefix: "/isolated-fixture",
  attributes: { renderBackend: "dxvk" },
} as unknown as Wine;
const config = { patchOff: true, reshade: false } as Config;
const server = {} as Server;

it("awaits the final patch-state restoration acknowledgement before completing", async () => {
  vi.mocked(getKey).mockResolvedValue("patched");
  const acknowledgement = deferred<void>();
  vi.mocked(setKey).mockReturnValue(acknowledgement.promise);
  let finished = false;
  const restoring = patchRevertProgram(
    "/isolated-fixture/game",
    wine,
    server,
    config
  )
    .next()
    .then(value => {
      finished = true;
      return value;
    });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(setKey).toHaveBeenCalledWith("patched", null);
  expect(finished).toBe(false);
  acknowledgement.resolve();
  expect((await restoring).done).toBe(true);
});

it("preserves a failed final restoration acknowledgement as a failed generator", async () => {
  vi.mocked(getKey).mockResolvedValue("patched");
  vi.mocked(setKey).mockRejectedValue(Error("storage restoration failed"));
  await expect(
    patchRevertProgram("/isolated-fixture/game", wine, server, config).next()
  ).rejects.toThrow("storage restoration failed");
});
