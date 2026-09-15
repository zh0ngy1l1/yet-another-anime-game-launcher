#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
npm exec --yes --package=node@16.20.2 --package=pnpm@7.33.7 --call 'node scripts/build-macos.cjs'
