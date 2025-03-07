#!/bin/bash

CSS_DIR="css"
FILES=("styles.css" "mobile-styles.css")

for FILE in "${FILES[@]}"; do
    INPUT_CSS="$CSS_DIR/$FILE"
    TMP_OUTPUT_CSS="$INPUT_CSS.tmp"

    # Start with an empty output file
    > "$TMP_OUTPUT_CSS"

    # Process each line of the input CSS file
    while IFS= read -r line; do
        # Match @import url('filename.css')
        if [[ $line =~ @import[[:space:]]+url\([\'\"]?([^\'\"\)]+)[\'\"]?\) ]]; then
            # Extract the filename
            IMPORTED_FILE="${BASH_REMATCH[1]}"
            FILE_CLEAN="${IMPORTED_FILE//$'\r'/}"  # Remove any carriage returns

            # Check if the file exists in the expected directory
            if [[ -f "$CSS_DIR/$FILE_CLEAN" ]]; then
                echo "Inlining: $CSS_DIR/$FILE_CLEAN"
                cat "$CSS_DIR/$FILE_CLEAN" >> "$TMP_OUTPUT_CSS"
                echo "" >> "$TMP_OUTPUT_CSS"  # Add a newline
            else
                echo "Warning: $CSS_DIR/$FILE_CLEAN not found!"
            fi
        else
            # Copy non-import lines directly
            echo "$line" >> "$TMP_OUTPUT_CSS"
        fi
    done < "$INPUT_CSS"

    # Overwrite the original file with the new one
    mv "$TMP_OUTPUT_CSS" "$INPUT_CSS"
    echo "$FILE building complete"
done

