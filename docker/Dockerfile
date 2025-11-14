ARG ALPINE_VERSION=3.22
FROM alpine:${ALPINE_VERSION}

# Build arguments
ARG BUILD_DATE
ARG BUILD_DESCRIPTION="modbus2mqtt Docker Image"
ARG BUILD_NAME="modbus2mqtt"
ARG BUILD_REF="modbus2mqtt"
ARG BUILD_REPOSITORY="modbus2mqtt"
ARG BUILD_VERSION
ARG BUILD_ARCH

# Set environment variables during the build process
ENV BUILD_DATE=${BUILD_DATE}
ENV BUILD_DESCRIPTION=${BUILD_DESCRIPTION}
ENV BUILD_NAME=${BUILD_NAME}
ENV BUILD_REF=${BUILD_REF}
ENV BUILD_REPOSITORY=${BUILD_REPOSITORY}
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_ARCH=${BUILD_ARCH}
WORKDIR /

# Install jq (used by SSH init script to parse /data/options.json); wget is in base image
RUN apk add --no-cache jq wget

# Copy produced packages (expect build scripts to have created repo)
COPY ./alpine/repo/ /tmp/alpine-repo/
# required by homeassistant s6-overlay
COPY ./docker/service /usr/bin/service
# Ensure public key is copied (workaround for Docker COPY behavior with root files)
COPY ./alpine/repo/packager.rsa.pub /tmp/alpine-repo/packager.rsa.pub
# Install APK with strict signature verification (no untrusted fallback)
RUN set -e; \
    ARCH="$BUILD_ARCH"; \
    # Map Docker platform architecture to Alpine APK architecture \
    case "$ARCH" in \
        x86_64) APK_ARCH="x86_64" ;; \
        aarch64|arm64) APK_ARCH="aarch64" ;; \
        *) echo "ERROR: Unsupported architecture: $ARCH" >&2; exit 1 ;; \
    esac; \
    echo "Container arch: $ARCH, APK arch: $APK_ARCH"; \
    \
    # Use architecture-independent public key from repo root \
    KEY="/tmp/alpine-repo/packager.rsa.pub"; \
    APK="/tmp/alpine-repo/${APK_ARCH}/modbus2mqtt-*.apk"; \
    \
    # Check if key and APK exist \
    if [ ! -f "$KEY" ]; then \
        echo "ERROR: public key $KEY not found" >&2; \
        echo "Available files in /tmp/alpine-repo:" >&2; \
        ls -la /tmp/alpine-repo/ || true; \
        exit 1; \
    fi; \
    if ! ls $APK >/dev/null 2>&1; then \
        echo "ERROR: APK files $APK not found" >&2; \
        echo "Available APK files:" >&2; \
        find /tmp/alpine-repo -name "*.apk" -type f || true; \
        exit 1; \
    fi; \
    \
    # Install the APK \
    cp "$KEY" /etc/apk/keys/builder-6904805d.rsa.pub; \
    apk add --no-cache $APK; \
    echo "✓ Installed modbus2mqtt via trusted APK with signature verification";

# Copy SSH configuration script as oneshot service
COPY ./docker/rootfs/ /

# Create service
RUN mkdir -p /var/lib/modbus2mqtt/.config/git && \
    chown -R modbus2mqtt:dialout /var/lib/modbus2mqtt && \
    chmod -R 755 /var/lib/modbus2mqtt 

# SSH configuration is done by:
# 1. APK post-install: creates /root/.ssh, configures sshd_config, generates host keys
# 2. cont-init script: reads /data/options.json and configures authorized_keys

EXPOSE 3000 22

# Start service using s6-overlay
CMD ["/init"] 

# Health check
HEALTHCHECK --start-period=10m \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000 || exit 1
# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION} \
    maintainer="Volkmar Nissen <volkmar.nissen@gmail.com>" \
    org.opencontainers.image.title="${BUILD_NAME}" \
    org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
    org.opencontainers.image.vendor="Carcam 360" \
    org.opencontainers.image.authors="Volkmar Nissen <volkmar.nissen@gmail.com>" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/modbus2mqtt/hassio-addon-repository" \
    org.opencontainers.image.source="https://github.com/${BUILD_REPOSITORY}" \
    org.opencontainers.image.documentation="https://github.com/${BUILD_REPOSITORY}/blob/main/README.md" \
    org.opencontainers.image.created=${BUILD_DATE} \
    org.opencontainers.image.revision=${BUILD_REF} \
    org.opencontainers.image.version=${BUILD_VERSION} 

