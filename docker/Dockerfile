ARG ALPINE_VERSION=3.22
FROM alpine:${ALPINE_VERSION}

# Build arguments
ARG BUILD_DATE
ARG BUILD_DESCRIPTION="modbus2mqtt Docker Image"
ARG BUILD_NAME="modbus2mqtt"
ARG BUILD_REF="modbus2mqtt"
ARG BUILD_REPOSITORY="modbus2mqtt"
ARG BUILD_VERSION

# Set environment variables during the build process
ENV BUILD_DATE=${BUILD_DATE}
ENV BUILD_DESCRIPTION=${BUILD_DESCRIPTION}
ENV BUILD_NAME=${BUILD_NAME}
ENV BUILD_REF=${BUILD_REF}
ENV BUILD_REPOSITORY=${BUILD_REPOSITORY}
ENV BUILD_VERSION=${BUILD_VERSION}

WORKDIR /usr/app

# Install jq (used by SSH init script to parse /data/options.json); wget is in base image
RUN apk add --no-cache jq

# Copy produced packages (expect build scripts to have created repo)
COPY ./alpine/repo/ /tmp/alpine-repo/
# Install APK with strict signature verification (no untrusted fallback)
RUN set -e; \
    ARCH="$(uname -m)"; \
    KEY="/tmp/alpine-repo/${ARCH}/packager.rsa.pub"; \
    APK="/tmp/alpine-repo/${ARCH}/modbus2mqtt-*.apk"; \
    if [ ! -f "$KEY" ]; then echo "ERROR: public key $KEY not found" >&2; exit 1; fi; \
    cp "$KEY" /etc/apk/keys/builder-6904805d.rsa.pub; \
    apk add --no-cache $APK; \
    echo "✓ Installed modbus2mqtt via trusted APK with signature verification";

# Copy SSH configuration script as oneshot service
RUN mkdir -p /etc/s6-overlay/s6-rc.d/ssh-init /etc/s6-overlay/scripts
COPY ./docker/01-configure-ssh.sh /etc/s6-overlay/scripts/configure-ssh.sh
RUN chmod +x /etc/s6-overlay/scripts/configure-ssh.sh && \
    echo 'oneshot' > /etc/s6-overlay/s6-rc.d/ssh-init/type && \
    echo '#!/command/execlineb -P' > /etc/s6-overlay/s6-rc.d/ssh-init/up && \
    echo '/etc/s6-overlay/scripts/configure-ssh.sh' >> /etc/s6-overlay/s6-rc.d/ssh-init/up && \
    chmod +x /etc/s6-overlay/s6-rc.d/ssh-init/up && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/ssh-init

# Ensure application directories exist and have correct ownership
RUN mkdir -p /config /data /ssl && \
    chown -R modbus2mqtt:dialout /config /data /ssl

# Create home directory for modbus2mqtt user (git needs it)
RUN mkdir -p /var/lib/modbus2mqtt/.config/git && \
    chown -R modbus2mqtt:dialout /var/lib/modbus2mqtt

# Create service
RUN \
    s6dir=/etc/s6-overlay/s6-rc.d/modbus2mqtt && \
    mkdir -p $s6dir && \
    echo 'longrun' > $s6dir/type && \
    echo '#!/command/with-contenv sh' > $s6dir/run && \
    echo 'cd /data || { echo "ERROR: Cannot access /data directory"; exit 1; }' >> $s6dir/run && \
    echo 'export HOME=/var/lib/modbus2mqtt' >> $s6dir/run && \
    echo 'exec s6-setuidgid modbus2mqtt /usr/bin/modbus2mqtt 2>&1' >> $s6dir/run && \
    chmod +x $s6dir/run && \
    s6usr=/etc/s6-overlay/s6-rc.d/user/contents.d && \
    mkdir -p $s6usr && \
    touch $s6usr/modbus2mqtt && \
    mkdir -p $s6dir/dependencies.d && \
    touch $s6dir/dependencies.d/base && \  
    echo '#!/bin/sh' >$s6dir/finish && \
    echo 'echo modbus2mqtt done' >>$s6dir/finish && \
    chmod +x $s6dir/finish

# SSH configuration is done by:
# 1. APK post-install: creates /root/.ssh, configures sshd_config, generates host keys
# 2. cont-init script: reads /data/options.json and configures authorized_keys

# Create SSH service for s6-overlay
RUN \
    sshdir=/etc/s6-overlay/s6-rc.d/sshd && \
    mkdir -p $sshdir && \
    echo 'longrun' > $sshdir/type && \
    echo '#!/command/with-contenv sh' > $sshdir/run && \
    echo 'exec /usr/sbin/sshd -D -e 2>&1' >> $sshdir/run && \
    chmod +x $sshdir/run && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/sshd && \
    mkdir -p $sshdir/dependencies.d && \
    touch $sshdir/dependencies.d/base

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
    io.hass.version=${BUILD_VERSION}  \  
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

