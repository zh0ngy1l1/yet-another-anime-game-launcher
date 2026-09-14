import { waitImageReady } from "./utils/helper";

// The launcher explicitly marks CSS artwork used by its initial DOM. Decode
// those exact resources and retain them through native readiness. Video may
// continue loading over the prepared static poster; no hidden paint is needed.
export async function prepareBootstrapArtwork(root: HTMLElement) {
  const urls = new Set(
    Array.from(root.querySelectorAll<HTMLElement>("[data-bootstrap-image]"))
      .map(element => element.getAttribute("data-bootstrap-image"))
      .filter((url): url is string => !!url)
  );
  const images = await Promise.all(Array.from(urls, waitImageReady));
  return () => {
    images.length = 0;
  };
}
