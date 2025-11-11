#!/bin/bash
set -eu
# build.sh
# Containerized abuild flow for macOS/Linux hosts.
# Expects the following environment variables (caller / CI):
# - PACKAGER_PRIVKEY : full private abuild key (multi-line)
# - (optional) PKG_VERSION : package version; defaults to package.json via node
BASEDIR=$(dirname "$0")
cd "$BASEDIR"
if [ -z "${PACKAGER_PRIVKEY:-}" ]; then
  echo "ERROR: PACKAGER_PRIVKEY must be set in the environment" >&2
  exit 2
fi

: "${PKG_VERSION:=$(node -p "require('../../../package.json').version")}" || true
export PKG_VERSION
echo version: "$PKG_VERSION"

# Set target architecture - can be overridden by environment variable
: "${TARGET_ARCH:=$(uname -m)}"
export TARGET_ARCH
echo "Target architecture: $TARGET_ARCH"

# Determine Alpine version strictly from local Node.js if not provided
if [ -z "${ALPINE_VERSION:-}" ]; then
  NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "")
  if [ -z "$NODE_MAJOR" ]; then
    echo "ERROR: Could not determine local Node.js version (node not in PATH). Set ALPINE_VERSION explicitly." >&2
    exit 3
  fi
  case "$NODE_MAJOR" in
    22) ALPINE_VERSION="3.22" ;;
    20) ALPINE_VERSION="3.20" ;;
    18) ALPINE_VERSION="3.18" ;;
    *)
      echo "ERROR: Unsupported Node.js major '$NODE_MAJOR'. Supported: 22, 20, 18. Set ALPINE_VERSION explicitly." >&2
      exit 4
    ;;
  esac
fi
export ALPINE_VERSION
echo "Using Alpine ${ALPINE_VERSION} (from Node.js major ${NODE_MAJOR:-unknown})"

# Persist chosen Alpine version for downstream scripts
mkdir -p "$BASEDIR/build"
printf 'ALPINE_VERSION=%s\n' "$ALPINE_VERSION" > "$BASEDIR/build/alpine.env"

HOST_UID=$(id -u)
HOST_GID=$(id -g)
PACKAGE="$BASEDIR/../../repo"
mkdir -p "$PACKAGE"

# Prepare npm cache directory on host to speed up repeated builds
CACHE_DIR="$BASEDIR/build/npm-cache"
mkdir -p "$CACHE_DIR"
docker run --rm -i \
  -v "$BASEDIR":/work \
  -w /work \
  -v "$PACKAGE":/package \
  -w /package \
  -v "$CACHE_DIR":/home/builder/.npm \
  -e PACKAGER="Volkmar Nissen <volkmar.nissen@example.com>" \
  -e PKG_VERSION="$PKG_VERSION" \
  -e PACKAGER_PRIVKEY \
  -e HOST_UID="$HOST_UID" \
  -e HOST_GID="$HOST_GID" \
  -e ALPINE_VERSION="$ALPINE_VERSION" \
  -e TARGET_ARCH="${TARGET_ARCH}" \
  -e NPM_CONFIG_CACHE="/home/builder/.npm" \
  -e npm_config_cache="/home/builder/.npm" \
  alpine:"$ALPINE_VERSION" /bin/sh -s <<'IN'
set -e 
# Use ALPINE_VERSION provided by host
ALPINE_REPO_VER="v${ALPINE_VERSION}"
cat > /etc/apk/repositories <<-REPO
https://dl-cdn.alpinelinux.org/alpine/${ALPINE_REPO_VER}/main
https://dl-cdn.alpinelinux.org/alpine/${ALPINE_REPO_VER}/community
REPO
if ! apk update >/dev/null 2>&1; then
  echo "ERROR: failed to use alpine repositories for ${ALPINE_REPO_VER}" >&2
  exit 1
fi

# Install build deps inside the container (suppress progress output)
echo "Installing build dependencies..."
apk add --no-cache abuild alpine-sdk nodejs npm git shadow openssl doas >/dev/null 2>&1
mkdir -p /etc/doas.d
echo 'permit nopass :dialout as root' > /etc/doas.d/doas.conf || true

