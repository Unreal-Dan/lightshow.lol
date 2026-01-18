#!/usr/bin/env bash

echo "Compressing js..."

for jsFile in ./js/*.js; do
  # Skip VortexLib.js
  if [[ "$jsFile" == *"VortexLib.js" ]]; then
    continue
  fi
  # compress the JS
  uglifyjs --compress -- $jsFile > $jsFile.bak
  # deploy compressed file
  mv $jsFile.bak $jsFile
done

# also do the mobile js files
for jsFile in ./js/mobile/*.js; do
  # Skip VortexLib.js
  if [[ "$jsFile" == *"VortexLib.js" ]]; then
    continue
  fi
  # compress the JS
  uglifyjs --compress -- $jsFile > $jsFile.bak
  # deploy compressed file
  mv $jsFile.bak $jsFile
done

echo "Done compressing JS"
