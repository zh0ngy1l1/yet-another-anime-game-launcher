# R2 runtime preparation inputs

This directory supplies the narrow current-protection correction for Wine's
Rosetta executable-page helper. It does not contain a Wine distribution.

`delta.json` pins the entire 620,688-byte input and output, the loader and
wineserver, and all 44 changed bytes. Thirteen code bytes select current
`Protect` and map the executable base while retaining modifiers. The other 31
bytes reproduce the already verified ad-hoc signature. End-user preparation
does not compile or sign Wine. It verifies the complete output and its signature.

- Input: `f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`
- Output: `eef64f611ae9033261a70f46ec0be38d58823717f14e80331946c6d0cd3c85f7`
- Public base: Wine 11.0 signed with patches, archive SHA-256
  `4ebba536115e937c3826fa5808dbed50cd5e91c8454999b54cbe0cd2a43d8b4c`.

The source correction and downstream overlay are included. `provenance.json`
identifies the Wine 11.0 source, pinned downstream revision, source hashes,
instruction equivalence and prior source-application checks. The correction was
recovered from legacy commit `b77fb00af2d72aee0ef89473692b7f469de6715e` and verified
against retained original and R2 artifacts. No legacy deployment scripts are used.
Wine is LGPL-2.1-or-later; its license is included. This is an exact binary
derivative with reviewed source correspondence, not a full reproducible Wine build.

`prepare-r2.pl`, compiled into the frontend, creates a unique APFS copy under
the selected application's `fps-runtime` directory. It validates source/copy
inventories, internal links and independent file inodes, applies the pinned
delta only to exact original bytes, and commits a receipt before returning the
new runtime path. Existing exact R2 bytes are copied and verified without another
patch. Unsupported bytes stop the launch before game mutation. Interrupted
copies are never selected or reused. Preparation never writes the source runtime.

Normal cleanup waits for owned processes and restores journaled files before
removing the private runtime. Saved backend choices, prefix and environment
remain selected. FPS-disabled launches do not prepare R2.

Finite 60/120/150 gameplay observations support this correction. Unchecked
protection-call failures, independent mapping/lifetime races and a separate
shutdown-thread diagnostic remain limitations. See [operator guidance](../../docs/fps-runtime.md).
