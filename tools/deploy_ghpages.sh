#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

# generate the build ID (prefer CI-provided SHA, else current repo HEAD)
BUILD_SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
printf "'%s'\n" "$BUILD_SHA" > "$REPO_ROOT/build.txt"

scripts=(
  "build_css.sh"
  "add_cache_busters.sh"
  "compress_js.sh"
  "compress_css.sh"
)

# run each build script
for script in "${scripts[@]}"; do
  chmod +x -- "$SCRIPT_DIR/$script"
  "$SCRIPT_DIR/$script"
done

