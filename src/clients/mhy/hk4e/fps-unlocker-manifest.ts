/**
 * Size and SHA-256 pin accepted release-asset bytes, not their provenance.
 * The inspected project has not established a reproducible source-to-binary
 * chain. The source commit identifies the inspected tag, not proof that it
 * produced this binary. A third-party GitHub asset can be replaced upstream;
 * it is not an immutable transparency-log record. External provenance
 * approval remains a manual project decision.
 */
export const FPS_UNLOCKER_MANIFEST = Object.freeze({
  repository: "rishabhroyy/genshin-fps-unlock-universal",
  tag: "v3.0.7",
  filename: "unlockfps.exe",
  url: "https://github.com/rishabhroyy/genshin-fps-unlock-universal/releases/download/v3.0.7/unlockfps.exe",
  sourceCommit: "56b9c64381ef9fd59e916dc9bf547d3210ab5db1",
  size: 39661090,
  sha256: "8543f45a4edced854ab8c5466ce2dc2e511fb4f89361bc4dfb474b68d998cc17",
});
