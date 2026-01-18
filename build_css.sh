#!/bin/bash
set -euo pipefail

FILES=(
  "css/styles.css"
  "css/mobile/mobile-styles.css"
)

for INPUT in "${FILES[@]}"; do
  BASE_DIR="$(dirname "$INPUT")"
  TMP="$INPUT.tmp"
  > "$TMP"

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"

    if [[ "$line" =~ @import[[:space:]]+url\([\'\"]?([^\'\"\)]+)[\'\"]?\) ]]; then
      IMPORT="${BASH_REMATCH[1]}"
      IMPORT="${IMPORT//$'\r'/}"

      # only inline local relative imports
      if [[ "$IMPORT" =~ ^https?:// ]] || [[ "$IMPORT" =~ ^// ]] || [[ "$IMPORT" =~ ^/ ]]; then
        echo "$line" >> "$TMP"
        continue
      fi

      IMPORT_PATH="$BASE_DIR/$IMPORT"
      if [[ -f "$IMPORT_PATH" ]]; then
        echo "Inlining: $IMPORT_PATH"
        cat "$IMPORT_PATH" >> "$TMP"
        echo "" >> "$TMP"
      else
        echo "Warning: $IMPORT_PATH not found!" >&2
      fi
    else
      echo "$line" >> "$TMP"
    fi
  done < "$INPUT"

  mv "$TMP" "$INPUT"
  echo "$(basename "$INPUT") building complete"
done

