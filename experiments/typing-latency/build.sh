#!/bin/sh
set -eu
case "${1-}" in before|after) ;; *) echo 'Expected before or after' >&2; exit 1 ;; esac
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root/output/typing-latency-$1/source"
export CARGO_TARGET_DIR="$root/target"
cleanup() { cargo clean --release -p typstographe-core >/dev/null 2>&1; }
trap cleanup EXIT
cargo clean --release -p typstographe-core
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  cargo build --release --locked --offline -p "typstographe-typing-latency-$1" --features recipe-driver -j 2
