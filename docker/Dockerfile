FROM ghcr.io/hassio-addons/base:18.2.1
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
RUN apk add --update --no-cache git py3-psutil \   
    openssh-client npm
COPY rootfs ./rootfs
RUN cp -R ./rootfs/* /
RUN npm init -y && \
    npm install modbus2mqtt

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

