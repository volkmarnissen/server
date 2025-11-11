FROM alpine:3.22

# Install s6-overlay (multi-arch detection)
ARG S6_OVERLAY_VERSION=3.2.0.0
ARG TARGETARCH

RUN case "${TARGETARCH}" in \
      amd64)   S6_ARCH="x86_64" ;; \
      arm64)   S6_ARCH="aarch64" ;; \
      arm/v7)  S6_ARCH="armhf" ;; \
      *)       echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    wget -qO- "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" | tar -Jxpf - -C / && \
    wget -qO- "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" | tar -Jxpf - -C /

# Install openssh and utilities
RUN apk add --no-cache openssh bash jq shadow

# Prepare directories for s6-overlay services and sshd
RUN mkdir -p /var/run/sshd /root/.ssh \
	&& chmod 700 /root/.ssh \
	&& mkdir -p /etc/cont-init.d /etc/services.d/sshd

# Copy init and service scripts
COPY 10-configure-sshd.sh /etc/cont-init.d/10-configure-sshd
COPY service-run.sh /etc/services.d/sshd/run
RUN chmod +x /etc/cont-init.d/10-configure-sshd /etc/services.d/sshd/run

# Expose default port (actual port is set via options and sshd_config)
EXPOSE 22

# s6-overlay entrypoint
ENTRYPOINT ["/init"]
