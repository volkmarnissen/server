#!/usr/bin/env bash
# Format nur die übergebenen Dateien und zeige nur geänderte an
if [ "$#" -eq 0 ]; then
	set -- **/*.{ts,js,css,html,tsx}
fi
echo "Running prettier on files: $*" >&2
prettier --write "$@" 2>&1 | grep -E 'modified|formatted' || true
