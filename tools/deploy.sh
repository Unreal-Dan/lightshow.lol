#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename -- "${BASH_SOURCE[0]}")"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

# Update to latest origin/main (and relaunch this script if it changed)
if [[ "${_AUTOUPDATED_ONCE:-0}" != "1" ]]; then
  git -C "$REPO_ROOT" fetch --prune origin main

  LOCAL_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  REMOTE_SHA="$(git -C "$REPO_ROOT" rev-parse origin/main)"

  if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
    git -C "$REPO_ROOT" reset --hard "$REMOTE_SHA"
    export _AUTOUPDATED_ONCE=1
    exec "$SCRIPT_PATH" "$@"
  fi
fi

# generate the build ID (prefer CI-provided SHA, else current repo HEAD)
BUILD_SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
printf "'%s'\n" "$BUILD_SHA" > "$REPO_ROOT/build.txt"

scripts=(
  "build_css.sh"
  "add_cache_busters.sh"
  "compress_js.sh"
  "compress_css.sh"
)

for script in "${scripts[@]}"; do
  chmod +x -- "$SCRIPT_DIR/$script"
  "$SCRIPT_DIR/$script"
done

