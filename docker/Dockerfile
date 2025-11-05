FROM alpine:3.22
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

# Install runtime and tooling to start service and perform healthchecks
RUN apk add --no-cache s6-overlay nodejs npm curl

# Copy produced packages (expect build.sh to have created ./packages)
COPY ./alpine-repo/ /tmp/alpine-repo/
# Find the produced apk and install it
RUN  ls /tmp/alpine-repo/`uname -m`/modbus2mqtt-*.apk  | while read apk_file; do  apk add --allow-untrusted "$apk_file"; done

# Create service
RUN \
    s6dir=/etc/s6-overlay/s6-rc.d/modbus2mqtt && \
    mkdir -p $s6dir && \
    echo 'longrun' > $s6dir/type && \
    echo '#!/command/with-contenv sh' > $s6dir/run && \
    echo 'exec /usr/bin/modbus2mqtt 2>&1' >> $s6dir/run && \
    chmod +x $s6dir/run && \
    s6usr=/etc/s6-overlay/s6-rc.d/user/contents.d && \
    mkdir -p $s6usr && \
    touch $s6usr/modbus2mqtt && \
    mkdir -p $s6dir/dependencies.d && \
    touch $s6dir/dependencies.d/base && \  
    echo '#!/bin/sh' >$s6dir/finish && \
    echo 'echo modbus2mqtt done' >>$s6dir/finish && \
    chmod +x $s6dir/finish 

EXPOSE 3000

# Start service using s6-overlay
CMD ["/init"] 

# Health check
HEALTHCHECK --start-period=10m \
    CMD curl --fail http://127.0.0.1:3000 || exit 1
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

