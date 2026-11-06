#!/bin/sh
set -eu
case "${1-}" in before|after) ;; *) echo 'Expected before or after' >&2; exit 1 ;; esac
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root/output/source-sync-$1/source"
export CARGO_TARGET_DIR="$root/target"
# Binaries are statically linked. Leave no instrumented core library behind for
# a later production build sharing this target directory, even on failure.
cleanup() { cargo clean --release -p typstographe-core >/dev/null 2>&1; }
trap cleanup EXIT
# Keep third-party dependencies. Archived mtimes cannot safely distinguish two
# local copies in a shared target, so rebuild this local core explicitly.
cargo clean --release -p typstographe-core
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  cargo build --release --locked --offline -p "typstographe-source-sync-$1" --features recipe-driver -j 2
