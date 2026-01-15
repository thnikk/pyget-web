#!/bin/bash
# MPV launcher for pyget-web (Qutebrowser compatible)
# Extracts path from mpv://localhost/ URL and plays with MPV

URL="$1"

echo "Received URL: $URL"

# Remove mpv:// prefix if present
if [[ "$URL" == mpv://* ]]; then
    FILEPATH="${URL#mpv://}"
    echo "Removed mpv:// prefix: $FILEPATH"
else
    FILEPATH="$URL"
fi

# Remove localhost/ if present (Qutebrowser format)
if [[ "$FILEPATH" == localhost* ]]; then
    FILEPATH="${FILEPATH#localhost/}"
    echo "Removed localhost/ prefix: $FILEPATH"
fi

# URL decode the path
FILEPATH=$(echo "$FILEPATH" | sed 's/%2F/\//g' | sed 's/%5B/[/g' | sed 's/%5D/]/g' | sed 's/%20/ /g')

echo "Final decoded path: $FILEPATH"
echo "Launching MPV with: $FILEPATH"
exec mpv "$FILEPATH"