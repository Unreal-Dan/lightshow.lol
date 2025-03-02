#!/bin/bash

INPUT_CSS="css/styles.css"
TMP_OUTPUT_CSS="css/styles.css.tmp"
CSS_DIR="css"

# Start with an empty output file
> "$TMP_OUTPUT_CSS"

# Process each line of the input CSS file
while IFS= read -r line; do
    # Match @import url('filename.css')
    if [[ $line =~ @import[[:space:]]+url\([\'\"]?([^\'\"\)]+)[\'\"]?\) ]]; then
        # Extract the filename
        FILE="${BASH_REMATCH[1]}"
        FILE_CLEAN="${FILE//$'\r'/}"  # Remove any carriage returns

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

# Overwrite the original styles.css with the new one
mv "$TMP_OUTPUT_CSS" "$INPUT_CSS"
echo "CSS building complete"

