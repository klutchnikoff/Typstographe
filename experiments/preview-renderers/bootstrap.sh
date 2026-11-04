#!/bin/sh
set -eu
# Matching published renderer and Rust format, never upstream HEAD.
revision=e1974e566ba63dcf8ecdd6730cff25de26c7dbd2
mkdir -p output/preview-renderers
if [ ! -d output/preview-renderers/release-source ]; then
  git init output/preview-renderers/release-source
  git -C output/preview-renderers/release-source fetch --depth=1 https://github.com/Myriad-Dreamin/typst.ts.git "$revision"
  git -C output/preview-renderers/release-source checkout --detach FETCH_HEAD
fi
mkdir -p output/preview-renderers/frontend
cp experiments/preview-renderers/dependencies/package.json output/preview-renderers/frontend/package.json
cp experiments/preview-renderers/dependencies/package-lock.json output/preview-renderers/frontend/package-lock.json
npm --prefix output/preview-renderers/frontend ci --ignore-scripts
python3 experiments/preview-renderers/prepare.py
