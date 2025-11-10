# SSH Test Helper

Standalone SSH test helper that works with or without Home Assistant. Helps you quickly test SSH connectivity (port and public key configuration).

## Features
- **Standalone**: Built on Alpine 3.22 with s6-overlay (no Home Assistant base image dependency)
- Configure SSH port and username via add-on options (or environment variables for standalone use)
- Provide a public SSH key via options (or the add-on generates a temporary key for testing)
- Privileged initialization (user, keys, config) runs in `cont-init.d` as root; runtime `sshd` runs unprivileged
- Multi-arch: amd64, arm64, armv7

## Options
- `ssh_port` (int): SSH port to listen on (default: 22)
- `user_pubkey` (string): Public key to authorize for root user. If omitted, the add-on generates a temporary key and prints it in the log.

## Usage

### As Home Assistant Add-on
1. Copy this folder into your local add-ons directory (e.g. `/addons/ssh-test`).
2. In Home Assistant, go to Settings → Add-ons → Add-on Store → three dots → Repositories → Add local path (or use "My Addons").
3. Install the "SSH Test Helper" add-on.
4. Set options (port, username, public key) and start the add-on.
5. Check the add-on logs to see the effective configuration and any generated key.

### Standalone (Docker)
```bash
docker run -d \
  --name ssh-test \
  -p 2222:22 \
  ghcr.io/modbus2mqtt/ssh-test-helper:latest
```

With custom port and public key via `/data/options.json`:
```bash
mkdir -p data
echo '{"ssh_port": 22, "user_pubkey": "ssh-ed25519 AAAA..."}' > data/options.json
docker run -d --name ssh-test -p 2222:22 -v $(pwd)/data:/data ghcr.io/modbus2mqtt/ssh-test-helper:latest
```

## Connect via SSH
```bash
ssh -p <ssh_port> root@<home-assistant-host>
```

If `host_network` is disabled, expose the port and connect accordingly.

## Architecture
The add-on separates privileged setup from runtime:

1. `/etc/cont-init.d/10-configure-sshd` (runs as root) creates user, writes `authorized_keys`, generates host keys, and writes `sshd_config` with the selected port.
2. `/etc/services.d/sshd/run` starts `sshd` in the foreground without performing any privileged actions.

This pattern keeps initialization secure and auditable while minimizing runtime privileges.

## Building the Image

```bash
cd homeassistant-addon/ssh-test

# Build locally for testing
./build.sh

# Build and push to registry (requires GitHub token and permissions)
./build.sh --push latest
```

## Notes
- **SSH access is configured for root user only**
- Password logins are disabled; only public key authentication is allowed
- Root login is set to prohibit-password (key-based access only)
- Temporary key generation only occurs when no key is provided; replace it promptly in production-like tests
- The add-on runs `sshd` in the foreground and shows logs in the add-on log view
- Built on Alpine 3.22 with s6-overlay 3.2.0.0 for proper init/lifecycle management
