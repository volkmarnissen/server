#!/bin/sh
set -e
export PACKAGER="Volkmar Nissen <volkmar.nissen@example.com>"
# Optional: Set version manually (otherwise taken from package.json)
: "${PKG_VERSION:=$(node -p require\(\'./package.json\'\).version)}"
export PKG_VERSION
# Set your private key here (from abuild-keygen)
PACKAGER_PRIVKEY_STR="$HOME/.abuild/builder-6904805d.rsa"
export PACKAGER_PRIVKEY_STR
docker run --rm -it \
  -v "$PWD":/work \
  -w /work \
  -e PACKAGER="$PACKAGER" \
  -e PKG_VERSION="$PKG_VERSION" \
  -e PACKAGER_PRIVKEY="$PACKAGER_PRIVKEY_STR" \
  alpine:3.22 /bin/sh -c 
  "
    apk add --no-cache abuild alpine-sdk nodejs npm git shadow openssl doas &&
    mkdir /etc/doas.d && 
    echo "permit nopass :dialout as root" > /etc/doas.d/doas.conf  &&
    # create builder user with same uid/gid so Dateien auf Host korrekt geschrieben werden
    adduser -D -u $(id -u) -G dialout builder || true &&
    adduser -D -u 501 -G dialout builder || true &&
    addgroup  builder abuild &&
    # prepare home for builder
    mkdir -p /home/builder && chown builder:dialout /home/builder &&
    # run remainder as builder
    echo \"$PACKAGER_PRIVKEY_STR\" > /home/builder/.abuild/builder-6904805d.rsa &&
    su - builder -s /bin/sh -c '
      set -e
      # pass PKG_VERSION von this script to builder environment
      export PKG_VERSION='$PKG_VERSION'
      cd /work
      ls
      # initial key generation (interaktive Eingabe überspringen mit -n)
      #abuild-keygen -a -i -n
      export PACKAGER_PRIVKEY=/home/builder/.abuild/builder-6904805d.rsa
      # optional: wenn du lokale Quelldateien nutzt, evtl. checksummen erzeugen:
      abuild checksum || true
      # build the package (sign and produce .apk)
      abuild -r
    '
"