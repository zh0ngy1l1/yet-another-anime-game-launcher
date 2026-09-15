import { beforeEach, expect, it, vi } from "vitest";
import { createWine } from "../../../wine/wine";
import { exec } from "../../../utils";
import { disposeR2Wine, prepareR2Wine } from "./prepare-r2";
import type { Wine } from "../../../wine/wine";

vi.mock("../../../utils", () => ({
  exec: vi.fn(),
  log: vi.fn(async () => undefined),
  resolve: (path: string) => path.replace("./", "/profile/"),
}));
vi.mock("../../../wine/wine", () => ({ createWine: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
});
const context = {
  loader: "/selected/wine/bin/wine",
  prefix: "/selected/prefix",
  environment: { WINEDEBUG: "-all", CUSTOM: "retained" },
};
function input() {
  return {
    executionContext: context,
    waitUntilServerOff: vi.fn(async () => undefined),
    distributionId: "11.0-dxmt-signed-with-patches",
    attributes: { renderBackend: "dxmt", winePath: "wine" },
  } as unknown as Wine;
}
it("waits before preparation and preserves selected prefix/backend/environment", async () => {
  const wine = input();
  vi.mocked(exec).mockImplementation(async () => {
    expect(wine.waitUntilServerOff).toHaveBeenCalledOnce();
    return { stdOut: "/profile/fps-runtime/r2-0123456789/wine\n" } as never;
  });
  const prepared = {
    executionContext: { ...context, loader: "/new/bin/wine" },
  };
  vi.mocked(createWine).mockResolvedValue(prepared as unknown as Wine);
  expect(await prepareR2Wine(wine)).toBe(prepared);
  expect(vi.mocked(exec).mock.calls[0][0].slice(-3, -1)).toEqual([
    "/selected/wine",
    "/profile/fps-runtime",
  ]);
  expect(createWine).toHaveBeenCalledWith({
    prefix: context.prefix,
    distro: {
      id: wine.distributionId,
      displayName: wine.distributionId,
      remoteUrl: "",
      attributes: wine.attributes,
    },
    runtimeRoot: "/profile/fps-runtime/r2-0123456789/wine",
    environment: context.environment,
  });
  expect(wine.executionContext).toBe(context);
});
it.each(["/selected/wine\n", "/profile/fps-runtime/r2-0123456789/wine\nextra"])(
  "rejects unpublished or malformed preparation output %s",
  async stdOut => {
    vi.mocked(exec).mockResolvedValue({ stdOut } as never);
    await expect(prepareR2Wine(input())).rejects.toThrow("Unknown R2");
    expect(createWine).not.toHaveBeenCalled();
  }
);
it("does not prepare or select a runtime when the original Wine wait fails", async () => {
  const wine = input();
  vi.mocked(wine.waitUntilServerOff).mockRejectedValue(
    Error("lifetime unknown")
  );
  await expect(prepareR2Wine(wine)).rejects.toThrow("lifetime unknown");
  expect(exec).not.toHaveBeenCalled();
  expect(createWine).not.toHaveBeenCalled();
});
it("cleanup refuses the installed runtime", async () => {
  await expect(disposeR2Wine(input())).rejects.toThrow("Refusing unknown");
  expect(exec).not.toHaveBeenCalled();
});
