#!/usr/bin/env bash

# If an argument is provided, use it as the cache-buster.
# Otherwise, default to ?v=<epoch_timestamp>
if [ -n "$1" ]; then
  CACHE_BUSTER="$1"
else
  CACHE_BUSTER="?v=$(date +%s)"
fi

echo "Using cache-buster: $CACHE_BUSTER"

############################################
# 1) Update ./index.html (VortexEditor.js)
############################################
# Example: change
#   <script type="module" src="js/VortexEditor.js"></script>
# to
#   <script type="module" src="js/VortexEditor.js?v=abc123"></script>
sed -i.bak "s|src=\"js/VortexEditor.js\"|src=\"js/VortexEditor.js$CACHE_BUSTER\"|g" ./index.html
rm -f ./index.html.bak


############################################
# 2) Update all CSS in ./css/*.css
############################################
# a) Append cache-buster to any @import url('something.css')
# b) Replace __CACHE_BUSTER__ placeholders with $CACHE_BUSTER

for cssFile in ./css/*.css; do
  # Append ?v=... to @import references
  # Matches: @import url('something.css')  or  @import url("something.css")
  # Replaces with: @import url('something.css?v=abc123')
  sed -i.bak "s|\(@import[[:space:]]\+url([\"'][^\"']*\.css\)|\1$CACHE_BUSTER|g" "$cssFile"

  # Replace any manual placeholders __CACHE_BUSTER__
  sed -i.bak "s|__CACHE_BUSTER__|$CACHE_BUSTER|g" "$cssFile"

  rm -f "$cssFile.bak"
done


############################################
# 3) Update all JS in ./js/*.js except VortexLib.js
############################################
# a) Append cache-buster to import statements:
#       import Something from './Something.js';
#    becomes
#       import Something from './Something.js?v=abc123';
# b) Replace __CACHE_BUSTER__ placeholders with $CACHE_BUSTER

for jsFile in ./js/*.js; do
  # Skip VortexLib.js
  if [[ "$jsFile" == *"VortexLib.js" ]]; then
    continue
  fi

  # Append ?v=... to ES import statements.
  # This will look for: import ... from "<anything>.js"
  # and change it to:   import ... from "<anything>.js?v=abc123"
  sed -i.bak "s|\(\import[[:space:]][^;]* from[[:space:]]*[\"'][^\"']*\.js\)\([\"']\)|\1$CACHE_BUSTER\2|g" "$jsFile"

  # Replace any manual placeholders __CACHE_BUSTER__
  sed -i.bak "s|__CACHE_BUSTER__|'$CACHE_BUSTER'|g" "$jsFile"

  rm -f "$jsFile.bak"
done

echo "Cache-busting complete."

