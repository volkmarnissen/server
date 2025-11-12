#!/bin/sh
# arch-utils.sh
# Shared utilities for modbus2mqtt Alpine builds
# Usage: source this file to get access to the functions

# Detect Alpine version from local Node.js installation
# Sets: ALPINE_VERSION, NODE_MAJOR
detect_alpine_version() {
    if [ -n "${ALPINE_VERSION:-}" ]; then
        echo "Using ALPINE_VERSION from environment: $ALPINE_VERSION"
        return 0
    fi
    
    # Determine Alpine version from local Node.js version
    NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "")
    if [ -z "$NODE_MAJOR" ]; then
        echo "ERROR: Could not determine local Node.js version (node not in PATH). Set ALPINE_VERSION explicitly." >&2
        return 1
    fi
    
    case "$NODE_MAJOR" in
        22) ALPINE_VERSION="3.22" ;;
        20) ALPINE_VERSION="3.20" ;;
        18) ALPINE_VERSION="3.18" ;;
        *)
            echo "ERROR: Unsupported Node.js major '$NODE_MAJOR'. Supported: 22, 20, 18. Set ALPINE_VERSION explicitly." >&2
            return 1
            ;;
    esac
    
    export ALPINE_VERSION
    export NODE_MAJOR
    
    echo "Alpine version detection:"
    echo "  Node.js major: $NODE_MAJOR"
    echo "  Alpine version: $ALPINE_VERSION"
}

# Find and set repository root
# Sets: REPO_ROOT (absolute path to repository root)
# Usage: find_repo_root /path/to/current/script
find_repo_root() {
    script_path="${1}"
    if [ -z "$script_path" ]; then
        echo "ERROR: find_repo_root requires script path as argument" >&2
        return 1
    fi
    
    script_dir="$(dirname "$(readlink -f "$script_path")")"
    
    # Navigate up from script directory to find package.json
    current_dir="$script_dir"
    while [ "$current_dir" != "/" ] && [ ! -f "$current_dir/package.json" ]; do
        current_dir="$(dirname "$current_dir")"
    done
    
    if [ ! -f "$current_dir/package.json" ]; then
        echo "ERROR: Could not find repository root (package.json not found)" >&2
        return 1
    fi
    
    REPO_ROOT="$current_dir"
    export REPO_ROOT
}

# Persist Alpine version to build metadata file
# Usage: persist_alpine_version /path/to/build/dir
persist_alpine_version() {
    build_dir="${1:-build}"
    mkdir -p "$build_dir"
    printf 'ALPINE_VERSION=%s\n' "$ALPINE_VERSION" > "$build_dir/alpine.env"
    echo "✓ Alpine version persisted to $build_dir/alpine.env"
}