#!/usr/bin/env bash
set -euo pipefail

# Service run script (s6 services.d): keep minimal, no privileged setup here
# sshd will run in the foreground

exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config
