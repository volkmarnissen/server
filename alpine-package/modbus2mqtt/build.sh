#!/bin/bash
set -eu
# build.sh
# Containerized abuild flow for macOS/Linux hosts.
# Expects the following environment variables (caller / CI):
# - PACKAGER_PRIVKEY : full private abuild key (multi-line)
# - PACKAGER_PUBKEY  : public abuild key (multi-line)
# - (optional) PKG_VERSION : package version; defaults to package.json via node
BASEDIR=$(dirname "$0")
mkdir -p "$BASEDIR/work"

if [ -z "${PACKAGER_PRIVKEY:-}" ] || [ -z "${PACKAGER_PUBKEY:-}" ]; then
  echo "ERROR: PACKAGER_PRIVKEY and PACKAGER_PUBKEY must be set in the environment" >&2
  exit 2
fi

: "${PKG_VERSION:=$(node -p "require('../../package.json').version")}" || true
export PKG_VERSION
echo version: $PKG_VERSION
HOST_UID=$(id -u)
HOST_GID=$(id -g)
PACKAGE="$BASEDIR/../../alpine-repo"
mkdir -p "$PACKAGE"
docker run --rm -i \
  -v "$BASEDIR":/work \
  -w /work \
  -v "$PACKAGE":/package \
  -w /package \
  -e PACKAGER="Volkmar Nissen <volkmar.nissen@example.com>" \
  -e PKG_VERSION="$PKG_VERSION" \
  -e PACKAGER_PRIVKEY \
  -e PACKAGER_PUBKEY \
  -e HOST_UID="$HOST_UID" \
  -e HOST_GID="$HOST_GID" \
  alpine:3.22 /bin/sh -s <<'IN'
set -e 
# Probe a list of Alpine repo versions and pick the first reachable one.
# This avoids hardcoding a single (possibly unavailable) mirror while preventing
# using an overly old release. We prefer recent stable versions and fall back
# to edge if necessary.
VERSIONS="v3.22 v3.21 v3.20 v3.19 v3.18 edge"
success=0
for v in $VERSIONS; do
  cat > /etc/apk/repositories <<-REPO
https://dl-cdn.alpinelinux.org/alpine/$v/main
https://dl-cdn.alpinelinux.org/alpine/$v/community
REPO
  # try update; if successful, keep this repo
  if apk update >/dev/null 2>&1; then
    echo "Using alpine repo $v"
    success=1
    break
  fi
done
if [ "$success" -ne 1 ]; then
  echo "ERROR: no alpine repositories reachable (tried: $VERSIONS)" >&2
  exit 1
fi

# Install build deps inside the container
apk add --no-cache abuild alpine-sdk nodejs npm git shadow openssl doas
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

# write abuild keys from env into builder home
mkdir -p /home/builder/.abuild
printf '%s' "$PACKAGER_PRIVKEY" > /home/builder/.abuild/builder-6904805d.rsa
printf '%s' "$PACKAGER_PUBKEY" > /home/builder/.abuild/builder-6904805d.rsa.pub
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
    echo "Copying produced packages to /package"
    ARCH=`uname -m`
    rm -f "/package/$ARCH"/modbus2mqtt*.apk || true
    cp -aR /home/builder/packages/* /package/ || true
    chown -R '"$(id -u):$(id -g)"' /package/ || true
  fi
  '
IN

echo "build.sh finished; produced packages"
