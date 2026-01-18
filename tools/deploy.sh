#!/usr/bin/env bash

# pull latest repo
git reset --hard
git pull

# generate the build ID
echo "'"${GITHUB_SHA}"'" > build.txt 

# combine css into one file
chmod +x ./tools/build_css.sh 
./tools/build_css.sh 

# add cache busters to all imports
chmod +x ./tools/add_cache_busters.sh 
./tools/add_cache_busters.sh

# compress JS with uglifyjs
chmod +x ./tools/compress_js.sh 
./tools/compress_js.sh
