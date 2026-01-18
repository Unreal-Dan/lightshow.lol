#!/usr/bin/env bash

# pull latest repo
git reset --hard
git pull

# generate the build ID
echo "'"${GITHUB_SHA}"'" > build.txt 

# get directory of deploy script
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

scripts=(
  # combine css into one file
  "build_css.sh"
  # add cache busters to all imports
  "add_cache_busters.sh"
  # compress JS with uglifyjs
  "compress_js.sh"
  # compress CSS with uglifycss
  "compress_css.sh"
)

# run each script
for script in "${scripts[@]}"; do
  chmod +x -- "$SCRIPT_DIR/$script"
  "$SCRIPT_DIR/$s"
done
