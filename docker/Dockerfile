ARG ALPINE_VERSION=3.20 
FROM node:alpine$ALPINE_VERSION
ARG ALPINE_VERSION
EXPOSE 3000
ARG DL=http://nl.alpinelinux.org/alpine/v$ALPINE_VERSION
WORKDIR /usr/app
# We need to install @modbus2mqtt/server because 
# @serialport/bindings-cpp might need recompilation. 
# Otherwise one could use npx @modbus2mqtt/server directly
RUN echo '{}' >package.json && \
    npm install --omit-dev @modbus2mqtt/server && \
    apk --print-arch && \
    alpineArch="$(apk --print-arch)" && \
    apk add  --update --no-cache git && \
    if [ "x86_64" != "${alpineArch}"  ];then \
    apk update && \
    apk upgrade && \
    echo -e "$DL/main\n${DL}/community" > /etc/apk/repositories && \
    apk add  --update --no-cache g++ make build-base linux-headers udev py3-pip  && \
    npm rebuild @serialport/bindings-cpp --build-from-source; \
    fi
CMD ["npx", "modbus2mqtt", "--ssl", "/ssl", "--yaml", "/data"]