# ensure dialout group exists with host GID (best-effort)
if ! getent group dialout >/dev/null 2>&1; then
  addgroup -g "${HOST_GID}" dialout >/dev/null 2>&1 || true
fi

# create builder user with host uid so produced files keep host ownership
adduser -D -u "${HOST_UID}" -G dialout builder || true
addgroup builder abuild || true
mkdir -p /home/builder
chown builder:dialout /home/builder || true
mkdir -p /home/builder/.npm
chown -R builder:dialout /home/builder/.npm || true

# write abuild keys from env into builder home
mkdir -p /home/builder/.abuild
printf '%s' "$PACKAGER_PRIVKEY" > /home/builder/.abuild/builder-6904805d.rsa
# Derive public key from private key
echo "Generating public key from private key..."
if openssl rsa -in /home/builder/.abuild/builder-6904805d.rsa -pubout -out /home/builder/.abuild/builder-6904805d.rsa.pub 2>/dev/null; then
  echo "✓ Public key generated successfully"
else
  echo "ERROR: Failed to generate public key from private key" >&2
  openssl rsa -in /home/builder/.abuild/builder-6904805d.rsa -pubout -out /home/builder/.abuild/builder-6904805d.rsa.pub 2>&1 || true
  exit 1
fi
chmod 600 /home/builder/.abuild/builder-6904805d.rsa || true
chown -R builder:dialout /home/builder/.abuild || true
cp /home/builder/.abuild/builder-6904805d.rsa.pub /etc/apk/keys || true
rm -rf "/home/builder/packages" || true
# create abuild.conf so abuild knows which key to use
cat > /home/builder/.abuild/abuild.conf <<-EOF
PACKAGER_PRIVKEY="/home/builder/.abuild/builder-6904805d.rsa"
PACKAGER_PUBKEY="/home/builder/.abuild/builder-6904805d.rsa.pub"
EOF
chmod 600 /home/builder/.abuild/abuild.conf || true
chown builder:dialout /home/builder/.abuild/abuild.conf || true

rm -rf /work/src/node_modules || true
sed -i 's/pkgver=.*/pkgver='"${PKG_VERSION}"'/g' /work/APKBUILD || true
su - builder -s /bin/sh -c '
  set -e
  cd /work
  echo "Building modbus2mqtt APK version $PKG_VERSION"
  # prepare abuild and build package (checksum + build/sign)
  abuild checksum || true
  abuild -r
  # copy produced packages back to mounted workdir
  if [ -d /home/builder/packages ]; then

    rm -f "/package/$TARGET_ARCH/modbus2mqtt*.apk" || true
      cp -aR "/home/builder/packages/$TARGET_ARCH" /package/ || true
    # Place the public signing key into the repo root for architecture-independent access
    if [ -f "/home/builder/.abuild/builder-6904805d.rsa.pub" ]; then
      cp /home/builder/.abuild/builder-6904805d.rsa.pub "/package/packager.rsa.pub"
      echo "✓ Public key copied to /package/packager.rsa.pub (architecture-independent)"
    else
      echo "WARNING: Public key /home/builder/.abuild/builder-6904805d.rsa.pub not found"
      echo "Available files in /home/builder/.abuild/:"
      ls -la /home/builder/.abuild/ || true
    fi
    # Note: File permissions will be handled outside the container
  fi
  '
IN

echo "build.sh finished; produced packages"

# Verify file permissions and ownership for debugging
echo "Verifying package directory permissions..."
if [ -d "$PACKAGE" ]; then
  echo "Package directory contents and permissions:"
  ls -laR "$PACKAGE"
  echo "Current user: $(id -un) ($(id -u))"
  echo "Current group: $(id -gn) ($(id -g))"
else
  echo "WARNING: Package directory $PACKAGE not found"
fi
# Note: Files should have correct ownership thanks to HOST_UID/HOST_GID mapping
