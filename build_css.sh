#!/bin/bash

INPUT_CSS="css/styles.css"
TMP_OUTPUT_CSS="css/styles.css.tmp"
CSS_DIR="css"

# Start with an empty output file
> "$TMP_OUTPUT_CSS"

# Process each line of the input CSS file
while IFS= read -r line; do
    # Match @import url('filename.css')
    if [[ $line =~ @import\ url\(\'.*\.css\'\); ]]; then
        # Extract the filename
        FILE=$(echo "$line" | sed -E "s/@import url\('(.+)'\);/\1/")
        
        # Check if the file exists
        if [[ -f "$CSS_DIR/$FILE" ]]; then
            echo "Inlining: $CSS_DIR/$FILE"
            cat "$CSS_DIR/$FILE" >> "$TMP_OUTPUT_CSS"
            echo "" >> "$TMP_OUTPUT_CSS"  # Add a newline
        else
            echo "Warning: $CSS_DIR/$FILE not found!"
        fi
    else
        # Copy non-import lines directly
        echo "$line" >> "$TMP_OUTPUT_CSS"
    fi
done < "$INPUT_CSS"

# overwrite the original styles.css with the new one
mv $TMP_OUTPUT_CSS $INPUT_CSS
echo "CSS building complete"

