#!/usr/bin/env bash

# pull latest repo
git reset --hard
git pull

# generate the build ID
echo "'"${GITHUB_SHA}"'" > build.txt 

# combine css into one file
chmod +x ./build_css.sh 
./build_css.sh 

# add cache busters to all imports
chmod +x ./add_cache_busters.sh 
./add_cache_busters.sh

# compress JS with uglifyjs
chmod +x ./compress_js.sh 
./compress_js.sh
