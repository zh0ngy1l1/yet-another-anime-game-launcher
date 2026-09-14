import { afterEach, expect, it, vi } from "vitest";
import { prepareBootstrapArtwork } from "./bootstrap-artwork";
import { waitImageReady } from "./utils/helper";
import { deferred } from "./utils/operation";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("installs load handlers before cached src completion and still awaits decode", async () => {
  const decoded = deferred<void>();
  const image = {
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
    set src(_url: string) {
      expect(this.onload).toBeTypeOf("function");
      expect(this.onerror).toBeTypeOf("function");
      this.onload?.();
    },
    decode: vi.fn(() => decoded.promise),
  };
  vi.stubGlobal(
    "Image",
    vi.fn(() => image)
  );
  let completed = false;
  const ready = waitImageReady("fixture.png").then(value => {
    completed = true;
    return value;
  });
  await Promise.resolve();
  expect(image.decode).toHaveBeenCalledOnce();
  expect(completed).toBe(false);
  decoded.resolve();
  expect(await ready).toBe(image);
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
});

it("prepares each required CSS artwork URL once and retains it until release", async () => {
  const loaded: string[] = [];
  const Image = vi.fn(() => ({
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
    set src(url: string) {
      loaded.push(url);
      this.onload?.();
    },
    decode: vi.fn(async () => undefined),
  }));
  vi.stubGlobal("Image", Image);
  const root = {
    querySelectorAll: vi.fn(() =>
      ["background", "theme", "logo", "icon", "background", "", null].map(
        url => ({
          getAttribute: () => url,
        })
      )
    ),
  };
  const release = await prepareBootstrapArtwork(root as unknown as HTMLElement);
  expect(root.querySelectorAll).toHaveBeenCalledWith("[data-bootstrap-image]");
  expect(loaded).toEqual(["background", "theme", "logo", "icon"]);
  expect(Image).toHaveBeenCalledTimes(4);
  expect(release).toBeTypeOf("function");
  release();
  release();
});
