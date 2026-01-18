#!/usr/bin/env bash

echo "Compressing css..."

for cssFile in ./css/*.css; do
  echo "Compressing $cssFile..."
  # compress the JS
  uglifycss --compress -- $cssFile > $cssFile.bak
  # deploy compressed file
  mv $cssFile.bak $cssFile
done

# also do the mobile css files
for cssFile in ./css/mobile/*.css; do
  echo "Compressing $cssFile..."
  # compress the JS
  uglifycss --compress -- $cssFile > $cssFile.bak
  # deploy compressed file
  mv $cssFile.bak $cssFile
done

echo "Done compressing CSS"
